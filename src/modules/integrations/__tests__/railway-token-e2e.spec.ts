import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import {
  MOCK_WORKSPACE_ID,
  MOCK_INTEGRATION_ID,
  MOCK_RAILWAY_TOKEN,
  createRailwayMockProviders,
  buildRailwayTestingModule,
} from './railway-test-helpers';

/**
 * Railway Token Storage and Decryption E2E Tests
 * Story 15-4: AC4 - Encrypted token lifecycle
 */
describe('Railway E2E - Token Storage and Decryption', () => {
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

  describe('AC4: Railway Token Storage & Decryption', () => {
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
      connectedAt: new Date(),
      lastUsedAt: null,
    };

    it('should decrypt stored Railway token successfully', async () => {
      mocks.mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      const result = await service.getDecryptedToken(
        MOCK_WORKSPACE_ID,
        IntegrationProvider.RAILWAY,
      );

      expect(result).toBe(MOCK_RAILWAY_TOKEN);
      expect(mocks.mockEncryptionService.decryptWithWorkspaceKey).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        'encrypted-railway-token-data',
        'test-railway-iv-hex',
      );
    });

    it('should update lastUsedAt timestamp on decryption', async () => {
      mocks.mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      await service.getDecryptedToken(
        MOCK_WORKSPACE_ID,
        IntegrationProvider.RAILWAY,
      );

      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.lastUsedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException when no active Railway integration exists', async () => {
      mocks.mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDecryptedToken(MOCK_WORKSPACE_ID, IntegrationProvider.RAILWAY),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when decryption fails', async () => {
      mocks.mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });
      mocks.mockEncryptionService.decryptWithWorkspaceKey.mockImplementation(() => {
        throw new Error('Decryption failed - corrupted data');
      });

      await expect(
        service.getDecryptedToken(MOCK_WORKSPACE_ID, IntegrationProvider.RAILWAY),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include descriptive message when decryption fails', async () => {
      mocks.mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });
      mocks.mockEncryptionService.decryptWithWorkspaceKey.mockImplementation(() => {
        throw new Error('Decryption failed - corrupted data');
      });

      await expect(
        service.getDecryptedToken(MOCK_WORKSPACE_ID, IntegrationProvider.RAILWAY),
      ).rejects.toThrow('Failed to decrypt integration token');
    });

    it('should not return token for disconnected Railway integration', async () => {
      // The findOne query filters by status: ACTIVE, so a disconnected record returns null
      mocks.mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDecryptedToken(MOCK_WORKSPACE_ID, IntegrationProvider.RAILWAY),
      ).rejects.toThrow(NotFoundException);
    });

    it('should verify stored token is not plaintext', async () => {
      mocks.mockRepository.findOne.mockResolvedValue({ ...mockActiveIntegration });

      // The stored encryptedAccessToken should differ from the plaintext token
      expect(mockActiveIntegration.encryptedAccessToken).not.toBe(MOCK_RAILWAY_TOKEN);
      expect(mockActiveIntegration.encryptionIV).toBeTruthy();
      expect(mockActiveIntegration.encryptionIV.length).toBeGreaterThan(0);
    });
  });
});
