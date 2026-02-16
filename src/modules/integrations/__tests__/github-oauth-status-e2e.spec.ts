import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
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
 * GitHub OAuth Status & Health Check E2E Tests
 * Story 15-3: AC6 - Integration Status and Health
 *
 * Verifies status endpoint behavior and integration list response shape.
 */
describe('GitHub OAuth E2E - Status & Health Check', () => {
  let service: IntegrationConnectionService;
  let mockRepository: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockIntegrationId = '33333333-3333-3333-3333-333333333333';
  const mockConnectedAt = new Date('2026-01-29T10:00:00Z');
  const mockLastUsedAt = new Date('2026-01-29T11:00:00Z');

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({ ...entity }),
      ),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
    };

    const mockEncryptionService = {
      encryptWithWorkspaceKey: jest.fn().mockReturnValue({
        encryptedData: 'encrypted-token-data',
        iv: 'test-iv-hex',
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationConnectionService,
        {
          provide: getRepositoryToken(IntegrationConnection),
          useValue: mockRepository,
        },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: { post: jest.fn(), get: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        { provide: OnboardingService, useValue: { updateStep: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue(null),
            del: jest.fn().mockResolvedValue(undefined),
          },
        },
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

  describe('AC6: Integration Status and Health Check', () => {
    it('should return connected status with user details when active integration exists', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: mockIntegrationId,
        provider: IntegrationProvider.GITHUB,
        status: IntegrationStatus.ACTIVE,
        externalUsername: 'testuser',
        externalAvatarUrl: 'https://github.com/testuser.png',
        scopes: 'repo,user:email,read:org',
        connectedAt: mockConnectedAt,
      });

      const result = await service.getGitHubStatus(mockWorkspaceId);

      expect(result.connected).toBe(true);
      expect(result.username).toBe('testuser');
      expect(result.avatarUrl).toBe('https://github.com/testuser.png');
      expect(result.scopes).toEqual(['repo', 'user:email', 'read:org']);
      expect(result.connectedAt).toBe('2026-01-29T10:00:00.000Z');
    });

    it('should return connected: false when no active integration exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getGitHubStatus(mockWorkspaceId);

      expect(result.connected).toBe(false);
      expect(result.username).toBeUndefined();
      expect(result.avatarUrl).toBeUndefined();
      expect(result.scopes).toBeUndefined();
    });

    it('should return connected: false when integration exists but is disconnected', async () => {
      // Query filters by status: ACTIVE, so disconnected integration returns null
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getGitHubStatus(mockWorkspaceId);

      expect(result.connected).toBe(false);
    });

    it('should query for active GitHub integration only', async () => {
      await service.getGitHubStatus(mockWorkspaceId);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          workspaceId: mockWorkspaceId,
          provider: IntegrationProvider.GITHUB,
          status: IntegrationStatus.ACTIVE,
        },
      });
    });

    it('should return all integrations without decrypted token data', async () => {
      const mockIntegrations = [
        {
          id: mockIntegrationId,
          provider: IntegrationProvider.GITHUB,
          status: IntegrationStatus.ACTIVE,
          externalUsername: 'testuser',
          externalAvatarUrl: 'https://github.com/testuser.png',
          scopes: 'repo,user:email,read:org',
          connectedAt: mockConnectedAt,
          lastUsedAt: mockLastUsedAt,
          encryptedAccessToken: 'encrypted-data-should-not-appear',
          encryptionIV: 'iv-data-should-not-appear',
        },
      ];
      mockRepository.find.mockResolvedValue(mockIntegrations);

      const result = await service.getIntegrations(mockWorkspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockIntegrationId);
      expect(result[0].provider).toBe('github');
      expect(result[0].status).toBe('active');
      expect(result[0].externalUsername).toBe('testuser');
      expect(result[0].externalAvatarUrl).toBe(
        'https://github.com/testuser.png',
      );
      expect(result[0].scopes).toEqual(['repo', 'user:email', 'read:org']);
      expect(result[0].connectedAt).toBe('2026-01-29T10:00:00.000Z');
      expect(result[0].lastUsedAt).toBe('2026-01-29T11:00:00.000Z');
    });

    it('should NOT expose encryptedAccessToken in integration list', async () => {
      mockRepository.find.mockResolvedValue([
        {
          id: mockIntegrationId,
          provider: IntegrationProvider.GITHUB,
          status: IntegrationStatus.ACTIVE,
          externalUsername: 'testuser',
          externalAvatarUrl: 'https://github.com/testuser.png',
          scopes: 'repo',
          connectedAt: mockConnectedAt,
          lastUsedAt: null,
          encryptedAccessToken: 'encrypted-data',
          encryptionIV: 'iv-data',
        },
      ]);

      const result = await service.getIntegrations(mockWorkspaceId);

      expect((result[0] as any).encryptedAccessToken).toBeUndefined();
    });

    it('should NOT expose encryptionIV in integration list', async () => {
      mockRepository.find.mockResolvedValue([
        {
          id: mockIntegrationId,
          provider: IntegrationProvider.GITHUB,
          status: IntegrationStatus.ACTIVE,
          externalUsername: 'testuser',
          externalAvatarUrl: 'https://github.com/testuser.png',
          scopes: 'repo',
          connectedAt: mockConnectedAt,
          lastUsedAt: null,
          encryptedAccessToken: 'encrypted-data',
          encryptionIV: 'iv-data',
        },
      ]);

      const result = await service.getIntegrations(mockWorkspaceId);

      expect((result[0] as any).encryptionIV).toBeUndefined();
    });

    it('should return scopes as array from comma-separated string', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: mockIntegrationId,
        provider: IntegrationProvider.GITHUB,
        status: IntegrationStatus.ACTIVE,
        externalUsername: 'testuser',
        externalAvatarUrl: 'https://github.com/testuser.png',
        scopes: 'repo,user:email,read:org',
        connectedAt: mockConnectedAt,
      });

      const result = await service.getGitHubStatus(mockWorkspaceId);

      expect(result.scopes).toEqual(['repo', 'user:email', 'read:org']);
    });

    it('should handle integration with empty scopes', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: mockIntegrationId,
        provider: IntegrationProvider.GITHUB,
        status: IntegrationStatus.ACTIVE,
        externalUsername: 'testuser',
        externalAvatarUrl: 'https://github.com/testuser.png',
        scopes: '',
        connectedAt: mockConnectedAt,
      });

      const result = await service.getGitHubStatus(mockWorkspaceId);

      expect(result.scopes).toEqual([]);
    });

    it('should handle integration with null/undefined scopes', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: mockIntegrationId,
        provider: IntegrationProvider.GITHUB,
        status: IntegrationStatus.ACTIVE,
        externalUsername: 'testuser',
        externalAvatarUrl: 'https://github.com/testuser.png',
        scopes: null,
        connectedAt: mockConnectedAt,
      });

      const result = await service.getGitHubStatus(mockWorkspaceId);

      expect(result.scopes).toEqual([]);
    });
  });
});
