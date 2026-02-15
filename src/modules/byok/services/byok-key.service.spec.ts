import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { BYOKKeyService, RequestContext } from './byok-key.service';
import { BYOKKey, KeyProvider } from '../../../database/entities/byok-key.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { RateLimiterService } from '../../../shared/cache/rate-limiter.service';
import { ApiKeyValidatorService } from './api-key-validator.service';
import { OnboardingService } from '../../onboarding/services/onboarding.service';

describe('BYOKKeyService', () => {
  let service: BYOKKeyService;
  let repository: Repository<BYOKKey>;
  let encryptionService: EncryptionService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockEncryptionService = {
    encryptWithWorkspaceKey: jest.fn(),
    decryptWithWorkspaceKey: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const mockRateLimiterService = {
    checkLimit: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => defaultValue),
  };

  const mockApiKeyValidatorService = {
    validateApiKey: jest.fn(),
  };

  const mockOnboardingService = {
    createOnboardingStatus: jest.fn().mockResolvedValue(undefined),
    updateStep: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BYOKKeyService,
        {
          provide: getRepositoryToken(BYOKKey),
          useValue: mockRepository,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: RateLimiterService,
          useValue: mockRateLimiterService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ApiKeyValidatorService,
          useValue: mockApiKeyValidatorService,
        },
        {
          provide: OnboardingService,
          useValue: mockOnboardingService,
        },
      ],
    }).compile();

    service = module.get<BYOKKeyService>(BYOKKeyService);
    repository = module.get<Repository<BYOKKey>>(getRepositoryToken(BYOKKey));
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createKey', () => {
    it('should create a BYOK key with valid Anthropic key', async () => {
      const workspaceId = 'workspace-123';
      const userId = 'user-123';
      const dto = {
        keyName: 'Test Key',
        provider: KeyProvider.ANTHROPIC,
        apiKey: 'sk-ant-api03-test-key-1234567890abcdefghijklmnopqrstuvwxyz',
      };

      mockApiKeyValidatorService.validateApiKey.mockResolvedValue({
        isValid: true,
      });

      mockRepository.find.mockResolvedValue([]);

      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted',
        iv: 'iv123',
      });

      mockRepository.create.mockReturnValue({
        id: 'key-123',
        ...dto,
        workspaceId,
        createdByUserId: userId,
      });

      mockRepository.save.mockResolvedValue({
        id: 'key-123',
        keyName: dto.keyName,
        provider: dto.provider,
        createdAt: new Date(),
        encryptedKey: 'encrypted',
        keyPrefix: 'sk-ant-',
        keySuffix: 'wxyz',
      });

      const result = await service.createKey(workspaceId, userId, dto);

      expect(result).toBeDefined();
      expect(result.keyName).toBe(dto.keyName);
      expect(result.maskedKey).toBe('sk-ant-...wxyz');
      expect(mockApiKeyValidatorService.validateApiKey).toHaveBeenCalledWith(
        dto.provider,
        dto.apiKey,
      );
      expect(mockEncryptionService.encryptWithWorkspaceKey).toHaveBeenCalledWith(
        workspaceId,
        dto.apiKey,
      );
    });

    it('should reject invalid Anthropic key format', async () => {
      const workspaceId = 'workspace-123';
      const userId = 'user-123';
      const dto = {
        keyName: 'Test Key',
        provider: KeyProvider.ANTHROPIC,
        apiKey: 'invalid-key',
      };

      await expect(service.createKey(workspaceId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject API key that fails live validation', async () => {
      const workspaceId = 'workspace-123';
      const userId = 'user-123';
      const dto = {
        keyName: 'Test Key',
        provider: KeyProvider.ANTHROPIC,
        apiKey: 'sk-ant-api03-invalid-key-1234567890abcdefghijklmnopqrstuvwxyz',
      };

      mockApiKeyValidatorService.validateApiKey.mockResolvedValue({
        isValid: false,
        error: 'Invalid API key',
      });

      await expect(service.createKey(workspaceId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject duplicate API key', async () => {
      const workspaceId = 'workspace-123';
      const userId = 'user-123';
      const dto = {
        keyName: 'Test Key',
        provider: KeyProvider.ANTHROPIC,
        apiKey: 'sk-ant-api03-test-key-1234567890abcdefghijklmnopqrstuvwxyz',
      };

      mockApiKeyValidatorService.validateApiKey.mockResolvedValue({
        isValid: true,
      });

      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted',
        iv: 'iv123',
      });

      mockRepository.find.mockResolvedValue([
        {
          id: 'existing-key-123',
          encryptedKey: 'encrypted',
          encryptionIV: 'iv123',
        },
      ]);

      mockEncryptionService.decryptWithWorkspaceKey.mockReturnValue(dto.apiKey);

      await expect(service.createKey(workspaceId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('decryptKey', () => {
    it('should decrypt a valid key', async () => {
      const workspaceId = 'workspace-123';
      const keyId = 'key-123';

      mockRepository.findOne.mockResolvedValue({
        id: keyId,
        workspaceId,
        encryptedKey: 'encrypted',
        encryptionIV: 'iv123',
        isActive: true,
      });

      mockEncryptionService.decryptWithWorkspaceKey.mockReturnValue('sk-ant-decrypted');

      const result = await service.decryptKey(keyId, workspaceId);

      expect(result).toBe('sk-ant-decrypted');
      expect(mockRepository.update).toHaveBeenCalledWith(keyId, {
        lastUsedAt: expect.any(Date),
      });
    });

    it('should throw error for non-existent key', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.decryptKey('key-123', 'workspace-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getWorkspaceKeys', () => {
    it('should return all active keys for workspace with masked keys', async () => {
      const workspaceId = 'workspace-123';
      const mockKeys = [
        {
          id: 'key-1',
          keyName: 'Key 1',
          provider: KeyProvider.ANTHROPIC,
          createdAt: new Date(),
          isActive: true,
          encryptedKey: 'encrypted1',
        },
        {
          id: 'key-2',
          keyName: 'Key 2',
          provider: KeyProvider.OPENAI,
          createdAt: new Date(),
          isActive: true,
          encryptedKey: 'encrypted2',
        },
      ];

      mockRepository.find.mockResolvedValue(mockKeys);

      const result = await service.getWorkspaceKeys(workspaceId);

      expect(result).toHaveLength(2);
      expect(result[0].keyName).toBe('Key 1');
      expect(result[0].maskedKey).toBeDefined();
      expect(result[0].maskedKey).toContain('...');
    });
  });

  describe('createKey with requestContext', () => {
    it('should pass IP and user agent to audit log', async () => {
      const workspaceId = 'workspace-123';
      const userId = 'user-123';
      const dto = {
        keyName: 'Test Key',
        provider: KeyProvider.ANTHROPIC,
        apiKey: 'sk-ant-api03-test-key-1234567890abcdefghijklmnopqrstuvwxyz',
      };
      const requestContext: RequestContext = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      mockApiKeyValidatorService.validateApiKey.mockResolvedValue({
        isValid: true,
      });
      mockRepository.find.mockResolvedValue([]);
      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted',
        iv: 'iv123',
      });
      mockRepository.create.mockReturnValue({
        id: 'key-123',
        ...dto,
        workspaceId,
        createdByUserId: userId,
      });
      mockRepository.save.mockResolvedValue({
        id: 'key-123',
        keyName: dto.keyName,
        provider: dto.provider,
        createdAt: new Date(),
        keyPrefix: 'sk-ant-',
        keySuffix: 'wxyz',
      });

      await service.createKey(workspaceId, userId, dto, requestContext);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        workspaceId,
        userId,
        'byok_key_created',
        'byok_key',
        'key-123',
        expect.objectContaining({
          keyName: 'Test Key',
          provider: 'anthropic',
          keyId: 'key-123',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        }),
      );
    });

    it('should log validation failure with audit event when API validation fails', async () => {
      const workspaceId = 'workspace-123';
      const userId = 'user-123';
      const dto = {
        keyName: 'Test Key',
        provider: KeyProvider.ANTHROPIC,
        apiKey: 'sk-ant-api03-invalid-key-1234567890abcdefghijklmnopqrstuvwxyz',
      };
      const requestContext: RequestContext = {
        ipAddress: '10.0.0.1',
        userAgent: 'TestAgent',
      };

      mockApiKeyValidatorService.validateApiKey.mockResolvedValue({
        isValid: false,
        error: 'Invalid API key',
      });

      await expect(
        service.createKey(workspaceId, userId, dto, requestContext),
      ).rejects.toThrow(BadRequestException);

      // Should have logged a validation failure audit event
      expect(mockAuditService.log).toHaveBeenCalledWith(
        workspaceId,
        userId,
        'byok_key_validation_failed',
        'byok_key',
        'N/A',
        expect.objectContaining({
          provider: 'anthropic',
          error: 'Invalid API key',
          ipAddress: '10.0.0.1',
          userAgent: 'TestAgent',
        }),
      );
    });
  });

  describe('deleteKey with requestContext', () => {
    it('should pass IP and user agent to audit log on delete', async () => {
      const requestContext: RequestContext = {
        ipAddress: '10.0.0.5',
        userAgent: 'TestAgent/2.0',
      };

      mockRepository.findOne.mockResolvedValue({
        id: 'key-123',
        workspaceId: 'workspace-123',
        keyName: 'Test Key',
        provider: KeyProvider.ANTHROPIC,
      });
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.deleteKey(
        'key-123',
        'workspace-123',
        'user-123',
        requestContext,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        'workspace-123',
        'user-123',
        'byok_key_deleted',
        'byok_key',
        'key-123',
        expect.objectContaining({
          keyName: 'Test Key',
          provider: 'anthropic',
          keyId: 'key-123',
          ipAddress: '10.0.0.5',
          userAgent: 'TestAgent/2.0',
        }),
      );
    });
  });

  describe('decryptKey with requestContext', () => {
    it('should pass requestContext to audit log on decrypt', async () => {
      const requestContext: RequestContext = {
        ipAddress: '172.16.0.1',
        userAgent: 'InternalService/1.0',
      };

      mockRepository.findOne.mockResolvedValue({
        id: 'key-123',
        workspaceId: 'workspace-123',
        encryptedKey: 'encrypted',
        encryptionIV: 'iv123',
        isActive: true,
      });
      mockEncryptionService.decryptWithWorkspaceKey.mockReturnValue(
        'sk-ant-decrypted',
      );
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.decryptKey('key-123', 'workspace-123', requestContext);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        'workspace-123',
        'system',
        'byok_key_accessed',
        'byok_key',
        'key-123',
        expect.objectContaining({
          action: 'decrypt',
          keyId: 'key-123',
          ipAddress: '172.16.0.1',
          userAgent: 'InternalService/1.0',
        }),
      );
    });
  });

  describe('createKey with Google provider', () => {
    it('should create a BYOK key with valid Google AI key', async () => {
      const workspaceId = 'workspace-123';
      const userId = 'user-123';
      const dto = {
        keyName: 'Google AI Key',
        provider: KeyProvider.GOOGLE,
        apiKey: 'AIzaSyTest1234567890123456789012345',
      };

      mockApiKeyValidatorService.validateApiKey.mockResolvedValue({
        isValid: true,
      });

      mockRepository.find.mockResolvedValue([]);

      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted',
        iv: 'iv123',
      });

      mockRepository.create.mockReturnValue({
        id: 'key-google-123',
        ...dto,
        workspaceId,
        createdByUserId: userId,
      });

      mockRepository.save.mockResolvedValue({
        id: 'key-google-123',
        keyName: dto.keyName,
        provider: dto.provider,
        createdAt: new Date(),
        encryptedKey: 'encrypted',
        keyPrefix: 'AIza',
        keySuffix: '2345',
      });

      const result = await service.createKey(workspaceId, userId, dto);

      expect(result).toBeDefined();
      expect(result.keyName).toBe(dto.keyName);
      expect(result.maskedKey).toBe('AIza...2345');
      expect(mockApiKeyValidatorService.validateApiKey).toHaveBeenCalledWith(
        KeyProvider.GOOGLE,
        dto.apiKey,
      );
      expect(mockEncryptionService.encryptWithWorkspaceKey).toHaveBeenCalledWith(
        workspaceId,
        dto.apiKey,
      );
    });

    it('should reject invalid Google key format (wrong prefix)', async () => {
      const workspaceId = 'workspace-123';
      const userId = 'user-123';
      const dto = {
        keyName: 'Google Key',
        provider: KeyProvider.GOOGLE,
        apiKey: 'sk-not-a-google-key-1234567890',
      };

      await expect(service.createKey(workspaceId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject Google key that is too short', async () => {
      const workspaceId = 'workspace-123';
      const userId = 'user-123';
      const dto = {
        keyName: 'Google Key',
        provider: KeyProvider.GOOGLE,
        apiKey: 'AIzaShort',
      };

      await expect(service.createKey(workspaceId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should store Google keys with encrypted_key and encryption_iv', async () => {
      const workspaceId = 'workspace-123';
      const userId = 'user-123';
      const dto = {
        keyName: 'Google AI Key',
        provider: KeyProvider.GOOGLE,
        apiKey: 'AIzaSyTest1234567890123456789012345',
      };

      mockApiKeyValidatorService.validateApiKey.mockResolvedValue({ isValid: true });
      mockRepository.find.mockResolvedValue([]);
      mockEncryptionService.encryptWithWorkspaceKey.mockReturnValue({
        encryptedData: 'encrypted-google',
        iv: 'iv-google-123',
      });
      mockRepository.create.mockReturnValue({
        id: 'key-google-enc',
        workspaceId,
        keyName: dto.keyName,
        provider: dto.provider,
        encryptedKey: 'encrypted-google',
        encryptionIV: 'iv-google-123',
        createdByUserId: userId,
      });
      mockRepository.save.mockResolvedValue({
        id: 'key-google-enc',
        keyName: dto.keyName,
        provider: dto.provider,
        createdAt: new Date(),
        keyPrefix: 'AIza',
        keySuffix: '2345',
      });

      await service.createKey(workspaceId, userId, dto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          encryptedKey: 'encrypted-google',
          encryptionIV: 'iv-google-123',
          provider: KeyProvider.GOOGLE,
        }),
      );
    });
  });

  describe('getWorkspaceKeys with Google keys', () => {
    it('should return Google AI keys with correct provider', async () => {
      const workspaceId = 'workspace-123';
      const mockKeys = [
        {
          id: 'key-1',
          keyName: 'Anthropic Key',
          provider: KeyProvider.ANTHROPIC,
          createdAt: new Date(),
          isActive: true,
          keyPrefix: 'sk-ant-',
          keySuffix: 'wxyz',
        },
        {
          id: 'key-2',
          keyName: 'Google Key',
          provider: KeyProvider.GOOGLE,
          createdAt: new Date(),
          isActive: true,
          keyPrefix: 'AIza',
          keySuffix: '2345',
        },
      ];

      mockRepository.find.mockResolvedValue(mockKeys);

      const result = await service.getWorkspaceKeys(workspaceId);

      expect(result).toHaveLength(2);
      const googleKey = result.find(k => k.provider === KeyProvider.GOOGLE);
      expect(googleKey).toBeDefined();
      expect(googleKey!.maskedKey).toBe('AIza...2345');
    });
  });

  describe('deleteKey with Google keys', () => {
    it('should delete Google AI keys', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: 'key-google-123',
        workspaceId: 'workspace-123',
        keyName: 'Google Key',
        provider: KeyProvider.GOOGLE,
      });
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.deleteKey('key-google-123', 'workspace-123', 'user-123');

      expect(mockRepository.update).toHaveBeenCalledWith('key-google-123', {
        isActive: false,
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        'workspace-123',
        'user-123',
        'byok_key_deleted',
        'byok_key',
        'key-google-123',
        expect.objectContaining({
          provider: 'google',
        }),
      );
    });
  });

  describe('extractKeyParts and buildMaskedKey', () => {
    it('should extract and mask Anthropic API key correctly', () => {
      const key = 'sk-ant-api03-test-key-1234567890abcdefghijklmnopqrstuvwxyz';
      const { prefix, suffix } = (service as any).extractKeyParts(key);
      expect(prefix).toBe('sk-ant-');
      expect(suffix).toBe('wxyz');

      const masked = (service as any).buildMaskedKey(prefix, suffix);
      expect(masked).toBe('sk-ant-...wxyz');
    });

    it('should extract and mask OpenAI API key correctly', () => {
      const key = 'sk-proj-test-key-1234567890abcdefghijklmnopqrstuvwxyz';
      const { prefix, suffix } = (service as any).extractKeyParts(key);
      expect(prefix).toBe('sk-proj-');
      expect(suffix).toBe('wxyz');

      const masked = (service as any).buildMaskedKey(prefix, suffix);
      expect(masked).toBe('sk-proj-...wxyz');
    });

    it('should handle short keys', () => {
      const key = 'sk-test';
      const { prefix, suffix } = (service as any).extractKeyParts(key);
      const masked = (service as any).buildMaskedKey(prefix, suffix);
      expect(masked).toBe('sk-...test');
    });

    it('should extract and mask Google AI API key correctly', () => {
      // Google keys like 'AIzaSy...' have no dashes, so extractKeyParts uses first 4 chars
      const key = 'AIzaSyTest1234567890123456789012345';
      const { prefix, suffix } = (service as any).extractKeyParts(key);
      expect(prefix).toBe('AIza');
      expect(suffix).toBe('2345');

      const masked = (service as any).buildMaskedKey(prefix, suffix);
      expect(masked).toBe('AIza...2345');
    });

    it('should handle missing prefix/suffix', () => {
      const masked = (service as any).buildMaskedKey(undefined, undefined);
      expect(masked).toBe('***...**');
    });
  });
});
