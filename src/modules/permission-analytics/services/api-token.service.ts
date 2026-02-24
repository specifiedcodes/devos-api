import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { ApiToken } from '../../../database/entities/api-token.entity';
import { RedisService } from '../../redis/redis.service';
import { ApiTokenScope, CreateApiTokenDto } from '../dto/create-api-token.dto';

/** Maximum API tokens per workspace */
const MAX_TOKENS_PER_WORKSPACE = 25;

/** bcrypt cost factor */
const BCRYPT_COST = 12;

/** Token prefix for identification */
const TOKEN_PREFIX = 'dvos_';

/** Redis cache TTL for recently validated tokens (seconds) */
const VALIDATION_CACHE_TTL = 60;

/** Redis cache key prefix for validated tokens */
const VALIDATION_CACHE_PREFIX = 'api_token_valid:';

@Injectable()
export class ApiTokenService {
  private readonly logger = new Logger(ApiTokenService.name);

  constructor(
    @InjectRepository(ApiToken)
    private readonly tokenRepo: Repository<ApiToken>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Create a new API token for a workspace.
   * Returns the raw token only once - it is never stored in plaintext.
   */
  async createToken(
    workspaceId: string,
    dto: CreateApiTokenDto,
    actorId: string,
  ): Promise<{ token: ApiToken; rawToken: string }> {
    // Check workspace token limit
    const existingCount = await this.tokenRepo.count({ where: { workspaceId } });
    if (existingCount >= MAX_TOKENS_PER_WORKSPACE) {
      throw new BadRequestException(
        `Workspace token limit reached (maximum ${MAX_TOKENS_PER_WORKSPACE})`,
      );
    }

    // Validate scopes
    const validScopes = Object.values(ApiTokenScope);
    for (const scope of dto.scopes) {
      if (!validScopes.includes(scope as ApiTokenScope)) {
        throw new BadRequestException(`Invalid scope: ${scope}`);
      }
    }

    // Generate raw token: dvos_ + 40 random chars (base64url)
    const randomBytes = crypto.randomBytes(30);
    const rawToken = `${TOKEN_PREFIX}${randomBytes.toString('base64url').slice(0, 40)}`;
    const tokenPrefix = rawToken.slice(0, 8);

    // Hash the token with bcrypt
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_COST);

    const token = this.tokenRepo.create({
      workspaceId,
      name: dto.name,
      tokenHash,
      tokenPrefix,
      scopes: dto.scopes,
      isActive: true,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      createdBy: actorId,
    });

    const saved = await this.tokenRepo.save(token);

    this.logger.log(
      `Created API token "${dto.name}" (prefix: ${tokenPrefix}) for workspace ${workspaceId}`,
    );

    return { token: saved, rawToken };
  }

  /**
   * List all tokens for a workspace (excludes tokenHash).
   */
  async listTokens(workspaceId: string): Promise<ApiToken[]> {
    const tokens = await this.tokenRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });

    // Strip tokenHash from response
    return tokens.map((t) => {
      const { tokenHash: _hash, ...rest } = t;
      return { ...rest, tokenHash: '' } as ApiToken;
    });
  }

  /**
   * Revoke (deactivate) an API token.
   */
  async revokeToken(
    workspaceId: string,
    tokenId: string,
    actorId: string,
  ): Promise<void> {
    const token = await this.tokenRepo.findOne({
      where: { id: tokenId, workspaceId },
    });

    if (!token) {
      throw new NotFoundException('API token not found');
    }

    token.isActive = false;
    await this.tokenRepo.save(token);

    // Invalidate validation cache
    await this.redisService.del(`${VALIDATION_CACHE_PREFIX}${tokenId}`);

    this.logger.log(
      `Revoked API token "${token.name}" (${tokenId}) by actor ${actorId}`,
    );
  }

  /**
   * Validate a raw API token against stored hashes.
   * Uses Redis cache to avoid repeated bcrypt comparisons on hot tokens.
   */
  async validateToken(
    rawToken: string,
  ): Promise<{ token: ApiToken; workspaceId: string } | null> {
    if (!rawToken || !rawToken.startsWith(TOKEN_PREFIX)) {
      return null;
    }

    // Check Redis cache for recently validated tokens
    const tokenPrefix = rawToken.slice(0, 8);
    const cacheKey = `${VALIDATION_CACHE_PREFIX}${tokenPrefix}`;

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        // Re-verify the full token against the stored hash (from cache)
        const match = await bcrypt.compare(rawToken, cachedData.tokenHash);
        if (match) {
          // Update lastUsedAt fire-and-forget
          this.tokenRepo
            .update(cachedData.id, { lastUsedAt: new Date() })
            .catch(() => {});
          return {
            token: cachedData as ApiToken,
            workspaceId: cachedData.workspaceId,
          };
        }
      }
    } catch {
      // Cache miss or parse error - fall through to DB
    }

    // Query active tokens matching this prefix
    const candidates = await this.tokenRepo.find({
      where: {
        tokenPrefix,
        isActive: true,
      },
    });

    for (const candidate of candidates) {
      // Check expiry
      if (candidate.expiresAt && new Date(candidate.expiresAt) < new Date()) {
        continue;
      }

      const match = await bcrypt.compare(rawToken, candidate.tokenHash);
      if (match) {
        // Update lastUsedAt fire-and-forget
        this.tokenRepo
          .update(candidate.id, { lastUsedAt: new Date() })
          .catch(() => {});

        // Cache the validated token in Redis (include hash for re-verification)
        try {
          await this.redisService.set(
            cacheKey,
            JSON.stringify({
              id: candidate.id,
              workspaceId: candidate.workspaceId,
              tokenHash: candidate.tokenHash,
              scopes: candidate.scopes,
              isActive: candidate.isActive,
              expiresAt: candidate.expiresAt,
              name: candidate.name,
              tokenPrefix: candidate.tokenPrefix,
            }),
            VALIDATION_CACHE_TTL,
          );
        } catch {
          // Non-critical - caching failure is okay
        }

        return { token: candidate, workspaceId: candidate.workspaceId };
      }
    }

    return null;
  }

  /**
   * Cleanup expired tokens. Runs daily at 3:00 AM UTC.
   */
  @Cron('0 3 * * *')
  async cleanupExpiredTokens(): Promise<number> {
    const now = new Date();
    const result = await this.tokenRepo
      .createQueryBuilder()
      .update(ApiToken)
      .set({ isActive: false })
      .where('is_active = :active', { active: true })
      .andWhere('expires_at IS NOT NULL')
      .andWhere('expires_at <= :now', { now })
      .execute();

    const count = result.affected || 0;
    if (count > 0) {
      this.logger.log(`Deactivated ${count} expired API tokens`);
    }

    return count;
  }
}
