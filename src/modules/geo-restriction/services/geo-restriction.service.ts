import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeoRestriction, GeoRestrictionMode } from '../../../database/entities/geo-restriction.entity';
import { RedisService } from '../../redis/redis.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { GeoIpLookupService } from './geoip-lookup.service';
import { UpdateGeoRestrictionDto } from '../dto/update-geo-restriction.dto';
import {
  GeoRestrictionResponseDto,
  GeoTestResponseDto,
  GeoBlockedAttemptDto,
  GeoIpDatabaseInfoDto,
} from '../dto/geo-restriction-response.dto';
import { COUNTRY_LIST } from '../constants/country-codes';

/**
 * Service for managing geo-restriction configuration and enforcement.
 *
 * Key responsibilities:
 * - CRUD operations for geo-restriction configuration (one per workspace)
 * - Country validation against ISO 3166-1 alpha-2 codes
 * - Geo-check on API requests using GeoIP lookup
 * - Redis caching for geo-restriction config (performance on every request)
 * - Blocked attempt logging to Redis sorted set
 *
 * Cache strategy:
 * - Key: `geo_config:{workspaceId}` -> JSON of active config
 * - TTL: 300 seconds (5 minutes)
 * - Invalidated on any config change
 *
 * Blocked attempts:
 * - Key: `geo_blocked:{workspaceId}` -> Redis sorted set (score = timestamp)
 * - Max 100 entries per workspace (trimmed on insert)
 * - TTL: 86400 seconds (24 hours)
 *
 * Fail-open policy:
 * - If GeoIP database is unavailable, all requests are allowed (with warning log)
 * - If country lookup fails for a specific IP, the request is allowed (with warning log)
 * - VPN/proxy detection is NOT performed (too many false positives per epic spec)
 */
@Injectable()
export class GeoRestrictionService {
  private readonly logger = new Logger(GeoRestrictionService.name);
  private readonly CONFIG_CACHE_PREFIX = 'geo_config:';
  private readonly BLOCKED_PREFIX = 'geo_blocked:';
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly BLOCKED_TTL = 86400; // 24 hours
  private readonly MAX_BLOCKED_ATTEMPTS = 100;
  private readonly MAX_COUNTRIES = 250;

  constructor(
    @InjectRepository(GeoRestriction)
    private readonly geoRestrictionRepository: Repository<GeoRestriction>,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
    private readonly geoIpLookupService: GeoIpLookupService,
  ) {}

  // ==================== CONFIG OPERATIONS ====================

  /**
   * Get or create the geo-restriction configuration for a workspace.
   */
  async getConfig(workspaceId: string, userId: string): Promise<GeoRestrictionResponseDto> {
    let config = await this.geoRestrictionRepository.findOne({ where: { workspaceId } });
    if (!config) {
      config = this.geoRestrictionRepository.create({
        workspaceId,
        mode: GeoRestrictionMode.BLOCKLIST,
        countries: [],
        isActive: false,
        logOnly: false,
        createdBy: userId,
        lastModifiedBy: null,
      });
      config = await this.geoRestrictionRepository.save(config);
    }
    return GeoRestrictionResponseDto.fromEntity(config);
  }

  /**
   * Update geo-restriction configuration for a workspace.
   * Validates country codes and enforces max countries limit.
   */
  async updateConfig(
    workspaceId: string,
    userId: string,
    dto: UpdateGeoRestrictionDto,
  ): Promise<GeoRestrictionResponseDto> {
    let config = await this.geoRestrictionRepository.findOne({ where: { workspaceId } });
    if (!config) {
      config = this.geoRestrictionRepository.create({
        workspaceId,
        createdBy: userId,
      });
    }

    const beforeState = {
      mode: config.mode,
      countries: [...(config.countries || [])],
      isActive: config.isActive,
      logOnly: config.logOnly,
    };

    // Validate country codes if provided
    if (dto.countries !== undefined) {
      this.validateCountryCodes(dto.countries);
      if (dto.countries.length > this.MAX_COUNTRIES) {
        throw new BadRequestException(`Maximum ${this.MAX_COUNTRIES} countries allowed`);
      }
      // Deduplicate
      config.countries = [...new Set(dto.countries)];
    }

    if (dto.mode !== undefined) {
      config.mode = dto.mode;
    }

    if (dto.isActive !== undefined) {
      config.isActive = dto.isActive;
    }

    if (dto.logOnly !== undefined) {
      config.logOnly = dto.logOnly;
    }

    config.lastModifiedBy = userId;
    const saved = await this.geoRestrictionRepository.save(config);
    await this.invalidateConfigCache(workspaceId);

    // Audit log
    this.auditService
      .log(workspaceId, userId, AuditAction.UPDATE, 'geo_restriction', saved.id, {
        action: 'geo_restriction_updated',
        before: beforeState,
        after: {
          mode: saved.mode,
          countries: saved.countries,
          isActive: saved.isActive,
          logOnly: saved.logOnly,
        },
      })
      .catch(() => {});

    return GeoRestrictionResponseDto.fromEntity(saved);
  }

  // ==================== GEO CHECK (Used by GeoRestrictionGuard) ====================

  /**
   * Check if a client IP is allowed based on geo-restriction rules.
   * This is the hot-path method called on every API request when
   * geo-restriction is active.
   *
   * Flow:
   * 1. Get config from cache/DB -> if not active, allow
   * 2. Look up country from IP via GeoIP
   * 3. If lookup fails, allow (fail-open)
   * 4. Check country against allowlist/blocklist
   * 5. If log-only mode, allow but log
   *
   * @returns { allowed: boolean; detectedCountry: string | null; reason?: string }
   */
  async checkGeo(
    workspaceId: string,
    clientIp: string,
  ): Promise<{ allowed: boolean; detectedCountry: string | null; reason?: string }> {
    // 1. Get config (cache-first)
    const config = await this.getCachedConfig(workspaceId);
    if (!config || !config.isActive) {
      return { allowed: true, detectedCountry: null, reason: 'geo_not_active' };
    }

    // 2. GeoIP lookup
    const detectedCountry = this.geoIpLookupService.lookup(clientIp);

    // 3. Fail-open: if lookup returns null, allow
    if (!detectedCountry) {
      this.logger.warn(
        `GeoIP lookup returned null for IP=${clientIp} in workspace=${workspaceId}. Allowing access (fail-open).`,
      );
      return { allowed: true, detectedCountry: null, reason: 'geo_lookup_failed' };
    }

    // 4. Check country against list
    const countryInList = config.countries.includes(detectedCountry);
    let isAllowed: boolean;

    if (config.mode === GeoRestrictionMode.ALLOWLIST) {
      // Allow only listed countries
      isAllowed = countryInList;
    } else {
      // Block listed countries
      isAllowed = !countryInList;
    }

    // 5. Log-only mode: allow but mark reason
    if (!isAllowed && config.logOnly) {
      return {
        allowed: true,
        detectedCountry,
        reason: 'log_only_would_deny',
      };
    }

    if (isAllowed) {
      return { allowed: true, detectedCountry };
    }

    return {
      allowed: false,
      detectedCountry,
      reason: config.mode === GeoRestrictionMode.ALLOWLIST
        ? 'country_not_in_allowlist'
        : 'country_in_blocklist',
    };
  }

  /**
   * Test if the current request IP would be allowed.
   */
  async testGeo(workspaceId: string, clientIp: string): Promise<GeoTestResponseDto> {
    const config = await this.geoRestrictionRepository.findOne({ where: { workspaceId } });
    const detectedCountry = this.geoIpLookupService.lookup(clientIp);
    const geoIpAvailable = this.geoIpLookupService.isDatabaseAvailable();

    if (!config || !config.isActive) {
      return {
        ipAddress: clientIp,
        detectedCountry,
        isAllowed: true,
        isActive: config?.isActive ?? false,
        isLogOnly: config?.logOnly ?? false,
        geoIpAvailable,
        reason: 'geo_not_active',
      };
    }

    let isAllowed = true;
    let reason: string | null = null;

    if (detectedCountry) {
      const countryInList = config.countries.includes(detectedCountry);
      if (config.mode === GeoRestrictionMode.ALLOWLIST) {
        isAllowed = countryInList;
        if (!isAllowed) reason = 'country_not_in_allowlist';
      } else {
        isAllowed = !countryInList;
        if (!isAllowed) reason = 'country_in_blocklist';
      }
    } else {
      reason = geoIpAvailable ? 'geo_lookup_failed' : 'geoip_database_unavailable';
    }

    return {
      ipAddress: clientIp,
      detectedCountry,
      isAllowed: config.logOnly ? true : isAllowed,
      isActive: config.isActive,
      isLogOnly: config.logOnly,
      geoIpAvailable,
      reason,
    };
  }

  // ==================== BLOCKED ATTEMPTS ====================

  /**
   * Record a geo-blocked attempt in Redis sorted set.
   */
  async recordBlockedAttempt(
    workspaceId: string,
    clientIp: string,
    userId: string | null,
    detectedCountry: string | null,
    endpoint: string,
  ): Promise<void> {
    try {
      const key = `${this.BLOCKED_PREFIX}${workspaceId}`;
      const timestamp = Date.now();
      const value = JSON.stringify({
        ipAddress: clientIp,
        userId,
        detectedCountry,
        endpoint,
        timestamp: new Date(timestamp).toISOString(),
      });

      await this.redisService.zadd(key, timestamp, value);
      await this.redisService.zremrangebyrank(key, 0, -(this.MAX_BLOCKED_ATTEMPTS + 1));
      await this.redisService.expire(key, this.BLOCKED_TTL);
    } catch (error) {
      this.logger.warn(`Failed to record geo-blocked attempt for workspace=${workspaceId}`);
    }
  }

  /**
   * Get recent geo-blocked attempts for a workspace.
   */
  async getBlockedAttempts(workspaceId: string, limit: number = 100): Promise<GeoBlockedAttemptDto[]> {
    const safeLimitValue = Math.min(Math.max(1, limit), this.MAX_BLOCKED_ATTEMPTS);
    try {
      const key = `${this.BLOCKED_PREFIX}${workspaceId}`;
      const rawEntries = await this.redisService.zrevrange(key, 0, safeLimitValue - 1);
      return rawEntries.map((raw: string) => {
        const parsed = JSON.parse(raw);
        return {
          ipAddress: parsed.ipAddress ?? '',
          userId: parsed.userId ?? null,
          detectedCountry: parsed.detectedCountry ?? null,
          timestamp: parsed.timestamp ?? '',
          endpoint: parsed.endpoint ?? '',
        } as GeoBlockedAttemptDto;
      });
    } catch (error) {
      this.logger.warn(`Failed to get geo-blocked attempts for workspace=${workspaceId}`);
      return [];
    }
  }

  // ==================== GEO DATABASE INFO ====================

  /**
   * Get GeoIP database status and metadata.
   */
  getDatabaseInfo(): GeoIpDatabaseInfoDto {
    return this.geoIpLookupService.getDatabaseInfo();
  }

  // ==================== COUNTRY LIST ====================

  /**
   * Return the full list of ISO 3166-1 alpha-2 country codes with names.
   * Used by the frontend country picker.
   */
  getCountryList(): Array<{ code: string; name: string }> {
    return COUNTRY_LIST;
  }

  // ==================== VALIDATION ====================

  /**
   * Validate that all provided country codes are valid ISO 3166-1 alpha-2 codes.
   */
  private validateCountryCodes(codes: string[]): void {
    const validCodes = new Set(COUNTRY_LIST.map((c) => c.code));
    const invalidCodes = codes.filter((code) => !validCodes.has(code));
    if (invalidCodes.length > 0) {
      throw new BadRequestException(
        `Invalid country codes: ${invalidCodes.join(', ')}. Must be valid ISO 3166-1 alpha-2 codes.`,
      );
    }
  }

  // ==================== REDIS CACHING ====================

  private async getCachedConfig(workspaceId: string): Promise<{
    isActive: boolean;
    mode: GeoRestrictionMode;
    countries: string[];
    logOnly: boolean;
  } | null> {
    try {
      const key = `${this.CONFIG_CACHE_PREFIX}${workspaceId}`;
      const cached = await this.redisService.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Cache miss or error, fall through to DB
    }

    const config = await this.geoRestrictionRepository.findOne({ where: { workspaceId } });
    if (!config) return null;

    const data = {
      isActive: config.isActive,
      mode: config.mode,
      countries: config.countries,
      logOnly: config.logOnly,
    };

    // Cache (fire-and-forget)
    try {
      const key = `${this.CONFIG_CACHE_PREFIX}${workspaceId}`;
      await this.redisService.set(key, JSON.stringify(data), this.CACHE_TTL);
    } catch {
      // Ignore cache write failures
    }

    return data;
  }

  private async invalidateConfigCache(workspaceId: string): Promise<void> {
    try {
      await this.redisService.del(`${this.CONFIG_CACHE_PREFIX}${workspaceId}`);
    } catch {
      this.logger.warn(`Failed to invalidate geo config cache for workspace=${workspaceId}`);
    }
  }
}
