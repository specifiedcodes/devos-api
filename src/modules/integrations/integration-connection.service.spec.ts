import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AxiosResponse, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { IntegrationConnectionService } from './integration-connection.service';
import {
  IntegrationConnection,
  IntegrationProvider,
  IntegrationStatus,
} from '../../database/entities/integration-connection.entity';
import { EncryptionService } from '../../shared/encryption/encryption.service';
import { AuditService } from '../../shared/audit/audit.service';
import { OnboardingService } from '../onboarding/services/onboarding.service';
import { RedisService } from '../redis/redis.service';

describe('IntegrationConnectionService', () => {
  let service: IntegrationConnectionService;
  let mockRepository: any;
  let mockEncryptionService: any;
  let mockConfigService: any;
  let mockHttpService: any;
  let mockAuditService: any;
  let mockOnboardingService: any;
  let mockRedisService: any;

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
    access_token: 'gho_test_token_12345',
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

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
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
        encryptedData: 'encrypted-token-data',
        iv: 'test-iv-hex',
      }),
      decryptWithWorkspaceKey: jest.fn().mockReturnValue('gho_decrypted_token'),
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

    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

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

  describe('generateAuthorizationUrl', () => {
    it('should generate a correct GitHub OAuth URL with all required params', async () => {
      const result = await service.generateAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      expect(result.authorizationUrl).toContain(
        'https://github.com/login/oauth/authorize',
      );
      expect(result.authorizationUrl).toContain('client_id=test-client-id');
      // URLSearchParams encodes commas as %2C and colons as %3A
      expect(result.authorizationUrl).toMatch(/scope=repo[,%].*user/);
      expect(result.authorizationUrl).toContain('state=');
      expect(result.authorizationUrl).toContain('redirect_uri=');
    });

    it('should store CSRF state in Redis with correct TTL', async () => {
      await service.generateAuthorizationUrl(mockUserId, mockWorkspaceId);

      expect(mockRedisService.set).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = mockRedisService.set.mock.calls[0];
      expect(key).toMatch(/^github-oauth-state:/);
      expect(ttl).toBe(600);

      const parsedValue = JSON.parse(value);
      expect(parsedValue.userId).toBe(mockUserId);
      expect(parsedValue.workspaceId).toBe(mockWorkspaceId);
    });

    it('should store userId and workspaceId in the state value', async () => {
      await service.generateAuthorizationUrl(mockUserId, mockWorkspaceId);

      const [, value] = mockRedisService.set.mock.calls[0];
      const parsedValue = JSON.parse(value);
      expect(parsedValue).toEqual({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
      });
    });
  });

  describe('handleCallback', () => {
    const mockCode = 'github-auth-code-123';
    const mockState = 'test-state-uuid';

    beforeEach(() => {
      // Setup default mocks for successful callback
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );

      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockTokenResponse)),
      );

      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockGitHubUser)),
      );

      mockRepository.findOne.mockResolvedValue(null); // No existing integration
    });

    it('should validate state parameter against Redis', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockRedisService.get).toHaveBeenCalledWith(
        `github-oauth-state:${mockState}`,
      );
    });

    it('should reject invalid/expired state with ForbiddenException', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleCallback(mockCode, mockState),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.handleCallback(mockCode, mockState),
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should exchange code for access token via HTTP POST', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          code: mockCode,
        },
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );
    });

    it('should fetch GitHub user info after token exchange', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://api.github.com/user',
        {
          headers: {
            Authorization: `Bearer ${mockTokenResponse.access_token}`,
            Accept: 'application/json',
          },
        },
      );
    });

    it('should store encrypted token in database', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockEncryptionService.encryptWithWorkspaceKey).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockTokenResponse.access_token,
      );

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();

      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptedAccessToken).toBe('encrypted-token-data');
      expect(savedEntity.encryptionIV).toBe('test-iv-hex');
      expect(savedEntity.provider).toBe(IntegrationProvider.GITHUB);
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
    });

    it('should update onboarding githubConnected status', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockOnboardingService.updateStep).toHaveBeenCalledWith(
        mockUserId,
        mockWorkspaceId,
        'githubConnected',
        true,
      );
    });

    it('should log audit event for connection', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        expect.any(String),
        expect.objectContaining({
          action: 'integration.github.connected',
          provider: 'github',
          externalUsername: mockGitHubUser.login,
          result: 'success',
        }),
      );
    });

    it('should delete CSRF state from Redis after success', async () => {
      await service.handleCallback(mockCode, mockState);

      expect(mockRedisService.del).toHaveBeenCalledWith(
        `github-oauth-state:${mockState}`,
      );
    });

    it('should handle GitHub API errors gracefully', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('GitHub API error')),
      );

      const result = await service.handleCallback(mockCode, mockState);

      expect(result.redirectUrl).toContain('github=error');
      expect(result.redirectUrl).toContain('message=');
    });

    it('should upsert existing disconnected record on reconnect', async () => {
      const existingIntegration = {
        id: mockIntegrationId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        provider: IntegrationProvider.GITHUB,
        status: IntegrationStatus.DISCONNECTED,
        encryptedAccessToken: '',
        encryptionIV: '',
      };

      mockRepository.findOne.mockResolvedValue(existingIntegration);

      await service.handleCallback(mockCode, mockState);

      expect(mockRepository.save).toHaveBeenCalled();
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
      expect(savedEntity.encryptedAccessToken).toBe('encrypted-token-data');
      expect(savedEntity.id).toBe(mockIntegrationId);
    });

    it('should return success redirect URL', async () => {
      const result = await service.handleCallback(mockCode, mockState);

      expect(result.redirectUrl).toBe(
        'http://localhost:3000/settings/integrations?github=connected',
      );
    });

    it('should not fail OAuth if onboarding update fails', async () => {
      mockOnboardingService.updateStep.mockRejectedValue(
        new Error('Onboarding not found'),
      );

      const result = await service.handleCallback(mockCode, mockState);

      // Should still succeed
      expect(result.redirectUrl).toContain('github=connected');
    });
  });

  describe('getIntegrations', () => {
    it('should return all workspace integrations without tokens', async () => {
      const mockIntegrations = [
        {
          id: mockIntegrationId,
          provider: IntegrationProvider.GITHUB,
          status: IntegrationStatus.ACTIVE,
          externalUsername: 'testuser',
          externalAvatarUrl: 'https://github.com/testuser.png',
          scopes: 'repo,user:email',
          connectedAt: new Date('2026-01-29T10:00:00Z'),
          lastUsedAt: new Date('2026-01-29T11:00:00Z'),
          encryptedAccessToken: 'encrypted-data',
          encryptionIV: 'iv-data',
        },
      ];

      mockRepository.find.mockResolvedValue(mockIntegrations);

      const result = await service.getIntegrations(mockWorkspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockIntegrationId);
      expect(result[0].provider).toBe('github');
      expect(result[0].externalUsername).toBe('testuser');
      expect(result[0].scopes).toEqual(['repo', 'user:email']);
      // Should NOT include encrypted token data
      expect((result[0] as any).encryptedAccessToken).toBeUndefined();
      expect((result[0] as any).encryptionIV).toBeUndefined();
    });

    it('should return empty array for workspace with no integrations', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.getIntegrations(mockWorkspaceId);

      expect(result).toEqual([]);
    });

    it('should sort integrations by connectedAt descending', async () => {
      await service.getIntegrations(mockWorkspaceId);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId },
        order: { connectedAt: 'DESC' },
      });
    });
  });

  describe('getGitHubStatus', () => {
    it('should return connected status with user info when integration exists', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: mockIntegrationId,
        provider: IntegrationProvider.GITHUB,
        status: IntegrationStatus.ACTIVE,
        externalUsername: 'testuser',
        externalAvatarUrl: 'https://github.com/testuser.png',
        scopes: 'repo,user:email,read:org',
        connectedAt: new Date('2026-01-29T10:00:00Z'),
      });

      const result = await service.getGitHubStatus(mockWorkspaceId);

      expect(result.connected).toBe(true);
      expect(result.username).toBe('testuser');
      expect(result.avatarUrl).toBe('https://github.com/testuser.png');
      expect(result.scopes).toEqual(['repo', 'user:email', 'read:org']);
      expect(result.connectedAt).toBe('2026-01-29T10:00:00.000Z');
    });

    it('should return not connected when no integration exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getGitHubStatus(mockWorkspaceId);

      expect(result.connected).toBe(false);
      expect(result.username).toBeUndefined();
    });

    it('should query for active GitHub integration only', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await service.getGitHubStatus(mockWorkspaceId);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          workspaceId: mockWorkspaceId,
          provider: IntegrationProvider.GITHUB,
          status: IntegrationStatus.ACTIVE,
        },
      });
    });
  });

  describe('disconnectIntegration', () => {
    const mockActiveIntegration = {
      id: mockIntegrationId,
      workspaceId: mockWorkspaceId,
      userId: mockUserId,
      provider: IntegrationProvider.GITHUB,
      status: IntegrationStatus.ACTIVE,
      encryptedAccessToken: 'encrypted-data',
      encryptionIV: 'iv-data',
      externalUsername: 'testuser',
    };

    it('should mark integration as disconnected', async () => {
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

    it('should clear encrypted token data', async () => {
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

    it('should log audit event', async () => {
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

    it('should throw NotFoundException when integration not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.disconnectIntegration(mockWorkspaceId, 'github', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return success response', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      const result = await service.disconnectIntegration(
        mockWorkspaceId,
        'github',
        mockUserId,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('disconnected');
    });

    it('should throw BadRequestException for invalid provider', async () => {
      await expect(
        service.disconnectIntegration(mockWorkspaceId, 'invalid-provider', mockUserId),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.disconnectIntegration(mockWorkspaceId, 'invalid-provider', mockUserId),
      ).rejects.toThrow('Invalid integration provider: invalid-provider');
    });
  });

  describe('getDecryptedToken', () => {
    const mockActiveIntegration = {
      id: mockIntegrationId,
      workspaceId: mockWorkspaceId,
      provider: IntegrationProvider.GITHUB,
      status: IntegrationStatus.ACTIVE,
      encryptedAccessToken: 'encrypted-token-data',
      encryptionIV: 'test-iv-hex',
    };

    it('should decrypt and return token for active integration', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      const token = await service.getDecryptedToken(
        mockWorkspaceId,
        IntegrationProvider.GITHUB,
      );

      expect(token).toBe('gho_decrypted_token');
      expect(mockEncryptionService.decryptWithWorkspaceKey).toHaveBeenCalledWith(
        mockWorkspaceId,
        'encrypted-token-data',
        'test-iv-hex',
      );
    });

    it('should update lastUsedAt on token access', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      await service.getDecryptedToken(
        mockWorkspaceId,
        IntegrationProvider.GITHUB,
      );

      expect(mockRepository.save).toHaveBeenCalled();
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.lastUsedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException when no active integration exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDecryptedToken(
          mockWorkspaceId,
          IntegrationProvider.GITHUB,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on decryption failure', async () => {
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

      await expect(
        service.getDecryptedToken(
          mockWorkspaceId,
          IntegrationProvider.GITHUB,
        ),
      ).rejects.toThrow('Failed to decrypt integration token');
    });
  });

  describe('generateRailwayAuthorizationUrl', () => {
    it('should generate a correct Railway OAuth URL with all required params', async () => {
      const result = await service.generateRailwayAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      expect(result.authorizationUrl).toContain(
        'https://railway.app/authorize',
      );
      expect(result.authorizationUrl).toContain('client_id=');
      expect(result.authorizationUrl).toContain('response_type=code');
      expect(result.authorizationUrl).toContain('state=');
      expect(result.authorizationUrl).toContain('redirect_uri=');
    });

    it('should store CSRF state in Redis with correct TTL', async () => {
      await service.generateRailwayAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      expect(mockRedisService.set).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = mockRedisService.set.mock.calls[0];
      expect(key).toMatch(/^railway-oauth-state:/);
      expect(ttl).toBe(600);

      const parsedValue = JSON.parse(value);
      expect(parsedValue.userId).toBe(mockUserId);
      expect(parsedValue.workspaceId).toBe(mockWorkspaceId);
    });
  });

  describe('handleRailwayCallback', () => {
    const mockCode = 'railway-auth-code-123';
    const mockState = 'test-state-uuid';
    const mockRailwayUser = {
      id: 'railway-user-id',
      email: 'test@example.com',
      name: 'Test User',
      avatar: 'https://railway.app/avatar.png',
    };

    beforeEach(() => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );

      // Mock token exchange
      mockHttpService.post.mockImplementation((url: string, body: any) => {
        if (
          body?.query?.includes('oauthExchange')
        ) {
          return of(
            createAxiosResponse({
              data: { authToken: 'railway_access_token' },
            }),
          );
        }
        if (body?.query?.includes('me')) {
          return of(
            createAxiosResponse({
              data: { me: mockRailwayUser },
            }),
          );
        }
        return of(createAxiosResponse({}));
      });

      mockRepository.findOne.mockResolvedValue(null); // No existing integration
    });

    it('should exchange code for token via Railway GraphQL', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.stringContaining('oauthExchange'),
        }),
        expect.any(Object),
      );
    });

    it('should validate CSRF state from Redis', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      expect(mockRedisService.get).toHaveBeenCalledWith(
        `railway-oauth-state:${mockState}`,
      );
    });

    it('should reject invalid/expired state with ForbiddenException', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleRailwayCallback(mockCode, mockState),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should store encrypted token in database', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      expect(
        mockEncryptionService.encryptWithWorkspaceKey,
      ).toHaveBeenCalledWith(mockWorkspaceId, 'railway_access_token');

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();

      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptedAccessToken).toBe('encrypted-token-data');
      expect(savedEntity.encryptionIV).toBe('test-iv-hex');
      expect(savedEntity.provider).toBe(IntegrationProvider.RAILWAY);
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
    });

    it('should return success redirect URL', async () => {
      const result = await service.handleRailwayCallback(
        mockCode,
        mockState,
      );

      expect(result.redirectUrl).toBe(
        'http://localhost:3000/settings/integrations?railway=connected',
      );
    });

    it('should return error redirect URL on Railway API failure', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Railway API error')),
      );

      const result = await service.handleRailwayCallback(
        mockCode,
        mockState,
      );

      expect(result.redirectUrl).toContain('railway=error');
      expect(result.redirectUrl).toContain('message=');
    });

    it('should delete CSRF state from Redis after callback', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      expect(mockRedisService.del).toHaveBeenCalledWith(
        `railway-oauth-state:${mockState}`,
      );
    });

    it('should log audit event for connection', async () => {
      await service.handleRailwayCallback(mockCode, mockState);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        expect.any(String),
        expect.objectContaining({
          action: 'integration.railway.connected',
          provider: 'railway',
          result: 'success',
        }),
      );
    });
  });

  describe('getRailwayStatus', () => {
    it('should return connected=true with username when active integration exists', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: mockIntegrationId,
        provider: IntegrationProvider.RAILWAY,
        status: IntegrationStatus.ACTIVE,
        externalUsername: 'railwayuser',
        connectedAt: new Date('2026-02-01T10:00:00Z'),
      });

      const result = await service.getRailwayStatus(mockWorkspaceId);

      expect(result.connected).toBe(true);
      expect(result.username).toBe('railwayuser');
      expect(result.connectedAt).toBe('2026-02-01T10:00:00.000Z');
    });

    it('should return connected=false when no active integration exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getRailwayStatus(mockWorkspaceId);

      expect(result.connected).toBe(false);
      expect(result.username).toBeUndefined();
    });

    it('should query for active Railway integration only', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await service.getRailwayStatus(mockWorkspaceId);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          workspaceId: mockWorkspaceId,
          provider: IntegrationProvider.RAILWAY,
          status: IntegrationStatus.ACTIVE,
        },
      });
    });
  });

  describe('generateVercelAuthorizationUrl', () => {
    it('should generate a correct Vercel OAuth URL with all required params', async () => {
      const result = await service.generateVercelAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      expect(result.authorizationUrl).toContain(
        'https://vercel.com/integrations/oauthdone',
      );
      expect(result.authorizationUrl).toContain('client_id=');
      expect(result.authorizationUrl).toContain('state=');
      expect(result.authorizationUrl).toContain('redirect_uri=');
    });

    it('should store CSRF state in Redis with correct TTL', async () => {
      await service.generateVercelAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      expect(mockRedisService.set).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = mockRedisService.set.mock.calls[0];
      expect(key).toMatch(/^vercel-oauth-state:/);
      expect(ttl).toBe(600);

      const parsedValue = JSON.parse(value);
      expect(parsedValue.userId).toBe(mockUserId);
      expect(parsedValue.workspaceId).toBe(mockWorkspaceId);
    });
  });

  describe('handleVercelCallback', () => {
    const mockCode = 'vercel-auth-code-123';
    const mockState = 'test-state-uuid';
    const mockVercelUser = {
      id: 'vercel-user-id',
      username: 'verceluser',
      name: 'Vercel User',
      avatar: 'https://vercel.com/avatar.png',
    };

    beforeEach(() => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );

      // Mock token exchange (POST)
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            access_token: 'vercel_access_token',
            token_type: 'Bearer',
          }),
        ),
      );

      // Mock user info fetch (GET)
      mockHttpService.get.mockReturnValue(
        of(
          createAxiosResponse({
            user: mockVercelUser,
          }),
        ),
      );

      mockRepository.findOne.mockResolvedValue(null); // No existing integration
    });

    it('should exchange code for token via Vercel REST API', async () => {
      await service.handleVercelCallback(mockCode, mockState);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.vercel.com/v2/oauth/access_token',
        expect.stringContaining('code=vercel-auth-code-123'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        }),
      );
    });

    it('should validate CSRF state from Redis', async () => {
      await service.handleVercelCallback(mockCode, mockState);

      expect(mockRedisService.get).toHaveBeenCalledWith(
        `vercel-oauth-state:${mockState}`,
      );
    });

    it('should reject invalid/expired state with ForbiddenException', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleVercelCallback(mockCode, mockState),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should store encrypted token in database', async () => {
      await service.handleVercelCallback(mockCode, mockState);

      expect(
        mockEncryptionService.encryptWithWorkspaceKey,
      ).toHaveBeenCalledWith(mockWorkspaceId, 'vercel_access_token');

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();

      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptedAccessToken).toBe('encrypted-token-data');
      expect(savedEntity.encryptionIV).toBe('test-iv-hex');
      expect(savedEntity.provider).toBe(IntegrationProvider.VERCEL);
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
    });

    it('should return success redirect URL', async () => {
      const result = await service.handleVercelCallback(
        mockCode,
        mockState,
      );

      expect(result.redirectUrl).toBe(
        'http://localhost:3000/settings/integrations?vercel=connected',
      );
    });

    it('should return error redirect URL on Vercel API failure', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Vercel API error')),
      );

      const result = await service.handleVercelCallback(
        mockCode,
        mockState,
      );

      expect(result.redirectUrl).toContain('vercel=error');
      expect(result.redirectUrl).toContain('message=');
    });

    it('should delete CSRF state from Redis after callback', async () => {
      await service.handleVercelCallback(mockCode, mockState);

      expect(mockRedisService.del).toHaveBeenCalledWith(
        `vercel-oauth-state:${mockState}`,
      );
    });

    it('should log audit event for connection', async () => {
      await service.handleVercelCallback(mockCode, mockState);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        expect.any(String),
        expect.objectContaining({
          action: 'integration.vercel.connected',
          provider: 'vercel',
          result: 'success',
        }),
      );
    });
  });

  describe('getVercelStatus', () => {
    it('should return connected=true with username when active integration exists', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: mockIntegrationId,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.ACTIVE,
        externalUsername: 'verceluser',
        connectedAt: new Date('2026-02-01T10:00:00Z'),
      });

      const result = await service.getVercelStatus(mockWorkspaceId);

      expect(result.connected).toBe(true);
      expect(result.username).toBe('verceluser');
      expect(result.connectedAt).toBe('2026-02-01T10:00:00.000Z');
    });

    it('should return connected=false when no active integration exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getVercelStatus(mockWorkspaceId);

      expect(result.connected).toBe(false);
      expect(result.username).toBeUndefined();
    });

    it('should query for active Vercel integration only', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await service.getVercelStatus(mockWorkspaceId);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          workspaceId: mockWorkspaceId,
          provider: IntegrationProvider.VERCEL,
          status: IntegrationStatus.ACTIVE,
        },
      });
    });
  });

  describe('generateSupabaseAuthorizationUrl', () => {
    it('should generate a correct Supabase OAuth URL with all required params', async () => {
      const result = await service.generateSupabaseAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      expect(result.authorizationUrl).toContain(
        'https://api.supabase.com/v1/oauth/authorize',
      );
      expect(result.authorizationUrl).toContain('client_id=');
      expect(result.authorizationUrl).toContain('response_type=code');
      expect(result.authorizationUrl).toContain('state=');
      expect(result.authorizationUrl).toContain('redirect_uri=');
    });

    it('should store CSRF state in Redis with correct TTL', async () => {
      await service.generateSupabaseAuthorizationUrl(
        mockUserId,
        mockWorkspaceId,
      );

      expect(mockRedisService.set).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = mockRedisService.set.mock.calls[0];
      expect(key).toMatch(/^supabase-oauth-state:/);
      expect(ttl).toBe(600);

      const parsedValue = JSON.parse(value);
      expect(parsedValue.userId).toBe(mockUserId);
      expect(parsedValue.workspaceId).toBe(mockWorkspaceId);
    });
  });

  describe('handleSupabaseCallback', () => {
    const mockCode = 'supabase-auth-code-123';
    const mockState = 'test-state-uuid';

    beforeEach(() => {
      mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: mockUserId, workspaceId: mockWorkspaceId }),
      );

      // Mock token exchange (POST)
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            access_token: 'supabase_access_token',
            token_type: 'Bearer',
            refresh_token: 'supabase_refresh_token',
          }),
        ),
      );

      mockRepository.findOne.mockResolvedValue(null); // No existing integration
    });

    it('should exchange code for token via Supabase REST API', async () => {
      await service.handleSupabaseCallback(mockCode, mockState);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/oauth/token',
        expect.stringContaining('code=supabase-auth-code-123'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        }),
      );
    });

    it('should validate CSRF state from Redis', async () => {
      await service.handleSupabaseCallback(mockCode, mockState);

      expect(mockRedisService.get).toHaveBeenCalledWith(
        `supabase-oauth-state:${mockState}`,
      );
    });

    it('should reject invalid/expired state with ForbiddenException', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(
        service.handleSupabaseCallback(mockCode, mockState),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should store encrypted token in database', async () => {
      await service.handleSupabaseCallback(mockCode, mockState);

      expect(
        mockEncryptionService.encryptWithWorkspaceKey,
      ).toHaveBeenCalledWith(mockWorkspaceId, 'supabase_access_token');

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();

      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptedAccessToken).toBe('encrypted-token-data');
      expect(savedEntity.encryptionIV).toBe('test-iv-hex');
      expect(savedEntity.provider).toBe(IntegrationProvider.SUPABASE);
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
    });

    it('should return success redirect URL', async () => {
      const result = await service.handleSupabaseCallback(
        mockCode,
        mockState,
      );

      expect(result.redirectUrl).toBe(
        'http://localhost:3000/settings/integrations?supabase=connected',
      );
    });

    it('should return error redirect URL on Supabase API failure', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Supabase API error')),
      );

      const result = await service.handleSupabaseCallback(
        mockCode,
        mockState,
      );

      expect(result.redirectUrl).toContain('supabase=error');
      expect(result.redirectUrl).toContain('message=');
    });

    it('should delete CSRF state from Redis after callback', async () => {
      await service.handleSupabaseCallback(mockCode, mockState);

      expect(mockRedisService.del).toHaveBeenCalledWith(
        `supabase-oauth-state:${mockState}`,
      );
    });

    it('should log audit event for connection', async () => {
      await service.handleSupabaseCallback(mockCode, mockState);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        expect.any(String),
        expect.objectContaining({
          action: 'integration.supabase.connected',
          provider: 'supabase',
          result: 'success',
        }),
      );
    });
  });

  describe('getSupabaseStatus', () => {
    it('should return connected=true when active integration exists', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: mockIntegrationId,
        provider: IntegrationProvider.SUPABASE,
        status: IntegrationStatus.ACTIVE,
        externalUsername: 'supabaseorg',
        connectedAt: new Date('2026-02-01T10:00:00Z'),
      });

      const result = await service.getSupabaseStatus(mockWorkspaceId);

      expect(result.connected).toBe(true);
      expect(result.username).toBe('supabaseorg');
      expect(result.connectedAt).toBe('2026-02-01T10:00:00.000Z');
    });

    it('should return connected=false when no active integration exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getSupabaseStatus(mockWorkspaceId);

      expect(result.connected).toBe(false);
      expect(result.username).toBeUndefined();
    });

    it('should query for active Supabase integration only', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await service.getSupabaseStatus(mockWorkspaceId);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          workspaceId: mockWorkspaceId,
          provider: IntegrationProvider.SUPABASE,
          status: IntegrationStatus.ACTIVE,
        },
      });
    });
  });
});
