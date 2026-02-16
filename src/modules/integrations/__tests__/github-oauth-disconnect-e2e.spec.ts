import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AxiosResponse, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
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
 * GitHub OAuth Disconnect & Re-authorization E2E Tests
 * Story 15-3: AC7 - Disconnect and Re-connect Flows
 *
 * Verifies disconnect behavior, token clearing, audit logging, and re-auth upsert.
 */
describe('GitHub OAuth E2E - Disconnect & Re-authorization', () => {
  let service: IntegrationConnectionService;
  let mockRepository: any;
  let mockAuditService: any;
  let mockRedisService: any;
  let mockHttpService: any;
  let mockEncryptionService: any;
  let mockOnboardingService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockIntegrationId = '33333333-3333-3333-3333-333333333333';

  const mockGitHubUser = {
    id: 12345,
    login: 'testuser',
    avatar_url: 'https://github.com/testuser.png',
    email: 'test@example.com',
  };

  const mockTokenResponse = {
    access_token: 'gho_new_token_67890',
    token_type: 'bearer',
    scope: 'repo,user:email,read:org',
  };

  const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
  });

  const mockActiveIntegration = {
    id: mockIntegrationId,
    workspaceId: mockWorkspaceId,
    userId: mockUserId,
    provider: IntegrationProvider.GITHUB,
    status: IntegrationStatus.ACTIVE,
    encryptedAccessToken: 'encrypted-data',
    encryptionIV: 'iv-data',
    externalUsername: 'testuser',
    externalAvatarUrl: 'https://github.com/testuser.png',
    scopes: 'repo,user:email,read:org',
    connectedAt: new Date('2026-01-29T10:00:00Z'),
  };

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({
          id: mockIntegrationId,
          ...entity,
          connectedAt: entity.connectedAt || new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
    };

    mockEncryptionService = {
      encryptWithWorkspaceKey: jest.fn().mockReturnValue({
        encryptedData: 'new-encrypted-token-data',
        iv: 'new-iv-hex',
      }),
      decryptWithWorkspaceKey: jest.fn().mockReturnValue('gho_decrypted_token'),
    };

    const mockConfigService = {
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
    mockOnboardingService = {
      updateStep: jest.fn().mockResolvedValue(undefined),
    };
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

  describe('AC7: Disconnect and Re-authorization', () => {
    it('should disconnect active GitHub integration and mark as disconnected', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      await service.disconnectIntegration(
        mockWorkspaceId,
        'github',
        mockUserId,
      );

      expect(mockRepository.save).toHaveBeenCalled();
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.status).toBe(IntegrationStatus.DISCONNECTED);
    });

    it('should clear encryptedAccessToken and encryptionIV on disconnect', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      await service.disconnectIntegration(
        mockWorkspaceId,
        'github',
        mockUserId,
      );

      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptedAccessToken).toBe('');
      expect(savedEntity.encryptionIV).toBe('');
    });

    it('should log audit event integration.github.disconnected', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      await service.disconnectIntegration(
        mockWorkspaceId,
        'github',
        mockUserId,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        mockIntegrationId,
        expect.objectContaining({
          action: 'integration.github.disconnected',
          provider: 'github',
          result: 'success',
        }),
      );
    });

    it('should return success response with correct message', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      const result = await service.disconnectIntegration(
        mockWorkspaceId,
        'github',
        mockUserId,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('disconnected');
    });

    it('should throw NotFoundException when disconnecting non-existent integration', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.disconnectIntegration(mockWorkspaceId, 'github', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid provider', async () => {
      await expect(
        service.disconnectIntegration(
          mockWorkspaceId,
          'invalid_provider',
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.disconnectIntegration(
          mockWorkspaceId,
          'invalid_provider',
          mockUserId,
        ),
      ).rejects.toThrow('Invalid integration provider: invalid_provider');
    });

    it('should allow re-authorization after disconnect (upsert existing record)', async () => {
      // Step 1: Setup disconnected record to be found during callback
      const disconnectedIntegration = {
        ...mockActiveIntegration,
        status: IntegrationStatus.DISCONNECTED,
        encryptedAccessToken: '',
        encryptionIV: '',
      };
      mockRepository.findOne.mockResolvedValue(disconnectedIntegration);

      // Step 2: Setup mocks for callback
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockTokenResponse)),
      );
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockGitHubUser)),
      );

      // Step 3: Execute callback (re-authorization)
      const result = await service.handleCallback(
        'new-auth-code',
        'new-state',
      );

      expect(result.redirectUrl).toContain('github=connected');

      // Step 4: Verify record was updated (not created new)
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.id).toBe(mockIntegrationId);
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
      expect(savedEntity.encryptedAccessToken).toBe('new-encrypted-token-data');
      expect(savedEntity.encryptionIV).toBe('new-iv-hex');
    });

    it('should preserve same IntegrationConnection record ID on re-authorization (upsert)', async () => {
      const disconnectedIntegration = {
        ...mockActiveIntegration,
        status: IntegrationStatus.DISCONNECTED,
        encryptedAccessToken: '',
        encryptionIV: '',
      };
      mockRepository.findOne.mockResolvedValue(disconnectedIntegration);

      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockTokenResponse)),
      );
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockGitHubUser)),
      );

      await service.handleCallback('new-auth-code', 'new-state');

      const savedEntity = mockRepository.save.mock.calls[0][0];
      // Same record ID - proves it's an update, not a new insert
      expect(savedEntity.id).toBe(mockIntegrationId);
      // create() should NOT have been called since we're updating existing
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should verify getDecryptedToken throws after disconnect', async () => {
      // After disconnect, findOne with status: ACTIVE returns null
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDecryptedToken(
          mockWorkspaceId,
          IntegrationProvider.GITHUB,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should verify getGitHubStatus returns connected: false after disconnect', async () => {
      // After disconnect, findOne with status: ACTIVE returns null
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getGitHubStatus(mockWorkspaceId);
      expect(result.connected).toBe(false);
    });
  });
});
