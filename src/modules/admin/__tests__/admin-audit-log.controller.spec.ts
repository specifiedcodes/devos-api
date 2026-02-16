import { AdminAuditLogController } from '../controllers/admin-audit-log.controller';

describe('AdminAuditLogController', () => {
  let controller: AdminAuditLogController;
  let mockAdminAuditLogService: any;
  let mockAuditService: any;

  const mockReq = {
    user: { userId: 'admin-1' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
  };

  const mockLogEntry = {
    id: 'log-1',
    timestamp: '2026-02-15T10:00:00Z',
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

  beforeEach(() => {
    mockAdminAuditLogService = {
      queryLogs: jest.fn().mockResolvedValue({
        items: [mockLogEntry],
        total: 1,
      }),
      getLogDetail: jest.fn().mockResolvedValue(mockLogEntry),
      getActionTypes: jest.fn().mockResolvedValue(['create', 'delete']),
      getResourceTypes: jest.fn().mockResolvedValue(['project', 'user']),
      getAuditStats: jest.fn().mockResolvedValue({
        totalEvents: 100,
        eventsByAction: [],
        eventsByResourceType: [],
        eventsByUser: [],
        securityEvents: 5,
        adminEvents: 10,
      }),
      exportLogs: jest.fn().mockResolvedValue('csv-data'),
      getSavedSearches: jest.fn().mockResolvedValue([mockSavedSearch]),
      createSavedSearch: jest.fn().mockResolvedValue(mockSavedSearch),
      deleteSavedSearch: jest.fn().mockResolvedValue(undefined),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    controller = new AdminAuditLogController(
      mockAdminAuditLogService,
      mockAuditService,
    );
  });

  describe('GET /api/admin/audit-logs', () => {
    it('should return paginated log entries', async () => {
      const result = await controller.queryLogs({});
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 50);
      expect(result).toHaveProperty('totalPages', 1);
    });

    it('should accept all query filter params', async () => {
      const query = {
        userId: 'user-1',
        userEmail: 'test@example.com',
        workspaceId: 'ws-1',
        action: 'create',
        actionPrefix: 'admin.',
        resourceType: 'project',
        resourceId: 'proj-1',
        ipAddress: '127.0.0.1',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T23:59:59Z',
        search: 'test',
      };
      await controller.queryLogs(query);
      expect(mockAdminAuditLogService.queryLogs).toHaveBeenCalledWith(query);
    });

    it('should default page=1, limit=50', async () => {
      const result = await controller.queryLogs({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });
  });

  describe('GET /api/admin/audit-logs/:id', () => {
    it('should return log detail', async () => {
      const result = await controller.getLogDetail('log-1');
      expect(result).toEqual(mockLogEntry);
      expect(mockAdminAuditLogService.getLogDetail).toHaveBeenCalledWith('log-1');
    });
  });

  describe('GET /api/admin/audit-logs/meta/actions', () => {
    it('should return action types list', async () => {
      const result = await controller.getActionTypes();
      expect(result).toEqual(['create', 'delete']);
    });
  });

  describe('GET /api/admin/audit-logs/meta/resource-types', () => {
    it('should return resource types list', async () => {
      const result = await controller.getResourceTypes();
      expect(result).toEqual(['project', 'user']);
    });
  });

  describe('GET /api/admin/audit-logs/stats', () => {
    it('should return stats with required date params', async () => {
      const result = await controller.getStats({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T23:59:59Z',
      });
      expect(result).toHaveProperty('totalEvents', 100);
      expect(result).toHaveProperty('securityEvents', 5);
      expect(result).toHaveProperty('adminEvents', 10);
    });
  });

  describe('GET /api/admin/audit-logs/export', () => {
    it('should return CSV download', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.exportLogs({}, 'csv', mockReq, mockRes as any);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename='),
      );
      expect(mockRes.send).toHaveBeenCalledWith('csv-data');
    });

    it('should return JSON download when format=json', async () => {
      mockAdminAuditLogService.exportLogs.mockResolvedValue('[]');
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.exportLogs({}, 'json', mockReq, mockRes as any);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockAdminAuditLogService.exportLogs).toHaveBeenCalledWith(
        expect.any(Object),
        'json',
      );
    });

    it('should set Content-Disposition header', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.exportLogs({}, 'csv', mockReq, mockRes as any);
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(/attachment; filename="audit-logs-.*\.csv"/),
      );
    });

    it('should log ADMIN_AUDIT_LOG_EXPORTED audit action', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.exportLogs({}, 'csv', mockReq, mockRes as any);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.audit_log_exported',
        'audit_log',
        'export',
        expect.any(Object),
      );
    });
  });

  describe('GET /api/admin/audit-logs/saved-searches', () => {
    it('should return saved searches', async () => {
      const result = await controller.getSavedSearches(mockReq);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('My Search');
    });
  });

  describe('POST /api/admin/audit-logs/saved-searches', () => {
    it('should create saved search', async () => {
      const dto = { name: 'New Search', filters: { action: 'delete' } };
      const result = await controller.createSavedSearch(dto as any, mockReq);
      expect(result.name).toBe('My Search');
      expect(mockAdminAuditLogService.createSavedSearch).toHaveBeenCalledWith(
        'admin-1',
        dto,
      );
    });

    it('should log audit action on creation', async () => {
      const dto = { name: 'New Search', filters: {} };
      await controller.createSavedSearch(dto as any, mockReq);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.audit_log_search_saved',
        'audit_saved_search',
        expect.any(String),
        expect.any(Object),
      );
    });
  });

  describe('DELETE /api/admin/audit-logs/saved-searches/:id', () => {
    it('should delete search', async () => {
      await controller.deleteSavedSearch('search-1', mockReq);
      expect(mockAdminAuditLogService.deleteSavedSearch).toHaveBeenCalledWith(
        'admin-1',
        'search-1',
      );
    });

    it('should log audit action on deletion', async () => {
      await controller.deleteSavedSearch('search-1', mockReq);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.audit_log_search_deleted',
        'audit_saved_search',
        'search-1',
        expect.any(Object),
      );
    });
  });

  describe('All endpoints audit logging', () => {
    it('should log appropriate audit actions on mutating endpoints', async () => {
      // Create saved search
      const dto = { name: 'Test', filters: {} };
      await controller.createSavedSearch(dto as any, mockReq);
      expect(mockAuditService.log).toHaveBeenCalled();

      jest.clearAllMocks();

      // Delete saved search
      await controller.deleteSavedSearch('search-1', mockReq);
      expect(mockAuditService.log).toHaveBeenCalled();
    });
  });
});
