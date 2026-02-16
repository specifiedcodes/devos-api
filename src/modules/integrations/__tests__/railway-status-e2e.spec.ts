import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import {
  MOCK_WORKSPACE_ID,
  MOCK_INTEGRATION_ID,
  createRailwayMockProviders,
  buildRailwayTestingModule,
} from './railway-test-helpers';

/**
 * Railway Integration Status and Health Check E2E Tests
 * Story 15-4: AC9 - Status endpoint and token health
 */
describe('Railway E2E - Status and Health Check', () => {
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

  describe('AC9: Railway Status and Health', () => {
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
      connectedAt: new Date('2026-02-15T10:00:00.000Z'),
      lastUsedAt: new Date('2026-02-16T08:00:00.000Z'),
      scopes: '',
    };

    it('should return connected status with username when active Railway integration exists', async () => {
      mocks.mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      const result = await service.getRailwayStatus(MOCK_WORKSPACE_ID);

      expect(result.connected).toBe(true);
      expect(result.username).toBe('Railway User');
      expect(result.connectedAt).toBeDefined();
    });

    it('should return disconnected status when no active Railway integration', async () => {
      mocks.mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getRailwayStatus(MOCK_WORKSPACE_ID);

      expect(result.connected).toBe(false);
      expect(result.username).toBeUndefined();
    });

    it('should return disconnected when integration exists but is DISCONNECTED', async () => {
      // The findOne query filters by status: ACTIVE, so a disconnected record returns null
      mocks.mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getRailwayStatus(MOCK_WORKSPACE_ID);

      expect(result.connected).toBe(false);
    });

    it('should list all integrations including Railway without token data', async () => {
      mocks.mockRepository.find.mockResolvedValue([
        { ...mockActiveIntegration },
      ]);

      const result = await service.getIntegrations(MOCK_WORKSPACE_ID);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const railwayIntegration = result.find((i) => i.provider === 'railway');
      expect(railwayIntegration).toBeDefined();
      expect(railwayIntegration!.id).toBe(MOCK_INTEGRATION_ID);
      expect(railwayIntegration!.provider).toBe('railway');
      expect(railwayIntegration!.status).toBe('active');
      expect(railwayIntegration!.externalUsername).toBe('Railway User');
      expect(railwayIntegration!.externalAvatarUrl).toBe('https://railway.app/avatar.png');
      expect(railwayIntegration!.connectedAt).toBeDefined();
    });

    it('should NOT expose encryptedAccessToken or encryptionIV in integration list', async () => {
      mocks.mockRepository.find.mockResolvedValue([
        { ...mockActiveIntegration },
      ]);

      const result = await service.getIntegrations(MOCK_WORKSPACE_ID);

      result.forEach((integration) => {
        expect((integration as any).encryptedAccessToken).toBeUndefined();
        expect((integration as any).encryptionIV).toBeUndefined();
      });
    });
  });
});
