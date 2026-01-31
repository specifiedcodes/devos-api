import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditService,
  AuditAction,
  AuditLogFilters,
  BYOK_AUDIT_ACTIONS,
} from './audit.service';
import { AuditLog } from '../../database/entities/audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  let repository: Repository<AuditLog>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    repository = module.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should create and save audit log', async () => {
      const mockLog = {
        id: '1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: AuditAction.PROJECT_CREATED,
        resourceType: 'project',
        resourceId: 'proj-1',
        metadata: { name: 'Test Project' },
      };

      mockRepository.create.mockReturnValue(mockLog);
      mockRepository.save.mockResolvedValue(mockLog);

      await service.log(
        'ws-1',
        'user-1',
        AuditAction.PROJECT_CREATED,
        'project',
        'proj-1',
        { name: 'Test Project' },
      );

      expect(mockRepository.create).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: AuditAction.PROJECT_CREATED,
        resourceType: 'project',
        resourceId: 'proj-1',
        metadata: { name: 'Test Project' },
        ipAddress: undefined,
        userAgent: undefined,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockLog);
    });

    it('should not fail main operation if audit logging fails', async () => {
      mockRepository.create.mockReturnValue({});
      mockRepository.save.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(
        service.log(
          'ws-1',
          'user-1',
          AuditAction.PROJECT_CREATED,
          'project',
          'proj-1',
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('getWorkspaceLogsWithFilters', () => {
    it('should query logs with filters', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const filters: AuditLogFilters = {
        userId: 'user-1',
        actions: [AuditAction.PROJECT_CREATED],
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      };

      await service.getWorkspaceLogsWithFilters('ws-1', filters, 50, 0);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'audit.workspaceId = :workspaceId',
        { workspaceId: 'ws-1' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.userId = :userId',
        { userId: 'user-1' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.action IN (:...actions)',
        { actions: [AuditAction.PROJECT_CREATED] },
      );
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(50);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
    });
  });

  describe('exportAuditLogsToCSV', () => {
    it('should export logs to CSV format', async () => {
      const mockLogs = [
        {
          id: '1',
          createdAt: new Date('2024-01-01T10:00:00Z'),
          userId: 'user-1',
          action: 'project_created',
          resourceType: 'project',
          resourceId: 'proj-1',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: { name: 'Test' },
        },
      ];

      jest.spyOn(service, 'getWorkspaceLogsWithFilters').mockResolvedValue({
        logs: mockLogs as any,
        total: 1,
      });

      const csv = await service.exportAuditLogsToCSV('ws-1', {});

      expect(csv).toContain('Timestamp,User ID,Action');
      expect(csv).toContain('2024-01-01T10:00:00.000Z');
      expect(csv).toContain('user-1');
      expect(csv).toContain('project_created');
    });

    it('should escape CSV injection attempts', async () => {
      const mockLogs = [
        {
          id: '1',
          createdAt: new Date('2024-01-01T10:00:00Z'),
          userId: 'user-1',
          action: '=MALICIOUS',
          resourceType: '+FORMULA',
          resourceId: '@EXPLOIT',
          ipAddress: '-ATTACK',
          userAgent: 'Normal',
          metadata: {},
        },
      ];

      jest.spyOn(service, 'getWorkspaceLogsWithFilters').mockResolvedValue({
        logs: mockLogs as any,
        total: 1,
      });

      const csv = await service.exportAuditLogsToCSV('ws-1', {});

      // Formula injection attempts should be escaped
      expect(csv).toContain("'=MALICIOUS");
      expect(csv).toContain("'+FORMULA");
      expect(csv).toContain("'@EXPLOIT");
      expect(csv).toContain("'-ATTACK");
    });
  });

  describe('BYOK audit action types', () => {
    it('should have BYOK_KEY_USED enum value', () => {
      expect(AuditAction.BYOK_KEY_USED).toBe('byok_key_used');
    });

    it('should have BYOK_KEY_VALIDATION_FAILED enum value', () => {
      expect(AuditAction.BYOK_KEY_VALIDATION_FAILED).toBe(
        'byok_key_validation_failed',
      );
    });

    it('should have BYOK_AUDIT_ACTIONS constant with all 6 BYOK actions', () => {
      expect(BYOK_AUDIT_ACTIONS).toHaveLength(6);
      expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_CREATED);
      expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_DELETED);
      expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_ACCESSED);
      expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_UPDATED);
      expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_USED);
      expect(BYOK_AUDIT_ACTIONS).toContain(
        AuditAction.BYOK_KEY_VALIDATION_FAILED,
      );
    });
  });

  describe('getByokAuditSummary', () => {
    it('should return correct BYOK audit summary', async () => {
      const mockActionCounts = [
        { action: 'byok_key_created', count: '5' },
        { action: 'byok_key_accessed', count: '10' },
        { action: 'byok_key_used', count: '100' },
        { action: 'byok_key_validation_failed', count: '2' },
      ];

      const mockUniqueUsers = { count: '3' };
      const mockCost = { totalCost: '47.32' };

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockActionCounts),
        getRawOne: jest.fn(),
      };

      // First call returns action counts, second call returns unique users, third returns cost
      let callCount = 0;
      mockRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            ...mockQueryBuilder,
            getRawMany: jest.fn().mockResolvedValue(mockActionCounts),
          };
        } else if (callCount === 2) {
          return {
            ...mockQueryBuilder,
            getRawOne: jest.fn().mockResolvedValue(mockUniqueUsers),
          };
        } else {
          return {
            ...mockQueryBuilder,
            getRawOne: jest.fn().mockResolvedValue(mockCost),
          };
        }
      });

      const result = await service.getByokAuditSummary('ws-1', 30);

      expect(result.totalKeyAccessEvents).toBe(15); // 5 created + 10 accessed
      expect(result.totalApiCallsViaByok).toBe(100);
      expect(result.totalCostViaByok).toBe(47.32);
      expect(result.uniqueUsersAccessingKeys).toBe(3);
      expect(result.failedValidationAttempts).toBe(2);
      expect(result.period.start).toBeDefined();
      expect(result.period.end).toBeDefined();
    });

    it('should return zeros when no BYOK audit events exist', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ count: '0', totalCost: null }),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getByokAuditSummary('ws-1', 30);

      expect(result.totalKeyAccessEvents).toBe(0);
      expect(result.totalApiCallsViaByok).toBe(0);
      expect(result.totalCostViaByok).toBe(0);
      expect(result.uniqueUsersAccessingKeys).toBe(0);
      expect(result.failedValidationAttempts).toBe(0);
    });
  });

  describe('log with IP and user agent', () => {
    it('should extract ipAddress and userAgent from metadata', async () => {
      const mockLog = {
        id: '1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: AuditAction.BYOK_KEY_CREATED,
        resourceType: 'byok_key',
        resourceId: 'key-1',
        metadata: {
          keyName: 'Test Key',
          provider: 'anthropic',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      };

      mockRepository.create.mockReturnValue(mockLog);
      mockRepository.save.mockResolvedValue(mockLog);

      await service.log(
        'ws-1',
        'user-1',
        AuditAction.BYOK_KEY_CREATED,
        'byok_key',
        'key-1',
        {
          keyName: 'Test Key',
          provider: 'anthropic',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      );

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: expect.objectContaining({
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          }),
        }),
      );
    });
  });

  describe('cleanupOldLogs', () => {
    it('should delete logs older than retention period', async () => {
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 50 }),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const deletedCount = await service.cleanupOldLogs(90);

      expect(deletedCount).toBe(50);
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'createdAt < :cutoffDate',
        expect.objectContaining({ cutoffDate: expect.any(Date) }),
      );
    });

    it('should use default retention of 90 days', async () => {
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.cleanupOldLogs();

      expect(mockQueryBuilder.where).toHaveBeenCalled();
    });
  });
});
