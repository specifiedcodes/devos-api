import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import {
  MOCK_WORKSPACE_ID,
  MOCK_INTEGRATION_ID,
  createSupabaseMockProviders,
  buildSupabaseTestingModule,
} from './supabase-test-helpers';

/**
 * Supabase Integration Status and Health Check E2E Tests
 * Story 15-6: AC9 - Status endpoint and token health verification
 */
describe('Supabase E2E - Status & Health Check', () => {
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

  describe('AC9: Supabase Status and Health Check', () => {
    it('should return connected status with username when active Supabase integration exists', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.SUPABASE,
        status: IntegrationStatus.ACTIVE,
        externalUsername: '',
        connectedAt: new Date('2026-02-16T00:00:00.000Z'),
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      const result = await service.getSupabaseStatus(MOCK_WORKSPACE_ID);

      expect(result.connected).toBe(true);
      expect(result).toHaveProperty('username');
      expect(result).toHaveProperty('connectedAt');
    });

    it('should return disconnected status when no active Supabase integration', async () => {
      mocks.mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getSupabaseStatus(MOCK_WORKSPACE_ID);

      expect(result.connected).toBe(false);
    });

    it('should return disconnected when integration exists but is DISCONNECTED', async () => {
      // findOne is filtered by status: ACTIVE, so returns null for disconnected
      mocks.mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getSupabaseStatus(MOCK_WORKSPACE_ID);

      expect(result.connected).toBe(false);
    });

    it('should list all integrations including Supabase without token data', async () => {
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
          encryptedAccessToken: 'encrypted-should-not-appear',
          encryptionIV: 'iv-should-not-appear',
        },
      ];
      mocks.mockRepository.find.mockResolvedValue(mockIntegrations);

      const result = await service.getIntegrations(MOCK_WORKSPACE_ID);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const supabaseIntegration = result.find(
        (i) => i.provider === IntegrationProvider.SUPABASE,
      );
      expect(supabaseIntegration).toBeDefined();
      expect(supabaseIntegration!.id).toBe(MOCK_INTEGRATION_ID);
      expect(supabaseIntegration!.provider).toBe(IntegrationProvider.SUPABASE);
      expect(supabaseIntegration!.status).toBe(IntegrationStatus.ACTIVE);
      expect(supabaseIntegration!).toHaveProperty('connectedAt');

      // Ensure token data is NOT exposed
      expect(supabaseIntegration).not.toHaveProperty('encryptedAccessToken');
      expect(supabaseIntegration).not.toHaveProperty('encryptionIV');
    });

    it('should include correct shape in integration list response', async () => {
      const mockIntegrations = [
        {
          id: MOCK_INTEGRATION_ID,
          provider: IntegrationProvider.SUPABASE,
          status: IntegrationStatus.ACTIVE,
          externalUsername: '',
          externalAvatarUrl: '',
          scopes: '',
          connectedAt: new Date('2026-02-16T00:00:00.000Z'),
          lastUsedAt: new Date('2026-02-16T12:00:00.000Z'),
        },
      ];
      mocks.mockRepository.find.mockResolvedValue(mockIntegrations);

      const result = await service.getIntegrations(MOCK_WORKSPACE_ID);

      const integration = result[0];
      expect(integration).toHaveProperty('id');
      expect(integration).toHaveProperty('provider');
      expect(integration).toHaveProperty('status');
      expect(integration).toHaveProperty('externalUsername');
      expect(integration).toHaveProperty('externalAvatarUrl');
      expect(integration).toHaveProperty('connectedAt');
      expect(integration).toHaveProperty('lastUsedAt');
    });
  });
});
