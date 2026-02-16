import { of } from 'rxjs';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IntegrationConnectionService } from '../integration-connection.service';
import {
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import {
  MOCK_WORKSPACE_ID,
  MOCK_USER_ID,
  MOCK_INTEGRATION_ID,
  MOCK_SUPABASE_TOKEN,
  MOCK_ENCRYPTED_SUPABASE_TOKEN,
  MOCK_SUPABASE_IV,
  MOCK_SUPABASE_TOKEN_RESPONSE,
  createAxiosResponse,
  createSupabaseMockProviders,
  buildSupabaseTestingModule,
} from './supabase-test-helpers';

/**
 * Supabase Token Storage and Decryption E2E Tests
 * Story 15-6: AC4 - Token lifecycle verification
 */
describe('Supabase E2E - Token Storage & Decryption', () => {
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

  describe('AC4: Supabase Token Storage and Decryption', () => {
    it('should decrypt stored Supabase token successfully', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.SUPABASE,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: MOCK_ENCRYPTED_SUPABASE_TOKEN,
        encryptionIV: MOCK_SUPABASE_IV,
        lastUsedAt: null,
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      const result = await service.getDecryptedToken(
        MOCK_WORKSPACE_ID,
        IntegrationProvider.SUPABASE,
      );

      expect(result).toBe(MOCK_SUPABASE_TOKEN);
      expect(
        mocks.mockEncryptionService.decryptWithWorkspaceKey,
      ).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_ENCRYPTED_SUPABASE_TOKEN,
        MOCK_SUPABASE_IV,
      );
    });

    it('should update lastUsedAt timestamp on decryption', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.SUPABASE,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: MOCK_ENCRYPTED_SUPABASE_TOKEN,
        encryptionIV: MOCK_SUPABASE_IV,
        lastUsedAt: null,
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      await service.getDecryptedToken(
        MOCK_WORKSPACE_ID,
        IntegrationProvider.SUPABASE,
      );

      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.lastUsedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException when no active Supabase integration exists', async () => {
      mocks.mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDecryptedToken(
          MOCK_WORKSPACE_ID,
          IntegrationProvider.SUPABASE,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when decryption fails', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.SUPABASE,
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
          IntegrationProvider.SUPABASE,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct message when decryption fails', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.SUPABASE,
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
          IntegrationProvider.SUPABASE,
        ),
      ).rejects.toThrow('Failed to decrypt integration token');
    });

    it('should not return token for disconnected Supabase integration', async () => {
      // findOne returns null because query filters by status: ACTIVE
      mocks.mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDecryptedToken(
          MOCK_WORKSPACE_ID,
          IntegrationProvider.SUPABASE,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should verify stored token is not plaintext after successful callback', async () => {
      // Simulate a successful callback
      const mockState = 'token-verify-state';
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

      await service.handleSupabaseCallback('valid-code', mockState);

      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.encryptedAccessToken).not.toBe(MOCK_SUPABASE_TOKEN);
      expect(savedEntity.encryptionIV).toBeTruthy();
      expect(savedEntity.encryptionIV.length).toBeGreaterThan(0);
    });
  });
});
