import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { BYOKKey, KeyProvider } from '../../../database/entities/byok-key.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { RateLimiterService } from '../../../shared/cache/rate-limiter.service';
import {
  sanitizeLogData,
  sanitizeForAudit,
} from '../../../shared/logging/log-sanitizer';
import { ApiKeyValidatorService } from './api-key-validator.service';
import { OnboardingService } from '../../onboarding/services/onboarding.service';

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateBYOKKeyDto {
  keyName: string;
  provider: KeyProvider;
  apiKey: string;
}

export interface BYOKKeyResponse {
  id: string;
  keyName: string;
  provider: KeyProvider;
  createdAt: Date;
  lastUsedAt?: Date;
  isActive: boolean;
  maskedKey: string;
}

@Injectable()
export class BYOKKeyService {
  private readonly logger = new Logger(BYOKKeyService.name);
  private readonly decryptRateLimit: number;
  private readonly decryptRateWindowMs: number;

  constructor(
    @InjectRepository(BYOKKey)
    private readonly byokKeyRepository: Repository<BYOKKey>,
    private readonly encryptionService: EncryptionService,
    private readonly auditService: AuditService,
    private readonly rateLimiter: RateLimiterService,
    private readonly configService: ConfigService,
    private readonly apiKeyValidator: ApiKeyValidatorService,
    private readonly onboardingService: OnboardingService,
  ) {
    // Load rate limit configuration from environment (with sensible defaults)
    this.decryptRateLimit = this.configService.get<number>(
      'BYOK_DECRYPT_RATE_LIMIT',
      100,
    );
    this.decryptRateWindowMs = this.configService.get<number>(
      'BYOK_DECRYPT_RATE_WINDOW_MS',
      60 * 60 * 1000, // 1 hour
    );
  }

  /**
   * Create a new BYOK key for a workspace
   */
  async createKey(
    workspaceId: string,
    userId: string,
    dto: CreateBYOKKeyDto,
    requestContext?: RequestContext,
  ): Promise<BYOKKeyResponse> {
    try {
      // Validate API key format based on provider
      this.validateApiKey(dto.provider, dto.apiKey);

      // Perform live API validation
      let validationResult;
      try {
        validationResult = await this.apiKeyValidator.validateApiKey(
          dto.provider,
          dto.apiKey,
        );
      } catch (validationError) {
        // Log validation failure audit event before re-throwing
        await this.auditService.log(
          workspaceId,
          userId,
          AuditAction.BYOK_KEY_VALIDATION_FAILED,
          'byok_key',
          'N/A',
          sanitizeForAudit({
            provider: dto.provider,
            error: validationError instanceof Error
              ? sanitizeLogData(validationError.message)
              : 'Unknown validation error',
            ipAddress: requestContext?.ipAddress,
            userAgent: requestContext?.userAgent,
          }),
        );
        throw validationError;
      }

      if (!validationResult.isValid) {
        // Log validation failure audit event
        await this.auditService.log(
          workspaceId,
          userId,
          AuditAction.BYOK_KEY_VALIDATION_FAILED,
          'byok_key',
          'N/A',
          sanitizeForAudit({
            provider: dto.provider,
            error: sanitizeLogData(validationResult.error || 'Invalid API key'),
            ipAddress: requestContext?.ipAddress,
            userAgent: requestContext?.userAgent,
          }),
        );

        throw new BadRequestException(
          `API key validation failed: ${validationResult.error || 'Invalid API key'}`,
        );
      }

      // Check for duplicate keys in the workspace
      await this.checkDuplicateKey(workspaceId, dto.apiKey);

      // Encrypt the API key with workspace-specific encryption
      const { encryptedData, iv } =
        this.encryptionService.encryptWithWorkspaceKey(
          workspaceId,
          dto.apiKey,
        );

      // Extract key prefix and suffix for masked display
      const { prefix, suffix } = this.extractKeyParts(dto.apiKey);

      const byokKey = this.byokKeyRepository.create({
        workspaceId,
        keyName: dto.keyName,
        provider: dto.provider,
        encryptedKey: encryptedData,
        encryptionIV: iv,
        keyPrefix: prefix,
        keySuffix: suffix,
        createdByUserId: userId,
        isActive: true,
      });

      const saved = await this.byokKeyRepository.save(byokKey);

      // Audit log the key creation (never log plaintext key)
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.BYOK_KEY_CREATED,
        'byok_key',
        saved.id,
        sanitizeForAudit({
          keyName: dto.keyName,
          provider: dto.provider,
          keyId: saved.id,
          ipAddress: requestContext?.ipAddress,
          userAgent: requestContext?.userAgent,
        }),
      );

      this.logger.log(
        `BYOK key created: ${saved.id} for workspace ${workspaceId} by user ${userId}`,
      );

      // Update onboarding status (Story 4.1)
      try {
        await this.onboardingService.updateStep(
          userId,
          workspaceId,
          'aiKeyAdded',
          true,
        );
        this.logger.log(
          `Onboarding step 'aiKeyAdded' updated for user ${userId}`,
        );
      } catch (error) {
        // Log error but don't fail key creation if onboarding update fails
        this.logger.warn(
          `Failed to update onboarding step for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      return this.toResponse(saved);
    } catch (error) {
      // Sanitize error to prevent logging API keys
      this.logger.error('Failed to create BYOK key', sanitizeLogData(error));
      throw error;
    }
  }

  /**
   * Get all active keys for a workspace (without decrypted values)
   */
  async getWorkspaceKeys(workspaceId: string): Promise<BYOKKeyResponse[]> {
    const keys = await this.byokKeyRepository.find({
      where: { workspaceId, isActive: true },
      select: [
        'id',
        'keyName',
        'provider',
        'createdAt',
        'lastUsedAt',
        'isActive',
        'keyPrefix',
        'keySuffix',
      ],
      order: { createdAt: 'DESC' },
    });

    return keys.map((key) => this.toResponse(key));
  }

  /**
   * Get a specific key by ID (for the workspace)
   */
  async getKeyById(
    keyId: string,
    workspaceId: string,
  ): Promise<BYOKKeyResponse> {
    const key = await this.byokKeyRepository.findOne({
      where: { id: keyId, workspaceId, isActive: true },
      select: [
        'id',
        'keyName',
        'provider',
        'createdAt',
        'lastUsedAt',
        'isActive',
        'keyPrefix',
        'keySuffix',
      ],
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    return this.toResponse(key);
  }

  /**
   * Decrypt and return the API key (for internal use by agents)
   * SECURITY: This should only be called by trusted internal services
   */
  async decryptKey(
    keyId: string,
    workspaceId: string,
    requestContext?: RequestContext,
  ): Promise<string> {
    // Rate limiting: Configurable via environment variables
    const rateLimitKey = `byok:decrypt:${workspaceId}:${keyId}`;
    await this.rateLimiter.checkLimit(
      rateLimitKey,
      this.decryptRateLimit,
      this.decryptRateWindowMs,
    );

    const byokKey = await this.byokKeyRepository.findOne({
      where: { id: keyId, workspaceId, isActive: true },
    });

    if (!byokKey) {
      throw new ForbiddenException('API key not found or not accessible');
    }

    try {
      // Decrypt with workspace-specific key
      const decryptedKey = this.encryptionService.decryptWithWorkspaceKey(
        workspaceId,
        byokKey.encryptedKey,
        byokKey.encryptionIV,
      );

      // Update last used timestamp
      await this.byokKeyRepository.update(keyId, {
        lastUsedAt: new Date(),
      });

      // Audit log the key access (log key ID only, never plaintext)
      await this.auditService.log(
        workspaceId,
        'system', // Key decryption is typically triggered by system/agent
        AuditAction.BYOK_KEY_ACCESSED,
        'byok_key',
        keyId,
        sanitizeForAudit({
          action: 'decrypt',
          keyId,
          ipAddress: requestContext?.ipAddress,
          userAgent: requestContext?.userAgent,
        }),
      );

      this.logger.log(`BYOK key ${keyId} decrypted for workspace ${workspaceId}`);

      return decryptedKey;
    } catch (error) {
      // Sanitize error to prevent logging decrypted keys
      this.logger.error(
        `Failed to decrypt BYOK key ${keyId} for workspace ${workspaceId}`,
        sanitizeLogData(error),
      );
      throw new ForbiddenException('Failed to decrypt API key');
    }
  }

  /**
   * Delete (soft delete) a BYOK key
   */
  async deleteKey(
    keyId: string,
    workspaceId: string,
    userId: string,
    requestContext?: RequestContext,
  ): Promise<void> {
    const byokKey = await this.byokKeyRepository.findOne({
      where: { id: keyId, workspaceId },
    });

    if (!byokKey) {
      throw new NotFoundException('API key not found');
    }

    // Soft delete by marking inactive
    await this.byokKeyRepository.update(keyId, {
      isActive: false,
    });

    // Audit log the key deletion (never log plaintext key)
    await this.auditService.log(
      workspaceId,
      userId,
      AuditAction.BYOK_KEY_DELETED,
      'byok_key',
      keyId,
      sanitizeForAudit({
        keyName: byokKey.keyName,
        provider: byokKey.provider,
        keyId,
        ipAddress: requestContext?.ipAddress,
        userAgent: requestContext?.userAgent,
      }),
    );

    this.logger.log(
      `BYOK key ${keyId} deleted by user ${userId} in workspace ${workspaceId}`,
    );
  }

  /**
   * Get the active key for a provider (for a workspace)
   * Returns the most recently created active key for the provider
   */
  async getActiveKeyForProvider(
    workspaceId: string,
    provider: KeyProvider,
    requestContext?: RequestContext,
  ): Promise<string | null> {
    const byokKey = await this.byokKeyRepository.findOne({
      where: { workspaceId, provider, isActive: true },
      order: { createdAt: 'DESC' },
    });

    if (!byokKey) {
      return null;
    }

    return this.decryptKey(byokKey.id, workspaceId, requestContext);
  }

  /**
   * Validate API key format based on provider
   */
  private validateApiKey(provider: KeyProvider, apiKey: string): void {
    switch (provider) {
      case KeyProvider.ANTHROPIC:
        // Anthropic keys start with 'sk-ant-'
        if (!apiKey.startsWith('sk-ant-')) {
          throw new BadRequestException(
            'Invalid Anthropic API key format. Key should start with "sk-ant-"',
          );
        }
        // Real Anthropic keys are typically 100+ characters
        if (apiKey.length < 50) {
          throw new BadRequestException(
            'Anthropic API key is too short (minimum 50 characters)',
          );
        }
        // Validate format: sk-ant- followed by base64-like characters
        if (!/^sk-ant-[a-zA-Z0-9_-]+$/.test(apiKey)) {
          throw new BadRequestException(
            'Invalid Anthropic API key format. Should contain only alphanumeric, dash, and underscore characters after prefix',
          );
        }
        break;

      case KeyProvider.OPENAI:
        // OpenAI keys start with 'sk-proj-' (new format) or 'sk-' (legacy)
        if (!apiKey.startsWith('sk-proj-') && !apiKey.startsWith('sk-')) {
          throw new BadRequestException(
            'Invalid OpenAI API key format. Key should start with "sk-proj-" or "sk-"',
          );
        }
        // Real OpenAI keys are typically 50+ characters
        if (apiKey.length < 50) {
          throw new BadRequestException(
            'OpenAI API key is too short (minimum 50 characters)',
          );
        }
        // Validate format: alphanumeric and dash characters
        if (!/^sk-[a-zA-Z0-9_-]+$/.test(apiKey)) {
          throw new BadRequestException(
            'Invalid OpenAI API key format. Should contain only alphanumeric, dash, and underscore characters after prefix',
          );
        }
        break;

      case KeyProvider.GOOGLE:
        // Google AI keys start with 'AIza'
        if (!apiKey.startsWith('AIza')) {
          throw new BadRequestException(
            'Invalid Google AI API key format. Key should start with "AIza"',
          );
        }
        // Google AI keys are typically 39 characters
        if (apiKey.length < 30) {
          throw new BadRequestException(
            'Google AI API key is too short (minimum 30 characters)',
          );
        }
        // Validate format: alphanumeric, dash, and underscore characters
        if (!/^AIza[a-zA-Z0-9_-]+$/.test(apiKey)) {
          throw new BadRequestException(
            'Invalid Google AI API key format. Should contain only alphanumeric, dash, and underscore characters after prefix',
          );
        }
        break;

      default:
        throw new BadRequestException('Unsupported provider');
    }
  }

  /**
   * Check if an API key already exists in the workspace
   *
   * PERFORMANCE NOTE: This method decrypts all existing keys to check for duplicates.
   * Time complexity: O(n) where n = number of existing keys in workspace.
   *
   * Alternative approach considered: Hash-based comparison using crypto.createHash('sha256')
   * - Pros: Constant-time comparison, no decryption needed
   * - Cons: Requires schema migration to add hash column, cannot detect duplicates across existing keys without one-time migration
   *
   * Current implementation chosen for:
   * 1. Security: No additional hash storage required (smaller attack surface)
   * 2. Simplicity: Works with current schema, no migration needed
   * 3. Scale: Workspaces typically have 1-5 keys, so O(n) is acceptable
   *
   * Future optimization: If workspaces regularly exceed 10+ keys, consider hash-based approach.
   */
  private async checkDuplicateKey(
    workspaceId: string,
    apiKey: string,
  ): Promise<void> {
    const existingKeys = await this.byokKeyRepository.find({
      where: { workspaceId, isActive: true },
    });

    for (const existingKey of existingKeys) {
      try {
        const decryptedKey = this.encryptionService.decryptWithWorkspaceKey(
          workspaceId,
          existingKey.encryptedKey,
          existingKey.encryptionIV,
        );

        if (decryptedKey === apiKey) {
          throw new BadRequestException(
            'This API key already exists in your workspace',
          );
        }
      } catch (error) {
        // If decryption fails, skip this key
        if (error instanceof BadRequestException) {
          throw error;
        }
        this.logger.warn(
          `Failed to decrypt key ${existingKey.id} during duplicate check`,
        );
      }
    }
  }

  /**
   * Extract key prefix and suffix for masked display
   *
   * Handles multiple API key formats:
   * - Anthropic: "sk-ant-api..." → "sk-ant-...api7"
   * - OpenAI (new): "sk-proj-..." → "sk-proj-...xyz9"
   * - OpenAI (legacy): "sk-..." → "sk-...abc3"
   * - Google AI: "AIzaSy..." → "AIza...Sy12"
   * - Unknown format: "key123..." → "key1...23"
   *
   * Algorithm:
   * 1. For short keys (≤8 chars): Use first 3 chars as prefix
   * 2. For keys with dashes:
   *    - If second dash exists within first 15 chars (e.g., 'sk-ant-'): use up to second dash
   *    - Otherwise: use up to first dash (e.g., 'sk-')
   * 3. For keys without dashes: Use first 4 chars (e.g., Google AI 'AIza')
   * 4. Always use last 4 chars as suffix
   *
   * The 15-char limit for second dash ensures we capture structured prefixes like
   * 'sk-ant-' (7 chars) or 'sk-proj-' (8 chars) without including random data.
   */
  private extractKeyParts(apiKey: string): { prefix: string; suffix: string } {
    let prefix = '';

    if (apiKey.length <= 8) {
      // Short key: just use first 3 chars
      prefix = apiKey.substring(0, Math.min(3, apiKey.length));
    } else {
      // Find the prefix (structured part before random string)
      const firstDash = apiKey.indexOf('-');

      if (firstDash !== -1) {
        // Key has dashes - check for second dash (multi-part prefix)
        const secondDash = apiKey.indexOf('-', firstDash + 1);

        if (secondDash !== -1 && secondDash < 15) {
          // Multi-part prefix like 'sk-ant-' or 'sk-proj-' (within first 15 chars)
          prefix = apiKey.substring(0, secondDash + 1);
        } else {
          // Single-part prefix like 'sk-' (or second dash too far)
          prefix = apiKey.substring(0, firstDash + 1);
        }
      } else {
        // No dashes - use first 4 chars as fallback (e.g., Google AI keys: 'AIza...')
        prefix = apiKey.substring(0, Math.min(4, apiKey.length));
      }
    }

    // Always use last 4 chars as suffix (or full length if key is shorter)
    const suffix = apiKey.slice(-Math.min(4, apiKey.length));
    return { prefix, suffix };
  }

  /**
   * Build masked key from prefix and suffix
   */
  private buildMaskedKey(prefix?: string, suffix?: string): string {
    if (!prefix || !suffix) {
      return '***...**';
    }
    return `${prefix}...${suffix}`;
  }

  /**
   * Convert entity to response DTO (excluding sensitive data)
   */
  private toResponse(key: BYOKKey): BYOKKeyResponse {
    return {
      id: key.id,
      keyName: key.keyName,
      provider: key.provider,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      isActive: key.isActive,
      maskedKey: this.buildMaskedKey(key.keyPrefix, key.keySuffix),
    };
  }
}
