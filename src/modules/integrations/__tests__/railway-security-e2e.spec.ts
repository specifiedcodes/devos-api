import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import { RailwayController } from '../railway/railway.controller';
import { RailwayService } from '../railway/railway.service';
import { Project } from '../../../database/entities/project.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import {
  MOCK_WORKSPACE_ID,
  MOCK_USER_ID,
  MOCK_INTEGRATION_ID,
  MOCK_PROJECT_ID,
  MOCK_RAILWAY_PROJECT_ID,
  MOCK_RAILWAY_TOKEN,
  MOCK_RAILWAY_TOKEN_RESPONSE,
  MOCK_RAILWAY_USER_INFO_RESPONSE,
  createAxiosResponse,
  createRailwayMockProviders,
  buildRailwayTestingModule,
} from './railway-test-helpers';

/**
 * Railway Security E2E Tests
 * Story 15-4: AC12 - Security property verification
 */
describe('Railway E2E - Security Verification', () => {
  let service: IntegrationConnectionService;
  let mocks: ReturnType<typeof createRailwayMockProviders>;

  beforeEach(async () => {
    mocks = createRailwayMockProviders();
    const module = await buildRailwayTestingModule(mocks);
    service = module.get<IntegrationConnectionService>(
      IntegrationConnectionService,
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AC12: Security Properties', () => {
    it('should not expose plaintext token in integration list response', async () => {
      const mockActiveIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.RAILWAY,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: 'encrypted-railway-token-data',
        encryptionIV: 'test-railway-iv-hex',
        tokenType: 'bearer',
        externalUserId: 'railway-user-1',
        externalUsername: 'Railway User',
        externalAvatarUrl: 'https://railway.app/avatar.png',
        connectedAt: new Date(),
        lastUsedAt: null,
        scopes: '',
      };

      mocks.mockRepository.find.mockResolvedValue([{ ...mockActiveIntegration }]);

      const result = await service.getIntegrations(MOCK_WORKSPACE_ID);

      // Verify none of the response fields contain the original plaintext token
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(MOCK_RAILWAY_TOKEN);

      // Verify token fields are not exposed
      result.forEach((integration) => {
        expect((integration as any).encryptedAccessToken).toBeUndefined();
        expect((integration as any).encryptionIV).toBeUndefined();
      });
    });

    it('should use unique CSRF state for each Railway authorization request', async () => {
      const result1 = await service.generateRailwayAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );
      const result2 = await service.generateRailwayAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url1 = new URL(result1.authorizationUrl);
      const url2 = new URL(result2.authorizationUrl);
      const state1 = url1.searchParams.get('state');
      const state2 = url2.searchParams.get('state');

      expect(state1).not.toBe(state2);
    });

    it('should store CSRF state with correct TTL of 600', async () => {
      await service.generateRailwayAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      expect(mocks.mockRedisService.set).toHaveBeenCalledTimes(1);
      const [, , ttl] = mocks.mockRedisService.set.mock.calls[0];
      expect(ttl).toBe(600);
    });

    it('should validate CSRF state is UUID v4 format', async () => {
      const result = await service.generateRailwayAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url = new URL(result.authorizationUrl);
      const state = url.searchParams.get('state');
      expect(state).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should not include token in error redirect URL', async () => {
      mocks.mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: MOCK_USER_ID, workspaceId: MOCK_WORKSPACE_ID }),
      );
      // Token exchange succeeds but user info fetch throws an HTTP error
      mocks.mockHttpService.post
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_RAILWAY_TOKEN_RESPONSE)))
        .mockReturnValueOnce(
          throwError(() => {
            const error: any = new Error('Service Unavailable');
            error.response = { status: 503 };
            return error;
          }),
        );

      const result = await service.handleRailwayCallback(
        'code',
        'valid-state',
      );

      // Verify the error redirect URL exists and does not contain the token
      expect(result.redirectUrl).toContain('railway=error');
      expect(result.redirectUrl).not.toContain(MOCK_RAILWAY_TOKEN);
    });

    it('should not include token in audit log details', async () => {
      mocks.mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: MOCK_USER_ID, workspaceId: MOCK_WORKSPACE_ID }),
      );
      mocks.mockHttpService.post
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_RAILWAY_TOKEN_RESPONSE)))
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_RAILWAY_USER_INFO_RESPONSE)));

      await service.handleRailwayCallback('code', 'valid-state');

      expect(mocks.mockAuditService.log).toHaveBeenCalled();
      const auditCallArgs = mocks.mockAuditService.log.mock.calls[0];
      const serialized = JSON.stringify(auditCallArgs);
      expect(serialized).not.toContain(MOCK_RAILWAY_TOKEN);
    });
  });

  describe('AC12: Environment Variable Security in Audit Logs', () => {
    let controller: RailwayController;
    let controllerAuditService: any;

    beforeEach(async () => {
      controllerAuditService = {
        log: jest.fn().mockResolvedValue(undefined),
      };

      const mockRailwayService = {
        createProject: jest.fn(),
        linkGitHubRepoToProject: jest.fn(),
        triggerDeployment: jest.fn(),
        getDeployment: jest.fn(),
        listDeployments: jest.fn(),
        upsertEnvironmentVariables: jest.fn().mockResolvedValue(undefined),
      };

      const mockIntegrationConnectionService = {
        getDecryptedToken: jest.fn().mockResolvedValue(MOCK_RAILWAY_TOKEN),
      };

      const mockProjectRepository = {
        findOne: jest.fn().mockResolvedValue({
          id: MOCK_PROJECT_ID,
          workspaceId: MOCK_WORKSPACE_ID,
          name: 'Test Project',
          railwayProjectId: MOCK_RAILWAY_PROJECT_ID,
        }),
        save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [RailwayController],
        providers: [
          { provide: RailwayService, useValue: mockRailwayService },
          {
            provide: IntegrationConnectionService,
            useValue: mockIntegrationConnectionService,
          },
          {
            provide: getRepositoryToken(Project),
            useValue: mockProjectRepository,
          },
          { provide: AuditService, useValue: controllerAuditService },
          {
            provide: NotificationService,
            useValue: { create: jest.fn().mockResolvedValue(undefined) },
          },
        ],
      }).compile();

      controller = module.get<RailwayController>(RailwayController);
    });

    it('should not include env var values in audit log', async () => {
      await controller.setEnvironmentVariables(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        'env-1',
        { variables: { SECRET_KEY: 'my-secret-value', API_TOKEN: 'another-secret' } },
        { user: { userId: MOCK_USER_ID } },
      );

      expect(controllerAuditService.log).toHaveBeenCalled();
      const auditCallArgs = controllerAuditService.log.mock.calls[0];
      const auditDetails = auditCallArgs[5];
      expect(auditDetails.variableNames).toEqual(['SECRET_KEY', 'API_TOKEN']);

      // Verify values are NOT anywhere in the audit log
      const serialized = JSON.stringify(auditCallArgs);
      expect(serialized).not.toContain('my-secret-value');
      expect(serialized).not.toContain('another-secret');
    });

    it('should not include env var values anywhere in audit log metadata', async () => {
      const secretValue = 'super-secret-database-password-12345';

      await controller.setEnvironmentVariables(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        'env-1',
        { variables: { DB_PASSWORD: secretValue } },
        { user: { userId: MOCK_USER_ID } },
      );

      // Inspect ALL arguments to auditService.log
      const allCalls = controllerAuditService.log.mock.calls;
      for (const callArgs of allCalls) {
        const serialized = JSON.stringify(callArgs);
        expect(serialized).not.toContain(secretValue);
      }
    });
  });
});
