import { NotFoundException, BadRequestException } from '@nestjs/common';
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
  MOCK_VERCEL_USER,
  MOCK_VERCEL_TOKEN,
  MOCK_VERCEL_TOKEN_RESPONSE,
  MOCK_VERCEL_USER_INFO_RESPONSE,
  createAxiosResponse,
  createVercelMockProviders,
  buildVercelTestingModule,
} from './vercel-test-helpers';

/**
 * Vercel Disconnect and Re-authorization E2E Tests
 * Story 15-5: AC10 - Disconnect flow and re-connect
 */
describe('Vercel E2E - Disconnect & Re-authorization', () => {
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

  describe('AC10: Vercel Disconnect', () => {
    it('should disconnect active Vercel integration', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: 'encrypted-data',
        encryptionIV: 'iv-data',
        externalUsername: MOCK_VERCEL_USER.username,
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      const result = await service.disconnectIntegration(
        MOCK_WORKSPACE_ID,
        'vercel',
        MOCK_USER_ID,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Vercel integration disconnected');
    });

    it('should mark integration as DISCONNECTED', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: 'encrypted-data',
        encryptionIV: 'iv-data',
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      await service.disconnectIntegration(
        MOCK_WORKSPACE_ID,
        'vercel',
        MOCK_USER_ID,
      );

      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.status).toBe(IntegrationStatus.DISCONNECTED);
    });

    it('should clear encryptedAccessToken and encryptionIV on disconnect', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: 'encrypted-data',
        encryptionIV: 'iv-data',
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      await service.disconnectIntegration(
        MOCK_WORKSPACE_ID,
        'vercel',
        MOCK_USER_ID,
      );

      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptedAccessToken).toBe('');
      expect(savedEntity.encryptionIV).toBe('');
    });

    it('should log audit event integration.vercel.disconnected', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: 'encrypted-data',
        encryptionIV: 'iv-data',
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      await service.disconnectIntegration(
        MOCK_WORKSPACE_ID,
        'vercel',
        MOCK_USER_ID,
      );

      expect(mocks.mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        MOCK_INTEGRATION_ID,
        expect.objectContaining({
          action: 'integration.vercel.disconnected',
          provider: 'vercel',
        }),
      );
    });

    it('should throw NotFoundException when disconnecting non-existent Vercel integration', async () => {
      mocks.mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.disconnectIntegration(
          MOCK_WORKSPACE_ID,
          'vercel',
          MOCK_USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid provider', async () => {
      await expect(
        service.disconnectIntegration(
          MOCK_WORKSPACE_ID,
          'invalid_provider',
          MOCK_USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct message for invalid provider', async () => {
      await expect(
        service.disconnectIntegration(
          MOCK_WORKSPACE_ID,
          'invalid_provider',
          MOCK_USER_ID,
        ),
      ).rejects.toThrow('Invalid integration provider');
    });
  });

  describe('AC10: Vercel Re-authorization After Disconnect', () => {
    it('should allow re-authorization after disconnect (upsert existing record)', async () => {
      // Setup: existing disconnected record
      const disconnectedRecord = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.DISCONNECTED,
        encryptedAccessToken: '',
        encryptionIV: '',
      };
      mocks.mockRepository.findOne.mockResolvedValue(disconnectedRecord);

      // Mock OAuth flow
      const mockState = 're-auth-state';
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

      // Execute callback
      const result = await service.handleVercelCallback(
        'new-auth-code',
        mockState,
      );

      expect(result.redirectUrl).toContain('vercel=connected');

      // Verify record was updated (not created new)
      expect(mocks.mockRepository.create).not.toHaveBeenCalled();
      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
      expect(savedEntity.encryptedAccessToken).toBe(
        'encrypted-vercel-token-data',
      );
    });
  });
});
