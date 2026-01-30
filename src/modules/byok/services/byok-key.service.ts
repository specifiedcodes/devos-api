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
  ): Promise<BYOKKeyResponse> {
    try {
      // Validate API key format based on provider
      this.validateApiKey(dto.provider, dto.apiKey);

      // Encrypt the API key with workspace-specific encryption
      const { encryptedData, iv } =
        this.encryptionService.encryptWithWorkspaceKey(
          workspaceId,
          dto.apiKey,
        );

      const byokKey = this.byokKeyRepository.create({
        workspaceId,
        keyName: dto.keyName,
        provider: dto.provider,
        encryptedKey: encryptedData,
        encryptionIV: iv,
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
        sanitizeForAudit({ keyName: dto.keyName, provider: dto.provider }),
      );

      this.logger.log(
        `BYOK key created: ${saved.id} for workspace ${workspaceId} by user ${userId}`,
      );

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
  async decryptKey(keyId: string, workspaceId: string): Promise<string> {
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
        sanitizeForAudit({ action: 'decrypt', keyId }),
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
      sanitizeForAudit({ keyName: byokKey.keyName, provider: byokKey.provider }),
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
  ): Promise<string | null> {
    const byokKey = await this.byokKeyRepository.findOne({
      where: { workspaceId, provider, isActive: true },
      order: { createdAt: 'DESC' },
    });

    if (!byokKey) {
      return null;
    }

    return this.decryptKey(byokKey.id, workspaceId);
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

      default:
        throw new BadRequestException('Unsupported provider');
    }
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
    };
  }
}
