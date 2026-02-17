import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SsoAuditExportService } from './sso-audit-export.service';
import { SsoAuditEvent, SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../redis/redis.service';
import { SSO_AUDIT_CONSTANTS } from '../constants/audit.constants';

describe('SsoAuditExportService', () => {
  let service: SsoAuditExportService;

  let mockQueryBuilder: any;

  let mockRepository: any;

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  // Track raw query calls for cleanup tests
  let mockQueryFn: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };

    mockQueryFn = jest.fn();

    mockRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      query: mockQueryFn,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoAuditExportService,
        { provide: getRepositoryToken(SsoAuditEvent), useValue: mockRepository },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<SsoAuditExportService>(SsoAuditExportService);
  });

  describe('exportEvents', () => {
    const mockEvents = [
      {
        id: 'event-1',
        eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS,
        workspaceId: 'ws-1',
        actorId: 'user-1',
        targetUserId: null,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        details: { provider: 'Okta' },
        createdAt: new Date('2026-01-15T10:00:00Z'),
      },
    ];

    it('should generate CSV with correct headers and rows', async () => {
      mockQueryBuilder.getMany.mockResolvedValue(mockEvents);
      const result = await service.exportEvents({ workspaceId: 'ws-1' }, 'csv');
      expect(result.format).toBe('csv');
      expect(result.data).toContain('id,eventType,actorId,targetUserId,ipAddress,userAgent,details,createdAt');
      expect(result.data).toContain('"event-1"');
      expect(result.rowCount).toBe(1);
      expect(result.filename).toContain('sso-audit-ws-1-');
      expect(result.filename).toContain('.csv');
    });

    it('should escape CSV fields with commas and quotes', async () => {
      const eventsWithSpecialChars = [{
        ...mockEvents[0],
        userAgent: 'Mozilla "5.0", (Windows)',
      }];
      mockQueryBuilder.getMany.mockResolvedValue(eventsWithSpecialChars);
      const result = await service.exportEvents({ workspaceId: 'ws-1' }, 'csv');
      // Internal quotes are doubled for CSV injection protection
      expect(result.data).toContain('""5.0""');
    });

    it('should generate valid JSON array', async () => {
      mockQueryBuilder.getMany.mockResolvedValue(mockEvents);
      const result = await service.exportEvents({ workspaceId: 'ws-1' }, 'json');
      expect(result.format).toBe('json');
      const parsed = JSON.parse(result.data);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].id).toBe('event-1');
      expect(result.filename).toContain('.json');
    });

    it('should apply date filters correctly', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      const dateFrom = new Date('2026-01-01');
      const dateTo = new Date('2026-02-01');
      await service.exportEvents({ workspaceId: 'ws-1', dateFrom, dateTo }, 'csv');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'event.createdAt >= :dateFrom', { dateFrom },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'event.createdAt <= :dateTo', { dateTo },
      );
    });

    it('should apply eventType filter correctly', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      await service.exportEvents({ workspaceId: 'ws-1', eventType: 'saml_login_success' }, 'csv');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'event.eventType = :eventType', { eventType: 'saml_login_success' },
      );
    });

    it('should enforce MAX_EXPORT_ROWS limit', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);
      await service.exportEvents({ workspaceId: 'ws-1' }, 'csv');
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(SSO_AUDIT_CONSTANTS.MAX_EXPORT_ROWS);
    });
  });

  describe('generateComplianceReport', () => {
    const dateFrom = new Date('2026-01-01');
    const dateTo = new Date('2026-02-01');

    it('should return correct summary totals', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockQueryBuilder.getMany.mockResolvedValue([
        { eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS, actorId: 'u1', createdAt: new Date() },
        { eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS, actorId: 'u2', createdAt: new Date() },
        { eventType: SsoAuditEventType.SAML_LOGIN_FAILURE, actorId: 'u1', createdAt: new Date() },
        { eventType: SsoAuditEventType.SAML_CONFIG_CREATED, actorId: 'u1', createdAt: new Date() },
      ]);

      const report = await service.generateComplianceReport('ws-1', dateFrom, dateTo);
      expect(report.summary.totalEvents).toBe(4);
      expect(report.summary.totalLogins).toBe(3);
      expect(report.summary.successfulLogins).toBe(2);
      expect(report.summary.failedLogins).toBe(1);
      expect(report.summary.uniqueUsers).toBe(2);
    });

    it('should compute login success rate correctly', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockQueryBuilder.getMany.mockResolvedValue([
        { eventType: SsoAuditEventType.OIDC_LOGIN_SUCCESS, actorId: 'u1', createdAt: new Date() },
        { eventType: SsoAuditEventType.OIDC_LOGIN_FAILURE, actorId: 'u2', createdAt: new Date() },
      ]);

      const report = await service.generateComplianceReport('ws-1', dateFrom, dateTo);
      expect(report.summary.loginSuccessRate).toBe(50);
    });

    it('should compute provisioning report (JIT + SCIM counts)', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockQueryBuilder.getMany.mockResolvedValue([
        { eventType: SsoAuditEventType.JIT_USER_PROVISIONED, actorId: 'u1', createdAt: new Date() },
        { eventType: SsoAuditEventType.JIT_USER_PROVISIONED, actorId: 'u2', createdAt: new Date() },
        { eventType: SsoAuditEventType.SCIM_USER_CREATED, actorId: 'u3', createdAt: new Date() },
        { eventType: SsoAuditEventType.SCIM_USER_DEACTIVATED, actorId: 'u1', createdAt: new Date() },
        { eventType: SsoAuditEventType.JIT_USER_PROFILE_UPDATED, actorId: 'u1', createdAt: new Date() },
      ]);

      const report = await service.generateComplianceReport('ws-1', dateFrom, dateTo);
      expect(report.provisioningReport.jitProvisioned).toBe(2);
      expect(report.provisioningReport.scimProvisioned).toBe(1);
      expect(report.provisioningReport.totalProvisioned).toBe(3);
      expect(report.provisioningReport.deactivated).toBe(1);
      expect(report.provisioningReport.updated).toBe(1);
    });

    it('should compute enforcement report', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockQueryBuilder.getMany.mockResolvedValue([
        { eventType: SsoAuditEventType.ENFORCEMENT_ENABLED, actorId: 'u1', createdAt: new Date() },
        { eventType: SsoAuditEventType.ENFORCEMENT_LOGIN_BLOCKED, actorId: 'u2', createdAt: new Date() },
        { eventType: SsoAuditEventType.ENFORCEMENT_LOGIN_BYPASSED, actorId: 'u3', createdAt: new Date() },
      ]);

      const report = await service.generateComplianceReport('ws-1', dateFrom, dateTo);
      expect(report.enforcementReport.enforcementEnabled).toBe(true);
      expect(report.enforcementReport.enforcementChanges).toBe(1);
      expect(report.enforcementReport.blockedLogins).toBe(1);
      expect(report.enforcementReport.bypassedLogins).toBe(1);
    });

    it('should use Redis cache on cache hit', async () => {
      const cachedReport = { workspaceId: 'ws-1', summary: { totalEvents: 10 } };
      mockRedisService.get.mockResolvedValue(JSON.stringify(cachedReport));

      const report = await service.generateComplianceReport('ws-1', dateFrom, dateTo);
      expect(report.workspaceId).toBe('ws-1');
      expect(mockRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should fall back to database on cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const report = await service.generateComplianceReport('ws-1', dateFrom, dateTo);
      expect(report.workspaceId).toBe('ws-1');
      expect(mockRedisService.set).toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredEvents', () => {
    it('should delete events older than retention period', async () => {
      // First batch returns 500 rows, second batch returns 0 (done)
      mockQueryFn
        .mockResolvedValueOnce({ rowCount: 500 })
        .mockResolvedValueOnce({ rowCount: 0 });

      const count = await service.cleanupExpiredEvents(730);
      expect(count).toBe(500);
      expect(mockQueryFn).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM sso_audit_events'),
        expect.arrayContaining([expect.any(Date), 1000]),
      );
    });

    it('should batch deletes for large datasets', async () => {
      mockQueryFn
        .mockResolvedValueOnce({ rowCount: 1000 })
        .mockResolvedValueOnce({ rowCount: 1000 })
        .mockResolvedValueOnce({ rowCount: 500 });

      const count = await service.cleanupExpiredEvents(730);
      expect(count).toBe(2500);
      expect(mockQueryFn).toHaveBeenCalledTimes(3);
    });

    it('should return correct deleted count when no events to delete', async () => {
      mockQueryFn.mockResolvedValueOnce({ rowCount: 0 });
      const count = await service.cleanupExpiredEvents(730);
      expect(count).toBe(0);
    });
  });
});
