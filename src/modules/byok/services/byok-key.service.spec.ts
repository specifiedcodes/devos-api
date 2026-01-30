import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { BYOKKeyService } from './byok-key.service';
import { BYOKKey, KeyProvider } from '../../../database/entities/byok-key.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';

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
        apiKey: 'sk-ant-api03-test-key-1234567890',
      };

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
      });

      const result = await service.createKey(workspaceId, userId, dto);

      expect(result).toBeDefined();
      expect(result.keyName).toBe(dto.keyName);
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
    it('should return all active keys for workspace', async () => {
      const workspaceId = 'workspace-123';
      const mockKeys = [
        {
          id: 'key-1',
          keyName: 'Key 1',
          provider: KeyProvider.ANTHROPIC,
          createdAt: new Date(),
          isActive: true,
        },
        {
          id: 'key-2',
          keyName: 'Key 2',
          provider: KeyProvider.OPENAI,
          createdAt: new Date(),
          isActive: true,
        },
      ];

      mockRepository.find.mockResolvedValue(mockKeys);

      const result = await service.getWorkspaceKeys(workspaceId);

      expect(result).toHaveLength(2);
      expect(result[0].keyName).toBe('Key 1');
    });
  });
});
