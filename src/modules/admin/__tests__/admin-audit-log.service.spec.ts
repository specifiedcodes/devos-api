import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { AdminAuditLogService } from '../services/admin-audit-log.service';

describe('AdminAuditLogService', () => {
  let service: AdminAuditLogService;
  let mockAuditLogRepository: any;
  let mockUserRepository: any;
  let mockSavedSearchRepository: any;

  const mockLogEntry = {
    id: 'log-1',
    timestamp: new Date('2026-02-15T10:00:00Z'),
    userId: 'user-1',
    userEmail: 'user@example.com',
    workspaceId: 'ws-1',
    action: 'create',
    resourceType: 'project',
    resourceId: 'proj-1',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    metadata: { key: 'value' },
  };

  const mockSavedSearch = {
    id: 'search-1',
    name: 'My Search',
    createdBy: 'admin-1',
    filters: { action: 'create' },
    isShared: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockQb: any;

  beforeEach(() => {
    mockQb = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      clone: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue([mockLogEntry]),
      getRawOne: jest.fn().mockResolvedValue({ count: '1' }),
    };
    // clone returns a new query builder that also has getRawOne
    mockQb.clone.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: '1' }),
    });

    mockAuditLogRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };

    mockUserRepository = {};

    mockSavedSearchRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([mockSavedSearch]),
      create: jest.fn((data: any) => ({ ...data, id: 'new-search-1' })),
      save: jest.fn((data: any) => Promise.resolve({ ...data })),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockSavedSearch]),
      }),
    };

    service = new AdminAuditLogService(
      mockAuditLogRepository,
      mockUserRepository,
      mockSavedSearchRepository,
    );
  });

  describe('queryLogs', () => {
    it('should return paginated results with default page=1, limit=50', async () => {
      const result = await service.queryLogs({});
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(mockQb.limit).toHaveBeenCalledWith(50);
      expect(mockQb.offset).toHaveBeenCalledWith(0);
    });

    it('should filter by userId exact match', async () => {
      await service.queryLogs({ userId: 'user-1' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'audit.user_id = :userId',
        { userId: 'user-1' },
      );
    });

    it('should filter by userEmail with ILIKE (parameterized)', async () => {
      await service.queryLogs({ userEmail: 'test@example.com' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'u.email ILIKE :userEmail',
        { userEmail: '%test@example.com%' },
      );
    });

    it('should filter by workspaceId exact match', async () => {
      await service.queryLogs({ workspaceId: 'ws-1' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'audit.workspace_id = :workspaceId',
        { workspaceId: 'ws-1' },
      );
    });

    it('should filter by action exact match', async () => {
      await service.queryLogs({ action: 'create' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'audit.action = :action',
        { action: 'create' },
      );
    });

    it('should filter by actionPrefix with LIKE', async () => {
      await service.queryLogs({ actionPrefix: 'admin.' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'audit.action LIKE :actionPrefix',
        { actionPrefix: 'admin.%' },
      );
    });

    it('should filter by resourceType exact match', async () => {
      await service.queryLogs({ resourceType: 'project' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'audit.resource_type = :resourceType',
        { resourceType: 'project' },
      );
    });

    it('should filter by resourceId exact match', async () => {
      await service.queryLogs({ resourceId: 'proj-1' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'audit.resource_id = :resourceId',
        { resourceId: 'proj-1' },
      );
    });

    it('should filter by ipAddress exact match', async () => {
      await service.queryLogs({ ipAddress: '192.168.1.1' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'audit.ip_address = :ipAddress',
        { ipAddress: '192.168.1.1' },
      );
    });

    it('should filter by date range (startDate, endDate)', async () => {
      await service.queryLogs({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T23:59:59Z',
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'audit.created_at >= :startDate',
        { startDate: '2026-01-01T00:00:00Z' },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'audit.created_at <= :endDate',
        { endDate: '2026-12-31T23:59:59Z' },
      );
    });

    it('should apply full-text search across action, resourceType, resourceId, metadata', async () => {
      await service.queryLogs({ search: 'test' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('audit.action ILIKE :search'),
        { search: '%test%' },
      );
    });

    it('should combine multiple filters with AND logic', async () => {
      await service.queryLogs({
        userId: 'user-1',
        action: 'create',
        resourceType: 'project',
      });
      expect(mockQb.andWhere).toHaveBeenCalledTimes(3);
    });

    it('should return items ordered by createdAt DESC', async () => {
      await service.queryLogs({});
      expect(mockQb.orderBy).toHaveBeenCalledWith('audit.created_at', 'DESC');
    });

    it('should resolve userEmail from User entity join', async () => {
      const result = await service.queryLogs({});
      expect(mockQb.leftJoin).toHaveBeenCalledWith(
        'users',
        'u',
        expect.stringContaining('u.id'),
      );
      expect(result.items[0].userEmail).toBe('user@example.com');
    });

    it('should return null userEmail for deleted/unknown users', async () => {
      mockQb.getRawMany.mockResolvedValue([{ ...mockLogEntry, userEmail: null }]);
      const result = await service.queryLogs({});
      expect(result.items[0].userEmail).toBeNull();
    });

    it('should respect max limit of 100', async () => {
      await service.queryLogs({ limit: 200 });
      expect(mockQb.limit).toHaveBeenCalledWith(100);
    });
  });

  describe('getLogDetail', () => {
    it('should return full log detail with metadata', async () => {
      mockQb.getRawOne.mockResolvedValue(mockLogEntry);
      const result = await service.getLogDetail('log-1');
      expect(result).toHaveProperty('id', 'log-1');
      expect(result).toHaveProperty('metadata');
    });

    it('should throw NotFoundException for unknown id', async () => {
      mockQb.getRawOne.mockResolvedValue(null);
      await expect(service.getLogDetail('unknown')).rejects.toThrow(NotFoundException);
    });

    it('should resolve userEmail from User entity', async () => {
      mockQb.getRawOne.mockResolvedValue(mockLogEntry);
      const result = await service.getLogDetail('log-1');
      expect(result.userEmail).toBe('user@example.com');
    });
  });

  describe('getActionTypes', () => {
    it('should return distinct action values', async () => {
      mockQb.getRawMany.mockResolvedValue([{ action: 'create' }, { action: 'delete' }]);
      const result = await service.getActionTypes();
      expect(result).toEqual(['create', 'delete']);
    });

    it('should order alphabetically', async () => {
      mockQb.getRawMany.mockResolvedValue([{ action: 'create' }, { action: 'delete' }]);
      await service.getActionTypes();
      expect(mockQb.orderBy).toHaveBeenCalledWith('audit.action', 'ASC');
    });
  });

  describe('getResourceTypes', () => {
    it('should return distinct resourceType values', async () => {
      mockQb.getRawMany.mockResolvedValue([
        { resourceType: 'project' },
        { resourceType: 'user' },
      ]);
      const result = await service.getResourceTypes();
      expect(result).toEqual(['project', 'user']);
    });

    it('should order alphabetically', async () => {
      mockQb.getRawMany.mockResolvedValue([{ resourceType: 'project' }]);
      await service.getResourceTypes();
      expect(mockQb.orderBy).toHaveBeenCalledWith('audit.resource_type', 'ASC');
    });
  });

  describe('exportLogs', () => {
    it('should generate CSV with correct headers and data', async () => {
      const result = await service.exportLogs({}, 'csv');
      expect(result).toContain('Timestamp');
      expect(result).toContain('User ID');
      expect(result).toContain('User Email');
      expect(result).toContain('Action');
    });

    it('should escape formula characters for CSV injection protection', async () => {
      mockQb.getRawMany.mockResolvedValue([
        {
          ...mockLogEntry,
          userId: '=cmd',
          userEmail: '+danger',
        },
      ]);
      const result = await service.exportLogs({}, 'csv');
      expect(result).toContain("'=cmd");
      expect(result).toContain("'+danger");
    });

    it('should generate JSON array of log entries', async () => {
      const result = await service.exportLogs({}, 'json');
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should apply same filters as queryLogs', async () => {
      await service.exportLogs({ action: 'create' }, 'csv');
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'audit.action = :action',
        { action: 'create' },
      );
    });
  });

  describe('getAuditStats', () => {
    it('should return totalEvents count', async () => {
      const result = await service.getAuditStats({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T23:59:59Z',
      });
      expect(result).toHaveProperty('totalEvents');
      expect(typeof result.totalEvents).toBe('number');
    });

    it('should return eventsByAction (top 10)', async () => {
      mockQb.getRawMany
        .mockResolvedValueOnce([{ action: 'create', count: '5' }]) // actionResults
        .mockResolvedValueOnce([{ resourceType: 'project', count: '3' }]) // resourceResults
        .mockResolvedValueOnce([{ userId: 'u1', userEmail: 'a@b.com', count: '2' }]); // userResults
      mockQb.getRawOne
        .mockResolvedValueOnce({ count: '10' })  // totalEvents
        .mockResolvedValueOnce({ count: '2' })  // securityEvents
        .mockResolvedValueOnce({ count: '3' }); // adminEvents

      const result = await service.getAuditStats({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T23:59:59Z',
      });
      expect(result.eventsByAction).toBeDefined();
      expect(Array.isArray(result.eventsByAction)).toBe(true);
    });

    it('should return eventsByResourceType', async () => {
      mockQb.getRawMany.mockResolvedValue([]);
      mockQb.getRawOne.mockResolvedValue({ count: '0' });
      const result = await service.getAuditStats({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T23:59:59Z',
      });
      expect(result).toHaveProperty('eventsByResourceType');
    });

    it('should return eventsByUser (top 10 with email)', async () => {
      mockQb.getRawMany.mockResolvedValue([]);
      mockQb.getRawOne.mockResolvedValue({ count: '0' });
      const result = await service.getAuditStats({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T23:59:59Z',
      });
      expect(result).toHaveProperty('eventsByUser');
    });

    it('should return securityEvents count', async () => {
      mockQb.getRawMany.mockResolvedValue([]);
      mockQb.getRawOne.mockResolvedValue({ count: '5' });
      const result = await service.getAuditStats({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T23:59:59Z',
      });
      expect(result).toHaveProperty('securityEvents');
    });

    it('should return adminEvents count', async () => {
      mockQb.getRawMany.mockResolvedValue([]);
      mockQb.getRawOne.mockResolvedValue({ count: '3' });
      const result = await service.getAuditStats({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T23:59:59Z',
      });
      expect(result).toHaveProperty('adminEvents');
    });
  });

  describe('getSavedSearches', () => {
    it('should return own and shared searches', async () => {
      const result = await service.getSavedSearches('admin-1');
      expect(result).toHaveLength(1);
    });

    it('should order by updatedAt DESC', async () => {
      const qb = mockSavedSearchRepository.createQueryBuilder();
      await service.getSavedSearches('admin-1');
      expect(qb.orderBy).toHaveBeenCalledWith('search.updated_at', 'DESC');
    });
  });

  describe('createSavedSearch', () => {
    it('should create search with correct createdBy', async () => {
      mockSavedSearchRepository.findOne.mockResolvedValue(null);
      await service.createSavedSearch('admin-1', {
        name: 'Test Search',
        filters: { action: 'create' },
      });
      expect(mockSavedSearchRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: 'admin-1',
          name: 'Test Search',
        }),
      );
    });

    it('should validate name uniqueness per admin', async () => {
      mockSavedSearchRepository.findOne.mockResolvedValue(mockSavedSearch);
      await expect(
        service.createSavedSearch('admin-1', {
          name: 'My Search',
          filters: {},
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteSavedSearch', () => {
    it('should delete own search', async () => {
      mockSavedSearchRepository.findOne.mockResolvedValue(mockSavedSearch);
      await service.deleteSavedSearch('admin-1', 'search-1');
      expect(mockSavedSearchRepository.remove).toHaveBeenCalledWith(mockSavedSearch);
    });

    it('should throw ForbiddenException for other admin search', async () => {
      mockSavedSearchRepository.findOne.mockResolvedValue(mockSavedSearch);
      await expect(
        service.deleteSavedSearch('admin-2', 'search-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for unknown id', async () => {
      mockSavedSearchRepository.findOne.mockResolvedValue(null);
      await expect(
        service.deleteSavedSearch('admin-1', 'unknown'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
