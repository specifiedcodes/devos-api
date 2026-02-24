/**
 * IpAllowlistService Tests
 *
 * Story 20-4: IP Allowlisting
 * Target: 60+ tests covering IP validation, CIDR matching, CRUD, config, checkIp, cache, blocked attempts
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { IpAllowlistService } from '../services/ip-allowlist.service';
import { IpAllowlistEntry } from '../../../database/entities/ip-allowlist-entry.entity';
import { IpAllowlistConfig } from '../../../database/entities/ip-allowlist-config.entity';
import { RedisService } from '../../redis/redis.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';

describe('IpAllowlistService', () => {
  let service: IpAllowlistService;
  let entryRepo: jest.Mocked<Repository<IpAllowlistEntry>>;
  let configRepo: jest.Mocked<Repository<IpAllowlistConfig>>;
  let redisService: jest.Mocked<RedisService>;
  let auditService: jest.Mocked<AuditService>;
  let mockDataSource: jest.Mocked<DataSource>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockEntryId = '33333333-3333-3333-3333-333333333333';

  function createMockEntry(overrides?: Partial<IpAllowlistEntry>): IpAllowlistEntry {
    return {
      id: mockEntryId,
      workspaceId: mockWorkspaceId,
      ipAddress: '203.0.113.50',
      description: 'Office VPN',
      isActive: true,
      createdBy: mockUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as IpAllowlistEntry;
  }

  function createMockConfig(overrides?: Partial<IpAllowlistConfig>): IpAllowlistConfig {
    return {
      id: '44444444-4444-4444-4444-444444444444',
      workspaceId: mockWorkspaceId,
      isEnabled: false,
      gracePeriodEndsAt: null,
      emergencyDisableUntil: null,
      lastModifiedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as IpAllowlistConfig;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpAllowlistService,
        {
          provide: getRepositoryToken(IpAllowlistEntry),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockImplementation((dto) => ({ ...dto, id: mockEntryId })),
            save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...createMockEntry(), ...entity })),
            remove: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(IpAllowlistConfig),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((dto) => ({ ...dto })),
            save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...createMockConfig(), ...entity })),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            zadd: jest.fn().mockResolvedValue(1),
            zrevrange: jest.fn().mockResolvedValue([]),
            zremrangebyrank: jest.fn().mockResolvedValue(0),
            expire: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IpAllowlistService>(IpAllowlistService);
    entryRepo = module.get(getRepositoryToken(IpAllowlistEntry));
    configRepo = module.get(getRepositoryToken(IpAllowlistConfig));
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
    auditService = module.get(AuditService) as jest.Mocked<AuditService>;
    mockDataSource = module.get(DataSource) as jest.Mocked<DataSource>;

    // Set up DataSource.transaction to execute the callback with a mock manager
    // that delegates to the same entryRepo mock
    mockDataSource.transaction.mockImplementation(async (cb: any) => {
      const mockManager = {
        getRepository: jest.fn().mockReturnValue(entryRepo),
      };
      return cb(mockManager);
    });
  });

  // ==================== IP VALIDATION ====================

  describe('validateIpOrCidr', () => {
    it('should accept valid IPv4 address', () => {
      expect(() => service.validateIpOrCidr('203.0.113.50')).not.toThrow();
    });

    it('should accept valid IPv4 CIDR notation /8', () => {
      expect(() => service.validateIpOrCidr('10.0.0.0/8')).not.toThrow();
    });

    it('should accept valid IPv4 CIDR notation /16', () => {
      expect(() => service.validateIpOrCidr('192.168.0.0/16')).not.toThrow();
    });

    it('should accept valid IPv4 CIDR notation /24', () => {
      expect(() => service.validateIpOrCidr('10.0.0.0/24')).not.toThrow();
    });

    it('should accept valid IPv4 CIDR notation /32 (exact match)', () => {
      expect(() => service.validateIpOrCidr('10.0.0.1/32')).not.toThrow();
    });

    it('should accept valid IPv4 CIDR notation /0 (all)', () => {
      expect(() => service.validateIpOrCidr('0.0.0.0/0')).not.toThrow();
    });

    it('should accept valid IPv6 address', () => {
      expect(() => service.validateIpOrCidr('::1')).not.toThrow();
    });

    it('should accept valid IPv6 CIDR notation', () => {
      expect(() => service.validateIpOrCidr('fe80::1/64')).not.toThrow();
    });

    it('should reject invalid IP address', () => {
      expect(() => service.validateIpOrCidr('not-an-ip')).toThrow(BadRequestException);
    });

    it('should reject IPv4 CIDR with prefix > 32', () => {
      expect(() => service.validateIpOrCidr('10.0.0.0/33')).toThrow(BadRequestException);
    });

    it('should reject IPv6 CIDR with prefix > 128', () => {
      expect(() => service.validateIpOrCidr('::1/129')).toThrow(BadRequestException);
    });

    it('should reject CIDR with invalid base address', () => {
      expect(() => service.validateIpOrCidr('invalid/24')).toThrow(BadRequestException);
    });
  });

  // ==================== IP MATCHING ====================

  describe('isIpInRange', () => {
    it('should match exact IPv4 address', () => {
      expect(service.isIpInRange('203.0.113.50', '203.0.113.50')).toBe(true);
    });

    it('should not match different exact IPv4 address', () => {
      expect(service.isIpInRange('203.0.113.51', '203.0.113.50')).toBe(false);
    });

    it('should match IP within /24 CIDR range', () => {
      expect(service.isIpInRange('10.0.0.5', '10.0.0.0/24')).toBe(true);
    });

    it('should not match IP outside /24 CIDR range', () => {
      expect(service.isIpInRange('10.0.1.5', '10.0.0.0/24')).toBe(false);
    });

    it('should match IP within /8 CIDR range', () => {
      expect(service.isIpInRange('10.255.255.255', '10.0.0.0/8')).toBe(true);
    });

    it('should not match IP outside /8 CIDR range', () => {
      expect(service.isIpInRange('11.0.0.1', '10.0.0.0/8')).toBe(false);
    });

    it('should match IP within /16 CIDR range', () => {
      expect(service.isIpInRange('192.168.255.1', '192.168.0.0/16')).toBe(true);
    });

    it('should match with /32 CIDR (exact match)', () => {
      expect(service.isIpInRange('10.0.0.1', '10.0.0.1/32')).toBe(true);
    });

    it('should not match different IP with /32 CIDR', () => {
      expect(service.isIpInRange('10.0.0.2', '10.0.0.1/32')).toBe(false);
    });

    it('should match any IP with /0 CIDR', () => {
      expect(service.isIpInRange('1.2.3.4', '0.0.0.0/0')).toBe(true);
    });
  });

  // ==================== ENTRY CRUD ====================

  describe('createEntry', () => {
    it('should create an entry successfully', async () => {
      entryRepo.count.mockResolvedValue(0);
      entryRepo.findOne.mockResolvedValue(null);

      const result = await service.createEntry(mockWorkspaceId, mockUserId, {
        ipAddress: '203.0.113.50',
        description: 'Office VPN',
      });

      expect(result).toBeDefined();
      expect(result.ipAddress).toBe('203.0.113.50');
      expect(entryRepo.save).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate IP', async () => {
      entryRepo.count.mockResolvedValue(0);
      entryRepo.findOne.mockResolvedValue(createMockEntry());

      await expect(
        service.createEntry(mockWorkspaceId, mockUserId, {
          ipAddress: '203.0.113.50',
          description: 'Duplicate',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when max entries reached', async () => {
      entryRepo.count.mockResolvedValue(100);

      await expect(
        service.createEntry(mockWorkspaceId, mockUserId, {
          ipAddress: '203.0.113.50',
          description: 'Over limit',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid IP format', async () => {
      entryRepo.count.mockResolvedValue(0);
      entryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createEntry(mockWorkspaceId, mockUserId, {
          ipAddress: 'not-an-ip',
          description: 'Bad IP',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should fire-and-forget audit log on create', async () => {
      entryRepo.count.mockResolvedValue(0);
      entryRepo.findOne.mockResolvedValue(null);

      await service.createEntry(mockWorkspaceId, mockUserId, {
        ipAddress: '203.0.113.50',
        description: 'Audit test',
      });

      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.CREATE,
        'ip_allowlist_entry',
        expect.any(String),
        expect.objectContaining({ ipAddress: '203.0.113.50' }),
      );
    });
  });

  describe('updateEntry', () => {
    it('should update entry IP address', async () => {
      entryRepo.findOne
        .mockResolvedValueOnce(createMockEntry()) // Find existing entry
        .mockResolvedValueOnce(null); // No duplicate check

      const result = await service.updateEntry(mockWorkspaceId, mockEntryId, mockUserId, {
        ipAddress: '10.0.0.1',
      });

      expect(result).toBeDefined();
      expect(entryRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent entry', async () => {
      entryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateEntry(mockWorkspaceId, mockEntryId, mockUserId, {
          description: 'Updated',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on duplicate IP during update', async () => {
      entryRepo.findOne
        .mockResolvedValueOnce(createMockEntry()) // Find existing entry
        .mockResolvedValueOnce(createMockEntry({ id: 'other-id', ipAddress: '10.0.0.1' })); // Duplicate exists

      await expect(
        service.updateEntry(mockWorkspaceId, mockEntryId, mockUserId, {
          ipAddress: '10.0.0.1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should update description without IP validation', async () => {
      entryRepo.findOne.mockResolvedValue(createMockEntry());

      const result = await service.updateEntry(mockWorkspaceId, mockEntryId, mockUserId, {
        description: 'New description',
      });

      expect(result).toBeDefined();
    });

    it('should update isActive status', async () => {
      entryRepo.findOne.mockResolvedValue(createMockEntry());

      const result = await service.updateEntry(mockWorkspaceId, mockEntryId, mockUserId, {
        isActive: false,
      });

      expect(result).toBeDefined();
      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('deleteEntry', () => {
    it('should delete entry successfully', async () => {
      entryRepo.findOne.mockResolvedValue(createMockEntry());

      await service.deleteEntry(mockWorkspaceId, mockEntryId, mockUserId);

      expect(entryRepo.remove).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent entry', async () => {
      entryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deleteEntry(mockWorkspaceId, mockEntryId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listEntries', () => {
    it('should return all entries for workspace', async () => {
      const entries = [createMockEntry(), createMockEntry({ id: 'other-id', ipAddress: '10.0.0.1' })];
      entryRepo.find.mockResolvedValue(entries);

      const result = await service.listEntries(mockWorkspaceId);

      expect(result).toHaveLength(2);
      expect(entryRepo.find).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId },
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when no entries', async () => {
      entryRepo.find.mockResolvedValue([]);

      const result = await service.listEntries(mockWorkspaceId);

      expect(result).toHaveLength(0);
    });
  });

  // ==================== CONFIG OPERATIONS ====================

  describe('getConfig', () => {
    it('should return existing config', async () => {
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: true }));

      const result = await service.getConfig(mockWorkspaceId);

      expect(result.workspaceId).toBe(mockWorkspaceId);
      expect(result.isEnabled).toBe(true);
    });

    it('should create default config if not found', async () => {
      configRepo.findOne.mockResolvedValue(null);

      const result = await service.getConfig(mockWorkspaceId);

      expect(result.isEnabled).toBe(false);
      expect(configRepo.save).toHaveBeenCalled();
    });

    it('should compute isInGracePeriod correctly when in grace period', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 12);
      configRepo.findOne.mockResolvedValue(createMockConfig({
        isEnabled: true,
        gracePeriodEndsAt: futureDate,
      }));

      const result = await service.getConfig(mockWorkspaceId);

      expect(result.isInGracePeriod).toBe(true);
    });

    it('should compute isInGracePeriod correctly when grace period expired', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);
      configRepo.findOne.mockResolvedValue(createMockConfig({
        isEnabled: true,
        gracePeriodEndsAt: pastDate,
      }));

      const result = await service.getConfig(mockWorkspaceId);

      expect(result.isInGracePeriod).toBe(false);
    });

    it('should compute isEmergencyDisabled correctly', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 30);
      configRepo.findOne.mockResolvedValue(createMockConfig({
        isEnabled: true,
        emergencyDisableUntil: futureDate,
      }));

      const result = await service.getConfig(mockWorkspaceId);

      expect(result.isEmergencyDisabled).toBe(true);
    });
  });

  describe('updateConfig', () => {
    it('should enable allowlisting with grace period', async () => {
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: false }));
      entryRepo.findOne.mockResolvedValue(null); // No existing entry for auto-add
      entryRepo.count.mockResolvedValue(0);

      const result = await service.updateConfig(mockWorkspaceId, mockUserId, true, '1.2.3.4');

      expect(configRepo.save).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled(); // Config cache invalidated
    });

    it('should auto-add caller IP when enabling', async () => {
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: false }));
      entryRepo.findOne.mockResolvedValue(null); // No existing entry
      entryRepo.count.mockResolvedValue(0);

      await service.updateConfig(mockWorkspaceId, mockUserId, true, '1.2.3.4');

      expect(entryRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        ipAddress: '1.2.3.4',
        description: 'Auto-added: Admin IP on enablement',
      }));
    });

    it('should not auto-add caller IP if already in allowlist', async () => {
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: false }));
      // First findOne call for auto-add check returns existing entry
      entryRepo.findOne.mockResolvedValue(createMockEntry({ ipAddress: '1.2.3.4' }));

      await service.updateConfig(mockWorkspaceId, mockUserId, true, '1.2.3.4');

      // create should not be called for auto-add since IP already exists
      expect(entryRepo.create).not.toHaveBeenCalled();
    });

    it('should clear timers when disabling', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 12);
      configRepo.findOne.mockResolvedValue(createMockConfig({
        isEnabled: true,
        gracePeriodEndsAt: futureDate,
        emergencyDisableUntil: futureDate,
      }));

      await service.updateConfig(mockWorkspaceId, mockUserId, false, '1.2.3.4');

      expect(configRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isEnabled: false,
          gracePeriodEndsAt: null,
          emergencyDisableUntil: null,
        }),
      );
    });
  });

  describe('emergencyDisable', () => {
    it('should set emergency disable for 1 hour', async () => {
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: true }));

      const result = await service.emergencyDisable(mockWorkspaceId, mockUserId);

      expect(configRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          emergencyDisableUntil: expect.any(Date),
        }),
      );
    });

    it('should throw if allowlisting is not enabled', async () => {
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: false }));

      await expect(
        service.emergencyDisable(mockWorkspaceId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if no config exists', async () => {
      configRepo.findOne.mockResolvedValue(null);

      await expect(
        service.emergencyDisable(mockWorkspaceId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== CHECK IP (HOT PATH) ====================

  describe('checkIp', () => {
    it('should allow if allowlisting is not enabled', async () => {
      redisService.get.mockResolvedValue(null);
      configRepo.findOne.mockResolvedValue(null);

      const result = await service.checkIp(mockWorkspaceId, '1.2.3.4');

      expect(result.allowed).toBe(true);
      expect(result.inGracePeriod).toBe(false);
    });

    it('should allow if config is disabled', async () => {
      redisService.get.mockResolvedValue(JSON.stringify({
        isEnabled: false,
        gracePeriodEndsAt: null,
        emergencyDisableUntil: null,
      }));

      const result = await service.checkIp(mockWorkspaceId, '1.2.3.4');

      expect(result.allowed).toBe(true);
    });

    it('should allow if emergency disabled', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 30);
      redisService.get.mockResolvedValueOnce(JSON.stringify({
        isEnabled: true,
        gracePeriodEndsAt: null,
        emergencyDisableUntil: futureDate.toISOString(),
      }));

      const result = await service.checkIp(mockWorkspaceId, '1.2.3.4');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('emergency_disabled');
    });

    it('should allow if IP is in allowlist', async () => {
      redisService.get
        .mockResolvedValueOnce(JSON.stringify({
          isEnabled: true,
          gracePeriodEndsAt: null,
          emergencyDisableUntil: null,
        }))
        .mockResolvedValueOnce(JSON.stringify([
          { ipAddress: '1.2.3.4', isActive: true },
        ]));

      const result = await service.checkIp(mockWorkspaceId, '1.2.3.4');

      expect(result.allowed).toBe(true);
    });

    it('should deny if IP is not in allowlist and no grace period', async () => {
      redisService.get
        .mockResolvedValueOnce(JSON.stringify({
          isEnabled: true,
          gracePeriodEndsAt: null,
          emergencyDisableUntil: null,
        }))
        .mockResolvedValueOnce(JSON.stringify([
          { ipAddress: '10.0.0.1', isActive: true },
        ]));

      const result = await service.checkIp(mockWorkspaceId, '1.2.3.4');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('ip_not_allowed');
    });

    it('should allow during grace period even if IP not matched (but log)', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 12);
      redisService.get
        .mockResolvedValueOnce(JSON.stringify({
          isEnabled: true,
          gracePeriodEndsAt: futureDate.toISOString(),
          emergencyDisableUntil: null,
        }))
        .mockResolvedValueOnce(JSON.stringify([
          { ipAddress: '10.0.0.1', isActive: true },
        ]));

      const result = await service.checkIp(mockWorkspaceId, '1.2.3.4');

      expect(result.allowed).toBe(true);
      expect(result.inGracePeriod).toBe(true);
      expect(result.reason).toBe('grace_period_would_deny');
    });

    it('should match CIDR range in allowlist', async () => {
      redisService.get
        .mockResolvedValueOnce(JSON.stringify({
          isEnabled: true,
          gracePeriodEndsAt: null,
          emergencyDisableUntil: null,
        }))
        .mockResolvedValueOnce(JSON.stringify([
          { ipAddress: '10.0.0.0/8', isActive: true },
        ]));

      const result = await service.checkIp(mockWorkspaceId, '10.255.255.1');

      expect(result.allowed).toBe(true);
    });

    it('should skip inactive entries when matching', async () => {
      redisService.get
        .mockResolvedValueOnce(JSON.stringify({
          isEnabled: true,
          gracePeriodEndsAt: null,
          emergencyDisableUntil: null,
        }))
        .mockResolvedValueOnce(JSON.stringify([
          { ipAddress: '1.2.3.4', isActive: false },
        ]));

      const result = await service.checkIp(mockWorkspaceId, '1.2.3.4');

      expect(result.allowed).toBe(false);
    });

    it('should fall back to DB when cache is empty', async () => {
      redisService.get.mockResolvedValue(null);
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: true }));
      entryRepo.find.mockResolvedValue([
        createMockEntry({ ipAddress: '1.2.3.4', isActive: true }),
      ]);

      const result = await service.checkIp(mockWorkspaceId, '1.2.3.4');

      expect(result.allowed).toBe(true);
      expect(configRepo.findOne).toHaveBeenCalled();
      expect(entryRepo.find).toHaveBeenCalled();
    });

    it('should write to cache after DB fallback for config', async () => {
      redisService.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: false }));

      await service.checkIp(mockWorkspaceId, '1.2.3.4');

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('ip_config:'),
        expect.any(String),
        300,
      );
    });
  });

  // ==================== TEST IP ====================

  describe('testIp', () => {
    it('should return allowed when IP matches active entry', async () => {
      entryRepo.find.mockResolvedValue([createMockEntry({ ipAddress: '1.2.3.4', isActive: true })]);
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: true }));

      const result = await service.testIp(mockWorkspaceId, '1.2.3.4');

      expect(result.isAllowed).toBe(true);
      expect(result.matchedEntry).not.toBeNull();
    });

    it('should return allowed when allowlisting is disabled', async () => {
      entryRepo.find.mockResolvedValue([]);
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: false }));

      const result = await service.testIp(mockWorkspaceId, '1.2.3.4');

      expect(result.isAllowed).toBe(true);
      expect(result.matchedEntry).toBeNull();
    });

    it('should return not allowed when IP does not match', async () => {
      entryRepo.find.mockResolvedValue([createMockEntry({ ipAddress: '10.0.0.1', isActive: true })]);
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: true }));

      const result = await service.testIp(mockWorkspaceId, '1.2.3.4');

      expect(result.isAllowed).toBe(false);
      expect(result.matchedEntry).toBeNull();
    });
  });

  // ==================== BLOCKED ATTEMPTS ====================

  describe('recordBlockedAttempt', () => {
    it('should record attempt to Redis sorted set', async () => {
      await service.recordBlockedAttempt(mockWorkspaceId, '1.2.3.4', mockUserId, 'GET /api/test');

      expect(redisService.zadd).toHaveBeenCalled();
      expect(redisService.zremrangebyrank).toHaveBeenCalled();
      expect(redisService.expire).toHaveBeenCalled();
    });

    it('should not throw on Redis failure', async () => {
      redisService.zadd.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.recordBlockedAttempt(mockWorkspaceId, '1.2.3.4', null, 'GET /api/test'),
      ).resolves.not.toThrow();
    });
  });

  describe('getBlockedAttempts', () => {
    it('should return parsed blocked attempts', async () => {
      const mockAttempt = { ipAddress: '1.2.3.4', userId: null, endpoint: 'GET /test', timestamp: new Date().toISOString() };
      redisService.zrevrange.mockResolvedValue([JSON.stringify(mockAttempt)]);

      const result = await service.getBlockedAttempts(mockWorkspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].ipAddress).toBe('1.2.3.4');
    });

    it('should return empty array on Redis failure', async () => {
      redisService.zrevrange.mockRejectedValue(new Error('Redis error'));

      const result = await service.getBlockedAttempts(mockWorkspaceId);

      expect(result).toHaveLength(0);
    });
  });

  // ==================== CACHE INTEGRATION ====================

  describe('cache integration', () => {
    it('should use cached config on cache hit', async () => {
      redisService.get.mockResolvedValueOnce(JSON.stringify({
        isEnabled: false,
        gracePeriodEndsAt: null,
        emergencyDisableUntil: null,
      }));

      await service.checkIp(mockWorkspaceId, '1.2.3.4');

      expect(configRepo.findOne).not.toHaveBeenCalled();
    });

    it('should invalidate entry cache on create', async () => {
      entryRepo.count.mockResolvedValue(0);
      entryRepo.findOne.mockResolvedValue(null);

      await service.createEntry(mockWorkspaceId, mockUserId, {
        ipAddress: '1.2.3.4',
        description: 'Test',
      });

      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringContaining('ip_allowlist:'),
      );
    });

    it('should invalidate config cache on config update', async () => {
      configRepo.findOne.mockResolvedValue(createMockConfig({ isEnabled: false }));
      entryRepo.findOne.mockResolvedValue(null);
      entryRepo.count.mockResolvedValue(0);

      await service.updateConfig(mockWorkspaceId, mockUserId, true, '1.2.3.4');

      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringContaining('ip_config:'),
      );
    });
  });
});
