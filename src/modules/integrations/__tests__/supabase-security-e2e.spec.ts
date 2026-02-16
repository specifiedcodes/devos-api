import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of } from 'rxjs';
import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import { SupabaseController } from '../supabase/supabase.controller';
import { SupabaseService } from '../supabase/supabase.service';
import { Project } from '../../../database/entities/project.entity';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import {
  MOCK_WORKSPACE_ID,
  MOCK_USER_ID,
  MOCK_PROJECT_ID,
  MOCK_INTEGRATION_ID,
  MOCK_SUPABASE_PROJECT_REF,
  MOCK_SUPABASE_TOKEN,
  MOCK_ENCRYPTED_SUPABASE_TOKEN,
  MOCK_SUPABASE_IV,
  MOCK_SUPABASE_TOKEN_RESPONSE,
  createAxiosResponse,
  createSupabaseMockProviders,
  buildSupabaseTestingModule,
} from './supabase-test-helpers';

/**
 * Supabase Security E2E Tests
 * Story 15-6: AC12 - Security property verification
 */
describe('Supabase E2E - Security Verification', () => {
  // ======================== Integration Service Security Tests ========================

  describe('AC12: IntegrationConnectionService Security', () => {
    let service: IntegrationConnectionService;
    let mocks: ReturnType<typeof createSupabaseMockProviders>;

    beforeEach(async () => {
      mocks = createSupabaseMockProviders();

      const module = await buildSupabaseTestingModule(mocks);
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
          provider: IntegrationProvider.SUPABASE,
          status: IntegrationStatus.ACTIVE,
          externalUsername: '',
          externalAvatarUrl: '',
          scopes: '',
          connectedAt: new Date('2026-02-16T00:00:00.000Z'),
          lastUsedAt: null,
          encryptedAccessToken: MOCK_ENCRYPTED_SUPABASE_TOKEN,
          encryptionIV: MOCK_SUPABASE_IV,
        },
      ];
      mocks.mockRepository.find.mockResolvedValue(mockIntegrations);

      const result = await service.getIntegrations(MOCK_WORKSPACE_ID);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(MOCK_SUPABASE_TOKEN);
      expect(serialized).not.toContain(MOCK_ENCRYPTED_SUPABASE_TOKEN);
      expect(serialized).not.toContain(MOCK_SUPABASE_IV);
    });

    it('should use unique CSRF state for each Supabase authorization request', async () => {
      const result1 = await service.generateSupabaseAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );
      const result2 = await service.generateSupabaseAuthorizationUrl(
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
      await service.generateSupabaseAuthorizationUrl(
        MOCK_USER_ID,
        MOCK_WORKSPACE_ID,
      );

      expect(mocks.mockRedisService.set).toHaveBeenCalled();
      const ttl = mocks.mockRedisService.set.mock.calls[0][2];
      expect(ttl).toBe(600);
    });

    it('should validate CSRF state is UUID v4 format', async () => {
      const result = await service.generateSupabaseAuthorizationUrl(
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
      const mockStateKey = `supabase-oauth-state:${mockState}`;
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

      // Token exchange succeeds but encryption fails
      mocks.mockHttpService.post.mockReturnValueOnce(
        of(createAxiosResponse(MOCK_SUPABASE_TOKEN_RESPONSE)),
      );
      mocks.mockEncryptionService.encryptWithWorkspaceKey.mockImplementation(
        () => {
          throw new Error('Encryption failed');
        },
      );

      const result = await service.handleSupabaseCallback(
        'code',
        mockState,
      );

      expect(result.redirectUrl).not.toContain(MOCK_SUPABASE_TOKEN);
    });

    it('should not include token in audit log details', async () => {
      const mockState = 'audit-log-state';
      const mockStateKey = `supabase-oauth-state:${mockState}`;
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
        of(createAxiosResponse(MOCK_SUPABASE_TOKEN_RESPONSE)),
      );

      await service.handleSupabaseCallback('code', mockState);

      expect(mocks.mockAuditService.log).toHaveBeenCalled();
      const auditCallArgs = mocks.mockAuditService.log.mock.calls[0];
      const serialized = JSON.stringify(auditCallArgs);
      expect(serialized).not.toContain(MOCK_SUPABASE_TOKEN);
    });
  });

  // ======================== Controller Security Tests ========================

  describe('AC12: SupabaseController Security', () => {
    let controller: SupabaseController;
    let mockAuditService: any;
    let mockSupabaseService: any;
    let mockIntegrationConnectionService: any;
    let mockProjectRepository: any;
    let mockNotificationService: any;

    const mockProject = {
      id: MOCK_PROJECT_ID,
      workspaceId: MOCK_WORKSPACE_ID,
      name: 'Test Project',
      supabaseProjectRef: MOCK_SUPABASE_PROJECT_REF,
    };

    const mockReq = { user: { userId: MOCK_USER_ID } };

    const mockProjectResponse = {
      id: MOCK_SUPABASE_PROJECT_REF,
      name: 'my-app-db',
      organizationId: 'org-uuid-1',
      region: 'us-east-1',
      status: 'provisioning',
      projectUrl: `https://supabase.com/dashboard/project/${MOCK_SUPABASE_PROJECT_REF}`,
      createdAt: '2026-02-16T00:00:00.000Z',
    };

    const mockApiKeys = [
      { name: 'anon', apiKey: 'eyJ...anon' },
      { name: 'service_role', apiKey: 'eyJ...service' },
    ];

    beforeEach(async () => {
      mockSupabaseService = {
        createProject: jest.fn().mockResolvedValue(mockProjectResponse),
        getProject: jest.fn().mockResolvedValue(mockProjectResponse),
        getProjectApiKeys: jest.fn().mockResolvedValue(mockApiKeys),
        listOrganizations: jest
          .fn()
          .mockResolvedValue({ organizations: [] }),
        pauseProject: jest.fn().mockResolvedValue(undefined),
        resumeProject: jest.fn().mockResolvedValue(undefined),
      };

      mockIntegrationConnectionService = {
        getDecryptedToken: jest.fn().mockResolvedValue(MOCK_SUPABASE_TOKEN),
      };

      mockProjectRepository = {
        findOne: jest.fn().mockResolvedValue({ ...mockProject }),
        save: jest
          .fn()
          .mockImplementation((entity) => Promise.resolve(entity)),
      };

      mockAuditService = {
        log: jest.fn().mockResolvedValue(undefined),
      };

      mockNotificationService = {
        create: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [SupabaseController],
        providers: [
          { provide: SupabaseService, useValue: mockSupabaseService },
          {
            provide: IntegrationConnectionService,
            useValue: mockIntegrationConnectionService,
          },
          {
            provide: getRepositoryToken(Project),
            useValue: mockProjectRepository,
          },
          { provide: AuditService, useValue: mockAuditService },
          {
            provide: NotificationService,
            useValue: mockNotificationService,
          },
        ],
      }).compile();

      controller = module.get<SupabaseController>(SupabaseController);
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should not include dbPassword in audit log for project creation', async () => {
      await controller.createProject(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
        {
          name: 'my-db',
          organizationId: 'org-uuid',
          dbPassword: 'my-secret-db-pass',
        } as any,
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalled();
      const auditCallArgs = mockAuditService.log.mock.calls[0];
      const serialized = JSON.stringify(auditCallArgs);
      expect(serialized).not.toContain('my-secret-db-pass');

      const auditDetails = auditCallArgs[5];
      expect(auditDetails).not.toHaveProperty('dbPassword');
    });

    it('should not expose database password in connection string response', async () => {
      const result = await controller.getConnectionString(
        MOCK_WORKSPACE_ID,
        MOCK_PROJECT_ID,
      );

      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('dbPassword');

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('password');
    });
  });
});
