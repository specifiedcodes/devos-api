import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { of } from 'rxjs';
import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import {
  MOCK_WORKSPACE_ID,
  MOCK_USER_ID,
  MOCK_INTEGRATION_ID,
  MOCK_RAILWAY_TOKEN_RESPONSE,
  MOCK_RAILWAY_USER_INFO_RESPONSE,
  createAxiosResponse,
  createRailwayMockProviders,
  buildRailwayTestingModule,
} from './railway-test-helpers';

/**
 * Railway Disconnect and Re-authorization E2E Tests
 * Story 15-4: AC10 - Disconnect and re-connect flows
 */
describe('Railway E2E - Disconnect and Re-authorization', () => {
  let service: IntegrationConnectionService;
  let mocks: ReturnType<typeof createRailwayMockProviders>;

  const mockActiveIntegration = {
    id: MOCK_INTEGRATION_ID,
    workspaceId: MOCK_WORKSPACE_ID,
    userId: MOCK_USER_ID,
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

  describe('AC10: Railway Disconnect', () => {
    it('should disconnect active Railway integration', async () => {
      mocks.mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      const result = await service.disconnectIntegration(
        MOCK_WORKSPACE_ID,
        'railway',
        MOCK_USER_ID,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Railway integration disconnected');

      // Verify integration was updated
      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.status).toBe(IntegrationStatus.DISCONNECTED);
      expect(savedEntity.encryptedAccessToken).toBe('');
      expect(savedEntity.encryptionIV).toBe('');
    });

    it('should log audit event integration.railway.disconnected', async () => {
      mocks.mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      await service.disconnectIntegration(
        MOCK_WORKSPACE_ID,
        'railway',
        MOCK_USER_ID,
      );

      expect(mocks.mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        MOCK_INTEGRATION_ID,
        expect.objectContaining({
          action: 'integration.railway.disconnected',
          provider: 'railway',
          result: 'success',
        }),
      );
    });

    it('should throw NotFoundException when disconnecting non-existent Railway integration', async () => {
      mocks.mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.disconnectIntegration(MOCK_WORKSPACE_ID, 'railway', MOCK_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid provider', async () => {
      await expect(
        service.disconnectIntegration(MOCK_WORKSPACE_ID, 'invalid_provider', MOCK_USER_ID),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.disconnectIntegration(MOCK_WORKSPACE_ID, 'invalid_provider', MOCK_USER_ID),
      ).rejects.toThrow('Invalid integration provider');
    });

    it('should allow re-authorization after disconnect (upsert existing record)', async () => {
      const disconnectedRecord = {
        ...mockActiveIntegration,
        status: IntegrationStatus.DISCONNECTED,
        encryptedAccessToken: '',
        encryptionIV: '',
      };

      mocks.mockRepository.findOne.mockResolvedValue({ ...disconnectedRecord });
      mocks.mockRedisService.get.mockResolvedValue(
        JSON.stringify({ userId: MOCK_USER_ID, workspaceId: MOCK_WORKSPACE_ID }),
      );
      mocks.mockHttpService.post
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_RAILWAY_TOKEN_RESPONSE)))
        .mockReturnValueOnce(of(createAxiosResponse(MOCK_RAILWAY_USER_INFO_RESPONSE)));

      const result = await service.handleRailwayCallback(
        'new-auth-code',
        'valid-state',
      );

      expect(result.redirectUrl).toContain('railway=connected');

      // Verify record was updated (not created new)
      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.id).toBe(MOCK_INTEGRATION_ID);
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
      expect(savedEntity.encryptedAccessToken).toBe('encrypted-railway-token-data');
      expect(savedEntity.connectedAt).toBeInstanceOf(Date);
    });
  });
});
