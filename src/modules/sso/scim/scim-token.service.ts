import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ScimToken } from '../../../database/entities/scim-token.entity';
import { ScimConfiguration } from '../../../database/entities/scim-configuration.entity';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../redis/redis.service';
import { SCIM_CONSTANTS } from '../constants/scim.constants';
import { UpdateScimConfigDto } from '../dto/scim.dto';

@Injectable()
export class ScimTokenService {
  private readonly logger = new Logger(ScimTokenService.name);

  constructor(
    @InjectRepository(ScimToken)
    private readonly scimTokenRepository: Repository<ScimToken>,
    @InjectRepository(ScimConfiguration)
    private readonly scimConfigRepository: Repository<ScimConfiguration>,
    private readonly ssoAuditService: SsoAuditService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Generate a new SCIM bearer token for a workspace.
   * Returns the full plaintext token ONCE. After creation, only the hash is stored.
   * Token format: devos_sc_{random_hex}
   */
  async generateToken(
    workspaceId: string,
    label: string,
    expiresAt: Date | null,
    createdBy: string,
  ): Promise<{ token: string; tokenRecord: ScimToken }> {
    // Generate random token
    const randomBytes = crypto.randomBytes(SCIM_CONSTANTS.TOKEN_BYTES);
    const token = `${SCIM_CONSTANTS.TOKEN_PREFIX}_${randomBytes.toString('hex')}`;

    // Hash token
    const tokenHash = crypto
      .createHash(SCIM_CONSTANTS.TOKEN_HASH_ALGORITHM)
      .update(token)
      .digest('hex');

    // Store token record
    const tokenRecord = this.scimTokenRepository.create({
      workspaceId,
      tokenHash,
      tokenPrefix: token.substring(0, 12),
      label: label || 'Default SCIM Token',
      isActive: true,
      expiresAt,
      createdBy,
    });

    const saved = await this.scimTokenRepository.save(tokenRecord);

    // Log audit event (fire-and-forget)
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SCIM_TOKEN_CREATED,
      actorId: createdBy,
      details: { tokenId: saved.id, label, tokenPrefix: saved.tokenPrefix },
    });

    return { token, tokenRecord: saved };
  }

  /**
   * List all tokens for a workspace (without revealing token values).
   */
  async listTokens(workspaceId: string): Promise<ScimToken[]> {
    return this.scimTokenRepository.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      select: [
        'id', 'workspaceId', 'tokenPrefix', 'label', 'isActive',
        'lastUsedAt', 'expiresAt', 'createdBy', 'createdAt', 'updatedAt',
      ],
    });
  }

  /**
   * Revoke a token by ID.
   * Sets is_active = false. Does not delete.
   */
  async revokeToken(
    workspaceId: string,
    tokenId: string,
    actorId: string,
  ): Promise<ScimToken> {
    const token = await this.scimTokenRepository.findOne({
      where: { id: tokenId, workspaceId },
    });

    if (!token) {
      throw new NotFoundException('SCIM token not found');
    }

    token.isActive = false;
    const saved = await this.scimTokenRepository.save(token);

    // Log audit event
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SCIM_TOKEN_REVOKED,
      actorId,
      details: { tokenId, tokenPrefix: token.tokenPrefix },
    });

    return saved;
  }

  /**
   * Rotate a token: revoke old token and generate a new one.
   * Returns new plaintext token.
   */
  async rotateToken(
    workspaceId: string,
    tokenId: string,
    actorId: string,
  ): Promise<{ token: string; tokenRecord: ScimToken }> {
    const oldToken = await this.scimTokenRepository.findOne({
      where: { id: tokenId, workspaceId },
    });

    if (!oldToken) {
      throw new NotFoundException('SCIM token not found');
    }

    // Revoke old token
    oldToken.isActive = false;
    await this.scimTokenRepository.save(oldToken);

    // Generate new token with same label
    const result = await this.generateToken(
      workspaceId,
      oldToken.label,
      oldToken.expiresAt,
      actorId,
    );

    // Log rotation audit event
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SCIM_TOKEN_ROTATED,
      actorId,
      details: {
        oldTokenId: tokenId,
        newTokenId: result.tokenRecord.id,
        tokenPrefix: result.tokenRecord.tokenPrefix,
      },
    });

    return result;
  }

  /**
   * Validate a bearer token. Returns the matching token record or null.
   * Used by ScimAuthGuard.
   */
  async validateToken(bearerToken: string): Promise<ScimToken | null> {
    const tokenHash = crypto
      .createHash(SCIM_CONSTANTS.TOKEN_HASH_ALGORITHM)
      .update(bearerToken)
      .digest('hex');

    const token = await this.scimTokenRepository.findOne({
      where: { tokenHash, isActive: true },
    });

    if (!token) {
      return null;
    }

    // Check expiration
    if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
      return null;
    }

    return token;
  }

  /**
   * Update last_used_at on a token (fire-and-forget).
   */
  async updateLastUsed(tokenId: string): Promise<void> {
    try {
      await this.scimTokenRepository.update(tokenId, { lastUsedAt: new Date() });
    } catch (error) {
      this.logger.warn(`Failed to update last_used_at for token ${tokenId}`, error);
    }
  }

  /**
   * Get or create SCIM configuration for a workspace.
   */
  async getConfig(workspaceId: string): Promise<ScimConfiguration> {
    // Check Redis cache first
    const cacheKey = `${SCIM_CONSTANTS.CACHE_KEY_PREFIX}${workspaceId}`;
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      try {
        return JSON.parse(cached) as ScimConfiguration;
      } catch {
        this.logger.warn(`Failed to parse cached SCIM config for workspace ${workspaceId}`);
      }
    }

    // Look up in database
    let config = await this.scimConfigRepository.findOne({ where: { workspaceId } });

    if (!config) {
      // Create default config
      config = this.scimConfigRepository.create({
        workspaceId,
        enabled: false,
        baseUrl: '',
        defaultRole: 'developer',
        syncGroups: true,
        autoDeactivate: true,
        autoReactivate: true,
      });
      config = await this.scimConfigRepository.save(config);
    }

    // Cache in Redis
    await this.redisService.set(
      cacheKey,
      JSON.stringify(config),
      SCIM_CONSTANTS.CACHE_TTL_SECONDS,
    );

    return config;
  }

  /**
   * Update SCIM configuration for a workspace.
   */
  async updateConfig(
    workspaceId: string,
    updates: UpdateScimConfigDto,
    actorId: string,
  ): Promise<ScimConfiguration> {
    let config = await this.scimConfigRepository.findOne({ where: { workspaceId } });

    if (!config) {
      config = this.scimConfigRepository.create({
        workspaceId,
        enabled: false,
        baseUrl: '',
        defaultRole: 'developer',
        syncGroups: true,
        autoDeactivate: true,
        autoReactivate: true,
      });
    }

    // Validate defaultRole against allowed values (prevent privilege escalation)
    if (updates.defaultRole !== undefined) {
      const validRoles: readonly string[] = SCIM_CONSTANTS.VALID_ROLES;
      if (!validRoles.includes(updates.defaultRole)) {
        throw new BadRequestException(
          `Invalid defaultRole: ${updates.defaultRole}. Must be one of: ${validRoles.join(', ')}`,
        );
      }
    }

    // Apply updates
    if (updates.enabled !== undefined) config.enabled = updates.enabled;
    if (updates.defaultRole !== undefined) config.defaultRole = updates.defaultRole;
    if (updates.syncGroups !== undefined) config.syncGroups = updates.syncGroups;
    if (updates.autoDeactivate !== undefined) config.autoDeactivate = updates.autoDeactivate;
    if (updates.autoReactivate !== undefined) config.autoReactivate = updates.autoReactivate;

    config = await this.scimConfigRepository.save(config);

    // Invalidate Redis cache
    const cacheKey = `${SCIM_CONSTANTS.CACHE_KEY_PREFIX}${workspaceId}`;
    await this.redisService.del(cacheKey);

    // Log audit event
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SCIM_CONFIG_UPDATED,
      actorId,
      details: { updates },
    });

    return config;
  }
}
