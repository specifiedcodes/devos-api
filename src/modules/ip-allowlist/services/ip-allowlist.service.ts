import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as net from 'net';
import { IpAllowlistEntry } from '../../../database/entities/ip-allowlist-entry.entity';
import { IpAllowlistConfig } from '../../../database/entities/ip-allowlist-config.entity';
import { RedisService } from '../../redis/redis.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { CreateIpEntryDto } from '../dto/create-ip-entry.dto';
import { UpdateIpEntryDto } from '../dto/update-ip-entry.dto';
import { IpEntryResponseDto, IpConfigResponseDto, IpTestResponseDto, BlockedAttemptDto } from '../dto/ip-entry-response.dto';

/**
 * Service for managing IP allowlist entries and configuration.
 *
 * Key responsibilities:
 * - CRUD operations for IP allowlist entries
 * - Enable/disable IP allowlisting per workspace
 * - Grace period management (24h after enabling)
 * - Emergency disable (1h bypass for owners)
 * - Redis caching for allowlist lookups (performance on every request)
 * - IP matching including CIDR range support
 * - Blocked attempt logging to Redis sorted set
 *
 * Cache strategy:
 * - Key: `ip_allowlist:{workspaceId}` -> JSON array of active IP entries
 * - TTL: 300 seconds (5 minutes)
 * - Invalidated on any entry/config change
 *
 * Blocked attempts:
 * - Key: `ip_blocked:{workspaceId}` -> Redis sorted set (score = timestamp)
 * - Max 100 entries per workspace (trimmed on insert)
 * - TTL: 86400 seconds (24 hours)
 */
@Injectable()
export class IpAllowlistService {
  private readonly logger = new Logger(IpAllowlistService.name);
  private readonly CACHE_PREFIX = 'ip_allowlist:';
  private readonly BLOCKED_PREFIX = 'ip_blocked:';
  private readonly CONFIG_PREFIX = 'ip_config:';
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly BLOCKED_TTL = 86400; // 24 hours
  private readonly MAX_ENTRIES_PER_WORKSPACE = 100;
  private readonly MAX_BLOCKED_ATTEMPTS = 100;
  private readonly GRACE_PERIOD_HOURS = 24;
  private readonly EMERGENCY_DISABLE_HOURS = 1;

  constructor(
    @InjectRepository(IpAllowlistEntry)
    private readonly entryRepository: Repository<IpAllowlistEntry>,
    @InjectRepository(IpAllowlistConfig)
    private readonly configRepository: Repository<IpAllowlistConfig>,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

  // ==================== CONFIG OPERATIONS ====================

  /**
   * Get or create the IP allowlist configuration for a workspace.
   */
  async getConfig(workspaceId: string): Promise<IpConfigResponseDto> {
    let config = await this.configRepository.findOne({ where: { workspaceId } });
    if (!config) {
      config = this.configRepository.create({
        workspaceId,
        isEnabled: false,
        gracePeriodEndsAt: null,
        emergencyDisableUntil: null,
      });
      config = await this.configRepository.save(config);
    }

    const now = new Date();
    return {
      workspaceId: config.workspaceId,
      isEnabled: config.isEnabled,
      gracePeriodEndsAt: config.gracePeriodEndsAt,
      emergencyDisableUntil: config.emergencyDisableUntil,
      isInGracePeriod: config.gracePeriodEndsAt ? now < config.gracePeriodEndsAt : false,
      isEmergencyDisabled: config.emergencyDisableUntil ? now < config.emergencyDisableUntil : false,
    };
  }

  /**
   * Enable or disable IP allowlisting for a workspace.
   * When enabling:
   * - Starts a 24-hour grace period (log-only, no blocking)
   * - Auto-adds the caller's current IP to the allowlist
   * When disabling:
   * - Clears grace period and emergency disable timers
   */
  async updateConfig(
    workspaceId: string,
    userId: string,
    isEnabled: boolean,
    callerIp: string,
  ): Promise<IpConfigResponseDto> {
    let config = await this.configRepository.findOne({ where: { workspaceId } });
    if (!config) {
      config = this.configRepository.create({ workspaceId });
    }

    const wasEnabled = config.isEnabled;
    config.isEnabled = isEnabled;
    config.lastModifiedBy = userId;

    if (isEnabled && !wasEnabled) {
      // Enabling: set grace period
      const gracePeriodEnd = new Date();
      gracePeriodEnd.setHours(gracePeriodEnd.getHours() + this.GRACE_PERIOD_HOURS);
      config.gracePeriodEndsAt = gracePeriodEnd;
      config.emergencyDisableUntil = null;

      // Auto-add caller's IP if not already in allowlist
      const existingEntry = await this.entryRepository.findOne({
        where: { workspaceId, ipAddress: callerIp },
      });
      if (!existingEntry) {
        await this.createEntry(workspaceId, userId, {
          ipAddress: callerIp,
          description: 'Auto-added: Admin IP on enablement',
        });
      }
    } else if (!isEnabled) {
      // Disabling: clear timers
      config.gracePeriodEndsAt = null;
      config.emergencyDisableUntil = null;
    }

    await this.configRepository.save(config);
    await this.invalidateConfigCache(workspaceId);

    // Audit log
    this.auditService
      .log(
        workspaceId,
        userId,
        isEnabled ? AuditAction.CREATE : AuditAction.DELETE,
        'ip_allowlist_config',
        workspaceId,
        {
          action: isEnabled ? 'ip_allowlist_enabled' : 'ip_allowlist_disabled',
          wasEnabled,
          gracePeriodEndsAt: config.gracePeriodEndsAt?.toISOString() ?? null,
        },
      )
      .catch(() => {});

    return this.getConfig(workspaceId);
  }

  /**
   * Emergency disable IP allowlisting for 1 hour (owner only).
   * Allows recovery if the allowlist locks out all admins.
   */
  async emergencyDisable(workspaceId: string, userId: string): Promise<IpConfigResponseDto> {
    const config = await this.configRepository.findOne({ where: { workspaceId } });
    if (!config || !config.isEnabled) {
      throw new BadRequestException('IP allowlisting is not enabled for this workspace');
    }

    const disableUntil = new Date();
    disableUntil.setHours(disableUntil.getHours() + this.EMERGENCY_DISABLE_HOURS);
    config.emergencyDisableUntil = disableUntil;
    config.lastModifiedBy = userId;
    await this.configRepository.save(config);
    await this.invalidateConfigCache(workspaceId);

    this.auditService
      .log(workspaceId, userId, AuditAction.UPDATE, 'ip_allowlist_config', workspaceId, {
        action: 'emergency_disable',
        disableUntil: disableUntil.toISOString(),
      })
      .catch(() => {});

    this.logger.warn(
      `Emergency IP allowlist disable for workspace=${workspaceId} by user=${userId} until ${disableUntil.toISOString()}`,
    );

    return this.getConfig(workspaceId);
  }

  // ==================== ENTRY CRUD OPERATIONS ====================

  /**
   * List all IP allowlist entries for a workspace.
   */
  async listEntries(workspaceId: string): Promise<IpEntryResponseDto[]> {
    const entries = await this.entryRepository.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
    return entries.map(IpEntryResponseDto.fromEntity);
  }

  /**
   * Create a new IP allowlist entry.
   * Validates: IP format, CIDR range, duplicate detection, max entries limit.
   */
  async createEntry(
    workspaceId: string,
    userId: string,
    dto: CreateIpEntryDto,
  ): Promise<IpEntryResponseDto> {
    // 1. Validate IP/CIDR format
    this.validateIpOrCidr(dto.ipAddress);

    // 2. Check max entries limit
    const count = await this.entryRepository.count({ where: { workspaceId } });
    if (count >= this.MAX_ENTRIES_PER_WORKSPACE) {
      throw new BadRequestException(
        `Maximum ${this.MAX_ENTRIES_PER_WORKSPACE} IP allowlist entries per workspace`,
      );
    }

    // 3. Check for duplicate
    const existing = await this.entryRepository.findOne({
      where: { workspaceId, ipAddress: dto.ipAddress },
    });
    if (existing) {
      throw new ConflictException(
        `IP address ${dto.ipAddress} already exists in the allowlist`,
      );
    }

    // 4. Create entry
    const entry = this.entryRepository.create({
      workspaceId,
      ipAddress: dto.ipAddress,
      description: dto.description,
      isActive: true,
      createdBy: userId,
    });
    const saved = await this.entryRepository.save(entry);
    await this.invalidateEntryCache(workspaceId);

    // 5. Audit log
    this.auditService
      .log(workspaceId, userId, AuditAction.CREATE, 'ip_allowlist_entry', saved.id, {
        ipAddress: saved.ipAddress,
        description: saved.description,
      })
      .catch(() => {});

    return IpEntryResponseDto.fromEntity(saved);
  }

  /**
   * Update an existing IP allowlist entry.
   */
  async updateEntry(
    workspaceId: string,
    entryId: string,
    userId: string,
    dto: UpdateIpEntryDto,
  ): Promise<IpEntryResponseDto> {
    const entry = await this.entryRepository.findOne({
      where: { id: entryId, workspaceId },
    });
    if (!entry) {
      throw new NotFoundException('IP allowlist entry not found');
    }

    const beforeState = { ipAddress: entry.ipAddress, description: entry.description, isActive: entry.isActive };

    if (dto.ipAddress !== undefined) {
      this.validateIpOrCidr(dto.ipAddress);
      // Check duplicate on IP change
      if (dto.ipAddress !== entry.ipAddress) {
        const existing = await this.entryRepository.findOne({
          where: { workspaceId, ipAddress: dto.ipAddress },
        });
        if (existing) {
          throw new ConflictException(`IP address ${dto.ipAddress} already exists in the allowlist`);
        }
      }
      entry.ipAddress = dto.ipAddress;
    }
    if (dto.description !== undefined) {
      entry.description = dto.description;
    }
    if (dto.isActive !== undefined) {
      entry.isActive = dto.isActive;
    }

    const saved = await this.entryRepository.save(entry);
    await this.invalidateEntryCache(workspaceId);

    this.auditService
      .log(workspaceId, userId, AuditAction.UPDATE, 'ip_allowlist_entry', entryId, {
        before: beforeState,
        after: { ipAddress: saved.ipAddress, description: saved.description, isActive: saved.isActive },
      })
      .catch(() => {});

    return IpEntryResponseDto.fromEntity(saved);
  }

  /**
   * Delete an IP allowlist entry.
   */
  async deleteEntry(workspaceId: string, entryId: string, userId: string): Promise<void> {
    const entry = await this.entryRepository.findOne({
      where: { id: entryId, workspaceId },
    });
    if (!entry) {
      throw new NotFoundException('IP allowlist entry not found');
    }

    await this.entryRepository.remove(entry);
    await this.invalidateEntryCache(workspaceId);

    this.auditService
      .log(workspaceId, userId, AuditAction.DELETE, 'ip_allowlist_entry', entryId, {
        ipAddress: entry.ipAddress,
        description: entry.description,
      })
      .catch(() => {});
  }

  // ==================== IP CHECK (Used by IpAllowlistGuard) ====================

  /**
   * Check if an IP address is allowed for a workspace.
   * This is the hot-path method called on every API request
   * when IP allowlisting is enabled.
   *
   * Flow:
   * 1. Check config cache -> if not enabled, allow
   * 2. Check emergency disable -> if active, allow
   * 3. Check grace period -> if active, allow (but log would-be denials)
   * 4. Check entry cache -> match IP against allowlist
   *
   * @returns { allowed: boolean; inGracePeriod: boolean; reason?: string }
   */
  async checkIp(
    workspaceId: string,
    clientIp: string,
  ): Promise<{ allowed: boolean; inGracePeriod: boolean; reason?: string }> {
    // 1. Get config (cache-first)
    const config = await this.getCachedConfig(workspaceId);
    if (!config || !config.isEnabled) {
      return { allowed: true, inGracePeriod: false };
    }

    const now = new Date();

    // 2. Emergency disable check
    if (config.emergencyDisableUntil && now < new Date(config.emergencyDisableUntil)) {
      return { allowed: true, inGracePeriod: false, reason: 'emergency_disabled' };
    }

    // 3. Get entries (cache-first) and check IP
    const entries = await this.getCachedEntries(workspaceId);
    const isMatched = this.matchIpAgainstEntries(clientIp, entries);

    // 4. Grace period check
    const inGracePeriod = config.gracePeriodEndsAt
      ? now < new Date(config.gracePeriodEndsAt)
      : false;

    if (isMatched) {
      return { allowed: true, inGracePeriod };
    }

    // IP not in allowlist
    if (inGracePeriod) {
      // Grace period: allow but log
      return { allowed: true, inGracePeriod: true, reason: 'grace_period_would_deny' };
    }

    return { allowed: false, inGracePeriod: false, reason: 'ip_not_allowed' };
  }

  /**
   * Test if the current request IP would be allowed.
   */
  async testIp(workspaceId: string, clientIp: string): Promise<IpTestResponseDto> {
    const entries = await this.entryRepository.find({
      where: { workspaceId, isActive: true },
    });
    const config = await this.getConfig(workspaceId);

    let matchedEntry: IpEntryResponseDto | null = null;
    for (const entry of entries) {
      if (this.isIpInRange(clientIp, entry.ipAddress)) {
        matchedEntry = IpEntryResponseDto.fromEntity(entry);
        break;
      }
    }

    return {
      ipAddress: clientIp,
      isAllowed: matchedEntry !== null || !config.isEnabled,
      matchedEntry,
      isGracePeriod: config.isInGracePeriod,
    };
  }

  // ==================== BLOCKED ATTEMPTS ====================

  /**
   * Record a blocked IP attempt in Redis sorted set.
   * Score = timestamp for time-based ordering.
   * Trimmed to MAX_BLOCKED_ATTEMPTS per workspace.
   */
  async recordBlockedAttempt(
    workspaceId: string,
    clientIp: string,
    userId: string | null,
    endpoint: string,
  ): Promise<void> {
    try {
      const key = `${this.BLOCKED_PREFIX}${workspaceId}`;
      const timestamp = Date.now();
      const value = JSON.stringify({ ipAddress: clientIp, userId, endpoint, timestamp: new Date(timestamp).toISOString() });

      await this.redisService.zadd(key, timestamp, value);
      // Trim to keep only most recent entries
      await this.redisService.zremrangebyrank(key, 0, -(this.MAX_BLOCKED_ATTEMPTS + 1));
      await this.redisService.expire(key, this.BLOCKED_TTL);
    } catch (error) {
      this.logger.warn(`Failed to record blocked IP attempt for workspace=${workspaceId}`);
    }
  }

  /**
   * Get recent blocked IP attempts for a workspace.
   */
  async getBlockedAttempts(workspaceId: string, limit: number = 100): Promise<BlockedAttemptDto[]> {
    try {
      const key = `${this.BLOCKED_PREFIX}${workspaceId}`;
      const rawEntries = await this.redisService.zrevrange(key, 0, limit - 1);
      return rawEntries.map((raw: string) => JSON.parse(raw) as BlockedAttemptDto);
    } catch (error) {
      this.logger.warn(`Failed to get blocked attempts for workspace=${workspaceId}`);
      return [];
    }
  }

  // ==================== IP VALIDATION & MATCHING ====================

  /**
   * Validate an IP address or CIDR notation string.
   * Supports IPv4 single IPs and CIDR ranges.
   * Throws BadRequestException if invalid.
   */
  validateIpOrCidr(ip: string): void {
    if (ip.includes('/')) {
      // CIDR notation
      const [addr, prefix] = ip.split('/');
      const prefixNum = parseInt(prefix, 10);

      if (net.isIPv4(addr)) {
        if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) {
          throw new BadRequestException(`Invalid CIDR prefix for IPv4: /${prefix}. Must be 0-32.`);
        }
      } else if (net.isIPv6(addr)) {
        if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 128) {
          throw new BadRequestException(`Invalid CIDR prefix for IPv6: /${prefix}. Must be 0-128.`);
        }
      } else {
        throw new BadRequestException(`Invalid IP address in CIDR notation: ${addr}`);
      }
    } else {
      // Single IP
      if (!net.isIPv4(ip) && !net.isIPv6(ip)) {
        throw new BadRequestException(`Invalid IP address: ${ip}`);
      }
    }
  }

  /**
   * Check if a client IP matches any entry in the allowlist.
   */
  private matchIpAgainstEntries(
    clientIp: string,
    entries: Array<{ ipAddress: string; isActive: boolean }>,
  ): boolean {
    for (const entry of entries) {
      if (!entry.isActive) continue;
      if (this.isIpInRange(clientIp, entry.ipAddress)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a client IP falls within an IP range (single IP or CIDR).
   * Uses bitwise comparison for CIDR matching.
   */
  isIpInRange(clientIp: string, allowedIp: string): boolean {
    if (!allowedIp.includes('/')) {
      // Exact match
      return clientIp === allowedIp;
    }

    // CIDR matching (IPv4 only for now)
    const [rangeAddr, prefixStr] = allowedIp.split('/');
    const prefix = parseInt(prefixStr, 10);

    if (!net.isIPv4(clientIp) || !net.isIPv4(rangeAddr)) {
      // IPv6 CIDR matching would require BigInt - skip for now, exact match only
      return clientIp === rangeAddr;
    }

    const clientNum = this.ipv4ToNumber(clientIp);
    const rangeNum = this.ipv4ToNumber(rangeAddr);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

    return (clientNum & mask) === (rangeNum & mask);
  }

  /**
   * Convert IPv4 address string to 32-bit unsigned integer.
   */
  private ipv4ToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  // ==================== REDIS CACHING ====================

  private async getCachedConfig(workspaceId: string): Promise<{
    isEnabled: boolean;
    gracePeriodEndsAt: string | null;
    emergencyDisableUntil: string | null;
  } | null> {
    try {
      const key = `${this.CONFIG_PREFIX}${workspaceId}`;
      const cached = await this.redisService.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Cache miss or error, fall through to DB
    }

    // Load from DB
    const config = await this.configRepository.findOne({ where: { workspaceId } });
    if (!config) return null;

    const data = {
      isEnabled: config.isEnabled,
      gracePeriodEndsAt: config.gracePeriodEndsAt?.toISOString() ?? null,
      emergencyDisableUntil: config.emergencyDisableUntil?.toISOString() ?? null,
    };

    // Cache (fire-and-forget)
    try {
      const key = `${this.CONFIG_PREFIX}${workspaceId}`;
      await this.redisService.set(key, JSON.stringify(data), this.CACHE_TTL);
    } catch {
      // Ignore cache write failures
    }

    return data;
  }

  private async getCachedEntries(
    workspaceId: string,
  ): Promise<Array<{ ipAddress: string; isActive: boolean }>> {
    try {
      const key = `${this.CACHE_PREFIX}${workspaceId}`;
      const cached = await this.redisService.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Cache miss or error, fall through to DB
    }

    // Load from DB (only active entries for the check path)
    const entries = await this.entryRepository.find({
      where: { workspaceId, isActive: true },
      select: ['ipAddress', 'isActive'],
    });

    const data = entries.map((e) => ({ ipAddress: e.ipAddress, isActive: e.isActive }));

    // Cache (fire-and-forget)
    try {
      const key = `${this.CACHE_PREFIX}${workspaceId}`;
      await this.redisService.set(key, JSON.stringify(data), this.CACHE_TTL);
    } catch {
      // Ignore cache write failures
    }

    return data;
  }

  private async invalidateEntryCache(workspaceId: string): Promise<void> {
    try {
      await this.redisService.del(`${this.CACHE_PREFIX}${workspaceId}`);
    } catch {
      this.logger.warn(`Failed to invalidate IP entry cache for workspace=${workspaceId}`);
    }
  }

  private async invalidateConfigCache(workspaceId: string): Promise<void> {
    try {
      await this.redisService.del(`${this.CONFIG_PREFIX}${workspaceId}`);
    } catch {
      this.logger.warn(`Failed to invalidate IP config cache for workspace=${workspaceId}`);
    }
  }
}
