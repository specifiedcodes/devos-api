/**
 * IpAllowlistController Tests
 *
 * Story 20-4: IP Allowlisting
 * Target: 15 tests covering all 9 endpoints
 */
import { Test, TestingModule } from '@nestjs/testing';
import { IpAllowlistController } from '../controllers/ip-allowlist.controller';
import { IpAllowlistService } from '../services/ip-allowlist.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';

describe('IpAllowlistController', () => {
  let controller: IpAllowlistController;
  let service: jest.Mocked<IpAllowlistService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockEntryId = '33333333-3333-3333-3333-333333333333';

  const mockConfig = {
    workspaceId: mockWorkspaceId,
    isEnabled: false,
    gracePeriodEndsAt: null,
    emergencyDisableUntil: null,
    isInGracePeriod: false,
    isEmergencyDisabled: false,
  };

  const mockEntry = {
    id: mockEntryId,
    workspaceId: mockWorkspaceId,
    ipAddress: '203.0.113.50',
    description: 'Office VPN',
    isActive: true,
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReq = {
    user: { id: mockUserId },
    ip: '127.0.0.1',
    headers: {},
    connection: { remoteAddress: '127.0.0.1' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IpAllowlistController],
      providers: [
        {
          provide: IpAllowlistService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue(mockConfig),
            updateConfig: jest.fn().mockResolvedValue({ ...mockConfig, isEnabled: true }),
            emergencyDisable: jest.fn().mockResolvedValue({ ...mockConfig, isEmergencyDisabled: true }),
            listEntries: jest.fn().mockResolvedValue([mockEntry]),
            createEntry: jest.fn().mockResolvedValue(mockEntry),
            updateEntry: jest.fn().mockResolvedValue({ ...mockEntry, description: 'Updated' }),
            deleteEntry: jest.fn().mockResolvedValue(undefined),
            testIp: jest.fn().mockResolvedValue({
              ipAddress: '127.0.0.1',
              isAllowed: true,
              matchedEntry: null,
              isGracePeriod: false,
            }),
            getBlockedAttempts: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<IpAllowlistController>(IpAllowlistController);
    service = module.get(IpAllowlistService) as jest.Mocked<IpAllowlistService>;
  });

  // ==================== CONFIG ENDPOINTS ====================

  describe('getConfig', () => {
    it('should return IP allowlist configuration', async () => {
      const result = await controller.getConfig(mockWorkspaceId);

      expect(result).toEqual(mockConfig);
      expect(service.getConfig).toHaveBeenCalledWith(mockWorkspaceId);
    });
  });

  describe('updateConfig', () => {
    it('should enable IP allowlisting', async () => {
      const result = await controller.updateConfig(
        mockWorkspaceId,
        { isEnabled: true },
        mockReq,
      );

      expect(result.isEnabled).toBe(true);
      expect(service.updateConfig).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        true,
        expect.any(String),
      );
    });

    it('should use request.ip for client IP extraction (trust proxy)', async () => {
      const reqWithIp = {
        ...mockReq,
        ip: '203.0.113.50',
        headers: { 'x-forwarded-for': '10.0.0.1, 192.168.0.1' },
      };

      await controller.updateConfig(mockWorkspaceId, { isEnabled: true }, reqWithIp);

      // Should use request.ip, NOT X-Forwarded-For
      expect(service.updateConfig).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        true,
        '203.0.113.50',
      );
    });
  });

  describe('emergencyDisable', () => {
    it('should emergency disable IP allowlisting', async () => {
      const result = await controller.emergencyDisable(mockWorkspaceId, mockReq);

      expect(result.isEmergencyDisabled).toBe(true);
      expect(service.emergencyDisable).toHaveBeenCalledWith(mockWorkspaceId, mockUserId);
    });
  });

  // ==================== ENTRY ENDPOINTS ====================

  describe('listEntries', () => {
    it('should return all entries for workspace', async () => {
      const result = await controller.listEntries(mockWorkspaceId);

      expect(result).toHaveLength(1);
      expect(service.listEntries).toHaveBeenCalledWith(mockWorkspaceId);
    });
  });

  describe('createEntry', () => {
    it('should create a new entry', async () => {
      const dto = { ipAddress: '203.0.113.50', description: 'Office VPN' };

      const result = await controller.createEntry(mockWorkspaceId, dto, mockReq);

      expect(result.ipAddress).toBe('203.0.113.50');
      expect(service.createEntry).toHaveBeenCalledWith(mockWorkspaceId, mockUserId, dto);
    });
  });

  describe('updateEntry', () => {
    it('should update an existing entry', async () => {
      const dto = { description: 'Updated' };

      const result = await controller.updateEntry(mockWorkspaceId, mockEntryId, dto, mockReq);

      expect(result.description).toBe('Updated');
      expect(service.updateEntry).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockEntryId,
        mockUserId,
        dto,
      );
    });
  });

  describe('deleteEntry', () => {
    it('should delete an entry', async () => {
      await controller.deleteEntry(mockWorkspaceId, mockEntryId, mockReq);

      expect(service.deleteEntry).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockEntryId,
        mockUserId,
      );
    });
  });

  // ==================== TEST & MONITOR ENDPOINTS ====================

  describe('testIp', () => {
    it('should test current IP', async () => {
      const result = await controller.testIp(mockWorkspaceId, mockReq);

      expect(result.ipAddress).toBeDefined();
      expect(result.isAllowed).toBe(true);
      expect(service.testIp).toHaveBeenCalledWith(mockWorkspaceId, expect.any(String));
    });
  });

  describe('getBlockedAttempts', () => {
    it('should return empty blocked attempts', async () => {
      const result = await controller.getBlockedAttempts(mockWorkspaceId);

      expect(result).toHaveLength(0);
      expect(service.getBlockedAttempts).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('should return populated blocked attempts', async () => {
      service.getBlockedAttempts.mockResolvedValue([
        { ipAddress: '1.2.3.4', userId: null, endpoint: 'GET /test', timestamp: new Date().toISOString() },
      ]);

      const result = await controller.getBlockedAttempts(mockWorkspaceId);

      expect(result).toHaveLength(1);
    });
  });
});
