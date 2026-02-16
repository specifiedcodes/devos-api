import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import {
  MOCK_WORKSPACE_ID,
  MOCK_INTEGRATION_ID,
  MOCK_VERCEL_TOKEN,
  createVercelMockProviders,
  buildVercelTestingModule,
} from './vercel-test-helpers';

/**
 * Vercel Token Storage & Decryption E2E Tests
 * Story 15-5: AC4 - Encrypted token lifecycle
 */
describe('Vercel E2E - Token Storage & Decryption', () => {
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

  describe('AC4: Vercel Token Storage and Decryption', () => {
    it('should decrypt stored Vercel token successfully', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: 'encrypted-vercel-token-data',
        encryptionIV: 'test-vercel-iv-hex',
        lastUsedAt: null,
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      const result = await service.getDecryptedToken(
        MOCK_WORKSPACE_ID,
        IntegrationProvider.VERCEL,
      );

      expect(result).toBe(MOCK_VERCEL_TOKEN);
      expect(
        mocks.mockEncryptionService.decryptWithWorkspaceKey,
      ).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        'encrypted-vercel-token-data',
        'test-vercel-iv-hex',
      );
    });

    it('should update lastUsedAt timestamp on decryption', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: 'encrypted-vercel-token-data',
        encryptionIV: 'test-vercel-iv-hex',
        lastUsedAt: null,
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      await service.getDecryptedToken(
        MOCK_WORKSPACE_ID,
        IntegrationProvider.VERCEL,
      );

      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.lastUsedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException when no active Vercel integration exists', async () => {
      mocks.mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDecryptedToken(
          MOCK_WORKSPACE_ID,
          IntegrationProvider.VERCEL,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when decryption fails', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: 'corrupted-data',
        encryptionIV: 'corrupted-iv',
        lastUsedAt: null,
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);
      mocks.mockEncryptionService.decryptWithWorkspaceKey.mockImplementation(
        () => {
          throw new Error('Decryption failed');
        },
      );

      await expect(
        service.getDecryptedToken(
          MOCK_WORKSPACE_ID,
          IntegrationProvider.VERCEL,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct message when decryption fails', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.VERCEL,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: 'corrupted-data',
        encryptionIV: 'corrupted-iv',
        lastUsedAt: null,
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);
      mocks.mockEncryptionService.decryptWithWorkspaceKey.mockImplementation(
        () => {
          throw new Error('Decryption failed');
        },
      );

      await expect(
        service.getDecryptedToken(
          MOCK_WORKSPACE_ID,
          IntegrationProvider.VERCEL,
        ),
      ).rejects.toThrow('Failed to decrypt integration token');
    });

    it('should not return token for disconnected Vercel integration', async () => {
      // findOne filters by status: ACTIVE, so a disconnected record returns null
      mocks.mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDecryptedToken(
          MOCK_WORKSPACE_ID,
          IntegrationProvider.VERCEL,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should verify stored token is not plaintext after callback saves it', async () => {
      // Run the actual callback flow so the service encrypts and saves the token
      const { of } = await import('rxjs');
      const { createAxiosResponse, MOCK_VERCEL_TOKEN_RESPONSE, MOCK_VERCEL_USER_INFO_RESPONSE } =
        await import('./vercel-test-helpers');

      const mockState = 'token-plaintext-check-state';
      const mockStateKey = `vercel-oauth-state:${mockState}`;
      mocks.mockRedisService.get.mockImplementation((key: string) => {
        if (key === mockStateKey) {
          return Promise.resolve(
            JSON.stringify({
              userId: '22222222-2222-2222-2222-222222222222',
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

      // Verify the saved entity's encrypted token is NOT the plaintext token
      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptedAccessToken).not.toBe(MOCK_VERCEL_TOKEN);
      expect(savedEntity.encryptedAccessToken).toBeTruthy();
      expect(savedEntity.encryptionIV).toBeTruthy();
      expect(savedEntity.encryptionIV.length).toBeGreaterThan(0);
    });
  });
});
