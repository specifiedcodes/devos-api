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
  MOCK_SUPABASE_TOKEN_RESPONSE,
  createAxiosResponse,
  createSupabaseMockProviders,
  buildSupabaseTestingModule,
} from './supabase-test-helpers';

/**
 * Supabase Disconnect and Re-authorization E2E Tests
 * Story 15-6: AC10 - Disconnect and re-connect flows
 */
describe('Supabase E2E - Disconnect & Re-authorization', () => {
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

  describe('AC10: Supabase Disconnect and Re-authorization', () => {
    it('should disconnect active Supabase integration', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.SUPABASE,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: 'encrypted-token',
        encryptionIV: 'test-iv',
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      const result = await service.disconnectIntegration(
        MOCK_WORKSPACE_ID,
        'supabase',
        MOCK_USER_ID,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Supabase integration disconnected');

      // Verify status changed and tokens cleared
      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.status).toBe(IntegrationStatus.DISCONNECTED);
      expect(savedEntity.encryptedAccessToken).toBe('');
      expect(savedEntity.encryptionIV).toBe('');
    });

    it('should log audit event for disconnect', async () => {
      const mockIntegration = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.SUPABASE,
        status: IntegrationStatus.ACTIVE,
        encryptedAccessToken: 'encrypted-token',
        encryptionIV: 'test-iv',
      };
      mocks.mockRepository.findOne.mockResolvedValue(mockIntegration);

      await service.disconnectIntegration(
        MOCK_WORKSPACE_ID,
        'supabase',
        MOCK_USER_ID,
      );

      expect(mocks.mockAuditService.log).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_USER_ID,
        expect.any(String),
        'integration',
        MOCK_INTEGRATION_ID,
        expect.objectContaining({
          action: 'integration.supabase.disconnected',
          provider: 'supabase',
        }),
      );
    });

    it('should throw NotFoundException when disconnecting non-existent Supabase integration', async () => {
      mocks.mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.disconnectIntegration(
          MOCK_WORKSPACE_ID,
          'supabase',
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

    it('should allow re-authorization after disconnect (upsert existing record)', async () => {
      // Start with a disconnected record
      const disconnectedRecord = {
        id: MOCK_INTEGRATION_ID,
        workspaceId: MOCK_WORKSPACE_ID,
        provider: IntegrationProvider.SUPABASE,
        status: IntegrationStatus.DISCONNECTED,
        encryptedAccessToken: '',
        encryptionIV: '',
      };
      mocks.mockRepository.findOne.mockResolvedValue(disconnectedRecord);

      // Setup CSRF state for callback
      const mockState = 'reauth-state';
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

      await service.handleSupabaseCallback('new-auth-code', mockState);

      // Verify record was updated, not created new
      expect(mocks.mockRepository.create).not.toHaveBeenCalled();
      expect(mocks.mockRepository.save).toHaveBeenCalled();
      const savedEntity = mocks.mockRepository.save.mock.calls[0][0];
      expect(savedEntity.status).toBe(IntegrationStatus.ACTIVE);
      expect(savedEntity.encryptedAccessToken).toBe(
        MOCK_ENCRYPTED_SUPABASE_TOKEN,
      );
    });
  });
});
