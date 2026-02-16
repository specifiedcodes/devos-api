import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
// No NestJS exception imports needed - this file tests security properties, not error types
import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import { VercelController } from '../vercel/vercel.controller';
import { VercelService } from '../vercel/vercel.service';
import { Project } from '../../../database/entities/project.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import {
  MOCK_WORKSPACE_ID,
  MOCK_USER_ID,
  MOCK_INTEGRATION_ID,
  MOCK_PROJECT_ID,
  MOCK_VERCEL_PROJECT_ID,
  MOCK_VERCEL_USER,
  MOCK_VERCEL_TOKEN,
  MOCK_VERCEL_TOKEN_RESPONSE,
  MOCK_VERCEL_USER_INFO_RESPONSE,
  createAxiosResponse,
  createVercelMockProviders,
  buildVercelTestingModule,
} from './vercel-test-helpers';

/**
 * Vercel Security Verification E2E Tests
 * Story 15-5: AC12 - Security properties verification
 */
describe('Vercel E2E - Security Properties', () => {
  // ======================== Service-level security tests ========================

  describe('AC12: Service-level Security', () => {
    let service: IntegrationConnectionService;
    let mocks: ReturnType<typeof createVercelMockProviders>;

    beforeEach(async () => {
      mocks = createVercelMockProviders();

      const module = await buildVercelTestingModule(mocks);
      service = module.get<IntegrationConnectionService>(
        IntegrationConnectionService,
      );
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should not expose plaintext token in integration list response', async () => {
      const mockIntegrations = [
        {
          id: MOCK_INTEGRATION_ID,
          provider: IntegrationProvider.VERCEL,
          status: IntegrationStatus.ACTIVE,
          externalUsername: MOCK_VERCEL_USER.username,
          externalAvatarUrl: MOCK_VERCEL_USER.avatar,
          scopes: '',
          encryptedAccessToken: 'encrypted-data-containing-token',
          encryptionIV: 'secret-iv',
          connectedAt: new Date(),
          lastUsedAt: null,
        },
      ];
      mocks.mockRepository.find.mockResolvedValue(mockIntegrations);

      const result = await service.getIntegrations(MOCK_WORKSPACE_ID);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(MOCK_VERCEL_TOKEN);
      expect(serialized).not.toContain('encrypted-data-containing-token');
      expect(serialized).not.toContain('secret-iv');
    });

    it('should use unique CSRF state for each Vercel authorization request', async () => {
      const result1 = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );
      const result2 = await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      const url1 = new URL(result1.authorizationUrl);
      const url2 = new URL(result2.authorizationUrl);
      const state1 = url1.searchParams.get('state');
      const state2 = url2.searchParams.get('state');

      expect(state1).not.toBe(state2);
    });

    it('should store CSRF state with correct TTL (600 seconds)', async () => {
      await service.generateVercelAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      expect(mocks.mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('vercel-oauth-state:'),
        expect.any(String),
        600,
      );
    });

    it('should validate CSRF state is UUID v4 format', async () => {
      const result = await service.generateVercelAuthorizationUrl(
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
      const mockState = 'error-redirect-state';
      const mockStateKey = `vercel-oauth-state:${mockState}`;
      mocks.mockRedisService.get.mockImplementation((key: string) => {
        if (key === mockStateKey) {
          return Promise.resolve(
            JSON.stringify({
              userId: MOCK_USER_ID,
              workspaceId: MOCK_WORKSPACE_ID,
            }),
          );
        }
        return Promise.resolve(null);
      });

      // Token exchange succeeds but user info fetch fails with HTTP error
      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValueOnce(
        throwError(() => {
          const error: any = new Error('User info fetch failed');
          error.response = { status: 500 };
          return error;
        }),
      );

      const result = await service.handleVercelCallback('code', mockState);

      expect(result.redirectUrl).not.toContain(MOCK_VERCEL_TOKEN);
    });

    it('should not include token in audit log details', async () => {
      const mockState = 'audit-token-state';
      const mockStateKey = `vercel-oauth-state:${mockState}`;
      mocks.mockRedisService.get.mockImplementation((key: string) => {
        if (key === mockStateKey) {
          return Promise.resolve(
            JSON.stringify({
              userId: MOCK_USER_ID,
              workspaceId: MOCK_WORKSPACE_ID,
            }),
          );
        }
        return Promise.resolve(null);
      });

      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_TOKEN_RESPONSE)),
      );
      mocks.mockHttpService.get.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_VERCEL_USER_INFO_RESPONSE)),
      );

      await service.handleVercelCallback('code', mockState);

      expect(mocks.mockAuditService.log).toHaveBeenCalled();
      const auditCallArgs = mocks.mockAuditService.log.mock.calls[0];
      const serialized = JSON.stringify(auditCallArgs);
      expect(serialized).not.toContain(MOCK_VERCEL_TOKEN);
    });
  });

  // ======================== Controller-level security tests ========================

  describe('AC12: Controller-level Security (Env Var Values)', () => {
    let controller: VercelController;
    let mockAuditService: any;
    let mockVercelService: any;

    const mockProject = {
      id: MOCK_PROJECT_ID,
      workspaceId: MOCK_WORKSPACE_ID,
      name: 'Test Project',
      vercelProjectId: MOCK_VERCEL_PROJECT_ID,
      githubRepoUrl: null,
    };

    const mockReq = { user: { userId: MOCK_USER_ID } };

    beforeEach(async () => {
      mockVercelService = {
        createProject: jest.fn().mockResolvedValue({ id: MOCK_VERCEL_PROJECT_ID }),
        triggerDeployment: jest.fn().mockResolvedValue({ id: 'deploy-1' }),
        getDeployment: jest.fn().mockResolvedValue({ id: 'deploy-1' }),
        listDeployments: jest.fn().mockResolvedValue({ deployments: [], total: 0 }),
        upsertEnvironmentVariables: jest.fn().mockResolvedValue(undefined),
      };

      mockAuditService = {
        log: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [VercelController],
        providers: [
          { provide: VercelService, useValue: mockVercelService },
          {
            provide: IntegrationConnectionService,
            useValue: {
              getDecryptedToken: jest.fn().mockResolvedValue(MOCK_VERCEL_TOKEN),
            },
          },
          {
            provide: getRepositoryToken(Project),
            useValue: {
              findOne: jest.fn().mockResolvedValue({ ...mockProject }),
              save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
            },
          },
          { provide: AuditService, useValue: mockAuditService },
          {
            provide: NotificationService,
            useValue: { create: jest.fn().mockResolvedValue(undefined) },
          },
        ],
      }).compile();

      controller = module.get<VercelController>(VercelController);
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should not include env var values in audit log', async () => {
      await controller.setEnvironmentVariables(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        {
          variables: [
            { key: 'SECRET_KEY', value: 'my-secret-value' },
          ],
        } as any,
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalled();
      const auditCallArgs = mockAuditService.log.mock.calls[0];
      const auditDetails = auditCallArgs[5];
      expect(auditDetails.variableNames).toEqual(['SECRET_KEY']);
      expect(auditDetails).not.toHaveProperty('values');

      // Ensure the secret value is NOT in any of the audit log args
      const serialized = JSON.stringify(auditCallArgs);
      expect(serialized).not.toContain('my-secret-value');
    });

    it('should not include env var values anywhere in audit log metadata', async () => {
      await controller.setEnvironmentVariables(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        {
          variables: [
            { key: 'DB_PASSWORD', value: 'super-secret-password-123' },
            { key: 'API_KEY', value: 'sk-12345-abcdef' },
          ],
        } as any,
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalled();
      // Check ALL audit log calls
      for (const call of mockAuditService.log.mock.calls) {
        const serialized = JSON.stringify(call);
        expect(serialized).not.toContain('super-secret-password-123');
        expect(serialized).not.toContain('sk-12345-abcdef');
      }
    });
  });
});
