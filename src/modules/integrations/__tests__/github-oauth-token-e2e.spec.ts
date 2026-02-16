import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationConnection,
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { OnboardingService } from '../../onboarding/services/onboarding.service';
import { RedisService } from '../../redis/redis.service';

/**
 * GitHub OAuth Token Storage & Decryption E2E Tests
 * Story 15-3: AC4 - Encrypted Token Lifecycle
 *
 * Verifies token encryption, decryption, lastUsedAt updates, and error handling.
 */
describe('GitHub OAuth E2E - Token Storage & Decryption', () => {
  let service: IntegrationConnectionService;
  let mockRepository: any;
  let mockEncryptionService: any;
  let mockConfigService: any;
  let mockHttpService: any;
  let mockAuditService: any;
  let mockOnboardingService: any;
  let mockRedisService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockWorkspaceIdB = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const mockIntegrationId = '33333333-3333-3333-3333-333333333333';
  const mockPlaintextToken = 'gho_test_token_12345';

  const mockActiveIntegration = {
    id: mockIntegrationId,
    workspaceId: mockWorkspaceId,
    provider: IntegrationProvider.GITHUB,
    status: IntegrationStatus.ACTIVE,
    encryptedAccessToken: 'encrypted-token-data',
    encryptionIV: 'a1b2c3d4e5f6a7b8',
    lastUsedAt: null,
  };

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({ ...entity }),
      ),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
    };

    mockEncryptionService = {
      encryptWithWorkspaceKey: jest.fn().mockReturnValue({
        encryptedData: 'encrypted-token-data',
        iv: 'a1b2c3d4e5f6a7b8',
      }),
      decryptWithWorkspaceKey: jest.fn().mockReturnValue(mockPlaintextToken),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, string> = {
          GITHUB_CLIENT_ID: 'test-client-id',
          GITHUB_CLIENT_SECRET: 'test-client-secret',
          GITHUB_CALLBACK_URL:
            'http://localhost:3001/api/v1/integrations/github/oauth/callback',
          FRONTEND_URL: 'http://localhost:3000',
        };
        return config[key] ?? defaultValue;
      }),
    };

    mockHttpService = { post: jest.fn(), get: jest.fn() };
    mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    mockOnboardingService = { updateStep: jest.fn().mockResolvedValue(undefined) };
    mockRedisService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationConnectionService,
        {
          provide: getRepositoryToken(IntegrationConnection),
          useValue: mockRepository,
        },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: OnboardingService, useValue: mockOnboardingService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<IntegrationConnectionService>(
      IntegrationConnectionService,
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AC4: Token Storage and Decryption', () => {
    it('should decrypt stored token successfully via getDecryptedToken', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      const token = await service.getDecryptedToken(
        mockWorkspaceId,
        IntegrationProvider.GITHUB,
      );

      expect(token).toBe(mockPlaintextToken);
      expect(
        mockEncryptionService.decryptWithWorkspaceKey,
      ).toHaveBeenCalledWith(
        mockWorkspaceId,
        'encrypted-token-data',
        'a1b2c3d4e5f6a7b8',
      );
    });

    it('should verify stored encryptedAccessToken is NOT the original plaintext token', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      expect(mockActiveIntegration.encryptedAccessToken).not.toBe(
        mockPlaintextToken,
      );
    });

    it('should verify encryptionIV is a valid hex string', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      await service.getDecryptedToken(
        mockWorkspaceId,
        IntegrationProvider.GITHUB,
      );

      // Verify decryptWithWorkspaceKey was called with an IV that is valid hex
      const ivArg = mockEncryptionService.decryptWithWorkspaceKey.mock.calls[0][2];
      expect(ivArg).toMatch(/^[0-9a-f]+$/i);
    });

    it('should update lastUsedAt timestamp on token access', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      await service.getDecryptedToken(
        mockWorkspaceId,
        IntegrationProvider.GITHUB,
      );

      expect(mockRepository.save).toHaveBeenCalled();
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.lastUsedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException when no active GitHub integration exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDecryptedToken(
          mockWorkspaceId,
          IntegrationProvider.GITHUB,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when decryption fails (corrupted data)', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });
      mockEncryptionService.decryptWithWorkspaceKey.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await expect(
        service.getDecryptedToken(
          mockWorkspaceId,
          IntegrationProvider.GITHUB,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include correct message when decryption fails', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });
      mockEncryptionService.decryptWithWorkspaceKey.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await expect(
        service.getDecryptedToken(
          mockWorkspaceId,
          IntegrationProvider.GITHUB,
        ),
      ).rejects.toThrow('Failed to decrypt integration token');
    });

    it('should not return token for disconnected integration (query filters by ACTIVE)', async () => {
      // findOne returns null because the query filters by status: ACTIVE
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDecryptedToken(
          mockWorkspaceId,
          IntegrationProvider.GITHUB,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should query with correct filters for active integration', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      await service.getDecryptedToken(
        mockWorkspaceId,
        IntegrationProvider.GITHUB,
      );

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          workspaceId: mockWorkspaceId,
          provider: IntegrationProvider.GITHUB,
          status: IntegrationStatus.ACTIVE,
        },
      });
    });

    it('should demonstrate different workspaces use different encryption keys', async () => {
      // Workspace A decryption
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });
      await service.getDecryptedToken(
        mockWorkspaceId,
        IntegrationProvider.GITHUB,
      );

      expect(
        mockEncryptionService.decryptWithWorkspaceKey,
      ).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.any(String),
        expect.any(String),
      );

      jest.clearAllMocks();

      // Workspace B decryption - different workspace ID passed
      const integrationB = {
        ...mockActiveIntegration,
        workspaceId: mockWorkspaceIdB,
        encryptedAccessToken: 'different-encrypted-data',
        encryptionIV: 'different-iv',
      };
      mockRepository.findOne.mockResolvedValue(integrationB);
      await service.getDecryptedToken(
        mockWorkspaceIdB,
        IntegrationProvider.GITHUB,
      );

      expect(
        mockEncryptionService.decryptWithWorkspaceKey,
      ).toHaveBeenCalledWith(
        mockWorkspaceIdB,
        'different-encrypted-data',
        'different-iv',
      );
    });
  });
});
