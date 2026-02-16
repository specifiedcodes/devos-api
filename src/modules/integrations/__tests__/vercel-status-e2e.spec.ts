import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import {
  MOCK_WORKSPACE_ID,
  MOCK_INTEGRATION_ID,
  MOCK_VERCEL_USER,
  createVercelMockProviders,
  buildVercelTestingModule,
} from './vercel-test-helpers';

/**
 * Vercel Integration Status and Health Check E2E Tests
 * Story 15-5: AC9 - Status endpoint and integration listing
 */
describe('Vercel E2E - Status & Health Check', () => {
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

  describe('AC9: Vercel Status', () => {
    it('should return connected status with username when active Vercel integration exists', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.ACTIVE,
        externalUsername: MOCK_VERCEL_USER.username,
        connectedAt: new Date('2026-02-16T00:00:00.000Z'),
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      const result = await service.getVercelStatus(MOCK_WORKSPACE_ID);

      expect(result.connected).toBe(true);
      expect(result.username).toBe(MOCK_VERCEL_USER.username);
      expect(result.connectedAt).toBeDefined();
    });

    it('should return disconnected status when no active Vercel integration', async () => {
      mocks.mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getVercelStatus(MOCK_WORKSPACE_ID);

      expect(result.connected).toBe(false);
    });

    it('should return disconnected when integration exists but is DISCONNECTED', async () => {
      // findOne filters by status: ACTIVE, so disconnected record returns null
      mocks.mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getVercelStatus(MOCK_WORKSPACE_ID);

      expect(result.connected).toBe(false);
    });
  });

  describe('AC9: Vercel Integration Listing', () => {
    it('should list all integrations including Vercel without token data', async () => {
      const mockIntegrations = [
        {
          id: MOCK_INTEGRATION_ID,
          provider: IntegrationProvider.VERCEL,
          status: IntegrationStatus.ACTIVE,
          externalUsername: MOCK_VERCEL_USER.username,
          externalAvatarUrl: MOCK_VERCEL_USER.avatar,
          scopes: '',
          encryptedAccessToken: 'should-not-appear',
          encryptionIV: 'should-not-appear',
          connectedAt: new Date('2026-02-16T00:00:00.000Z'),
          lastUsedAt: new Date('2026-02-16T01:00:00.000Z'),
        },
      ];
      mocks.mockRepository.find.mockResolvedValue(mockIntegrations);

      const result = await service.getIntegrations(MOCK_WORKSPACE_ID);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const vercelIntegration = result.find(
        (i) => i.provider === 'vercel',
      );
      expect(vercelIntegration).toBeDefined();
      expect(vercelIntegration!.id).toBe(MOCK_INTEGRATION_ID);
      expect(vercelIntegration!.provider).toBe('vercel');
      expect(vercelIntegration!.status).toBe('active');
      expect(vercelIntegration!.externalUsername).toBe(MOCK_VERCEL_USER.username);
      expect(vercelIntegration!.externalAvatarUrl).toBe(MOCK_VERCEL_USER.avatar);
      expect(vercelIntegration!.connectedAt).toBeDefined();
    });

    it('should not expose encryptedAccessToken in integration list response', async () => {
      const mockIntegrations = [
        {
          id: MOCK_INTEGRATION_ID,
          provider: IntegrationProvider.VERCEL,
          status: IntegrationStatus.ACTIVE,
          externalUsername: MOCK_VERCEL_USER.username,
          externalAvatarUrl: MOCK_VERCEL_USER.avatar,
          scopes: '',
          encryptedAccessToken: 'encrypted-secret-data',
          encryptionIV: 'secret-iv-data',
          connectedAt: new Date('2026-02-16T00:00:00.000Z'),
          lastUsedAt: null,
        },
      ];
      mocks.mockRepository.find.mockResolvedValue(mockIntegrations);

      const result = await service.getIntegrations(MOCK_WORKSPACE_ID);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('encryptedAccessToken');
      expect(serialized).not.toContain('encryptionIV');
      expect(serialized).not.toContain('encrypted-secret-data');
      expect(serialized).not.toContain('secret-iv-data');
    });

    it('should include lastUsedAt when available', async () => {
      const mockIntegrations = [
        {
          id: MOCK_INTEGRATION_ID,
          provider: IntegrationProvider.VERCEL,
          status: IntegrationStatus.ACTIVE,
          externalUsername: MOCK_VERCEL_USER.username,
          externalAvatarUrl: MOCK_VERCEL_USER.avatar,
          scopes: '',
          connectedAt: new Date('2026-02-16T00:00:00.000Z'),
          lastUsedAt: new Date('2026-02-16T01:00:00.000Z'),
        },
      ];
      mocks.mockRepository.find.mockResolvedValue(mockIntegrations);

      const result = await service.getIntegrations(MOCK_WORKSPACE_ID);
      const vercelIntegration = result.find((i) => i.provider === 'vercel');

      expect(vercelIntegration!.lastUsedAt).toBeDefined();
    });
  });
});
