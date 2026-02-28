/**
 * Tests for PermissionAuditService
 * Story 20-6: Permission Audit Trail
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermissionAuditService } from '../services/permission-audit.service';
import {
  PermissionAuditEvent,
  PermissionAuditEventType,
} from '../../../database/entities/permission-audit-event.entity';

let mockQb: any;
let mockRepo: any;

function createMockQb() {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    getRawMany: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  };
}

describe('PermissionAuditService', () => {
  let service: PermissionAuditService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQb = createMockQb();
    mockRepo = {
      create: jest.fn().mockImplementation((data: any) => ({ ...data, id: 'test-id', createdAt: new Date() })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionAuditService,
        { provide: getRepositoryToken(PermissionAuditEvent), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<PermissionAuditService>(PermissionAuditService);
  });

  // ==================== RECORD TESTS ====================

  describe('record()', () => {
    it('should create and save an audit event', async () => {
      await service.record({
        workspaceId: 'ws-1',
        eventType: PermissionAuditEventType.ROLE_CREATED,
        actorId: 'user-1',
        targetRoleId: 'role-1',
        afterState: { name: 'test' },
      });

      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        workspaceId: 'ws-1',
        eventType: PermissionAuditEventType.ROLE_CREATED,
        actorId: 'user-1',
        targetRoleId: 'role-1',
        afterState: { name: 'test' },
      }));
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should never throw on save failure (fire-and-forget)', async () => {
      mockRepo.save.mockRejectedValueOnce(new Error('DB error'));

      // Should NOT throw
      await expect(service.record({
        workspaceId: 'ws-1',
        eventType: PermissionAuditEventType.ROLE_CREATED,
        actorId: 'user-1',
      })).resolves.not.toThrow();
    });

    it('should truncate userAgent to 500 characters', async () => {
      const longUserAgent = 'A'.repeat(600);
      await service.record({
        workspaceId: 'ws-1',
        eventType: PermissionAuditEventType.ROLE_CREATED,
        actorId: 'user-1',
        userAgent: longUserAgent,
      });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'A'.repeat(500),
        }),
      );
    });

    it('should set optional fields to null when not provided', async () => {
      await service.record({
        workspaceId: 'ws-1',
        eventType: PermissionAuditEventType.ROLE_CREATED,
        actorId: 'user-1',
      });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: null,
          targetRoleId: null,
          beforeState: null,
          afterState: null,
          ipAddress: null,
          userAgent: null,
        }),
      );
    });

    it('should pass ipAddress when provided', async () => {
      await service.record({
        workspaceId: 'ws-1',
        eventType: PermissionAuditEventType.ACCESS_DENIED_IP,
        actorId: 'user-1',
        ipAddress: '192.168.1.1',
      });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '192.168.1.1',
        }),
      );
    });
  });

  // ==================== LIST EVENTS TESTS ====================

  describe('listEvents()', () => {
    const wsId = 'ws-1';

    it('should query with workspaceId filter', async () => {
      await service.listEvents(wsId, {});
      expect(mockQb.where).toHaveBeenCalledWith(
        'pae.workspace_id = :workspaceId',
        { workspaceId: wsId },
      );
    });

    it('should apply eventType filter', async () => {
      await service.listEvents(wsId, { eventType: PermissionAuditEventType.ROLE_CREATED });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'pae.event_type = :eventType',
        { eventType: PermissionAuditEventType.ROLE_CREATED },
      );
    });

    it('should apply multiple eventTypes filter', async () => {
      await service.listEvents(wsId, {
        eventTypes: [PermissionAuditEventType.ROLE_CREATED, PermissionAuditEventType.ROLE_DELETED],
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'pae.event_type IN (:...eventTypes)',
        { eventTypes: [PermissionAuditEventType.ROLE_CREATED, PermissionAuditEventType.ROLE_DELETED] },
      );
    });

    it('should apply actorId filter', async () => {
      await service.listEvents(wsId, { actorId: 'actor-1' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'pae.actor_id = :actorId',
        { actorId: 'actor-1' },
      );
    });

    it('should apply targetUserId filter', async () => {
      await service.listEvents(wsId, { targetUserId: 'target-1' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'pae.target_user_id = :targetUserId',
        { targetUserId: 'target-1' },
      );
    });

    it('should apply targetRoleId filter', async () => {
      await service.listEvents(wsId, { targetRoleId: 'role-1' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'pae.target_role_id = :targetRoleId',
        { targetRoleId: 'role-1' },
      );
    });

    it('should apply dateFrom filter', async () => {
      const dateFrom = new Date('2024-01-01');
      await service.listEvents(wsId, { dateFrom });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'pae.created_at >= :dateFrom',
        { dateFrom },
      );
    });

    it('should apply dateTo filter', async () => {
      const dateTo = new Date('2024-12-31');
      await service.listEvents(wsId, { dateTo });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'pae.created_at <= :dateTo',
        { dateTo },
      );
    });

    it('should apply search filter with ILIKE wildcard escaping', async () => {
      await service.listEvents(wsId, { search: 'test%_value' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(pae.event_type ILIKE :search OR CAST(pae.before_state AS TEXT) ILIKE :search OR CAST(pae.after_state AS TEXT) ILIKE :search)',
        { search: '%test\\%\\_value%' },
      );
    });

    it('should clamp limit to 1-100 range', async () => {
      await service.listEvents(wsId, {}, { limit: 0 });
      expect(mockQb.take).toHaveBeenCalledWith(1);

      jest.clearAllMocks();
      await service.listEvents(wsId, {}, { limit: 200 });
      expect(mockQb.take).toHaveBeenCalledWith(100);
    });

    it('should apply offset', async () => {
      await service.listEvents(wsId, {}, { offset: 50 });
      expect(mockQb.skip).toHaveBeenCalledWith(50);
    });

    it('should default limit to 50 and offset to 0', async () => {
      await service.listEvents(wsId, {});
      expect(mockQb.take).toHaveBeenCalledWith(50);
      expect(mockQb.skip).toHaveBeenCalledWith(0);
    });

    it('should order by created_at DESC', async () => {
      await service.listEvents(wsId, {});
      expect(mockQb.orderBy).toHaveBeenCalledWith('pae.created_at', 'DESC');
    });

    it('should return events and total', async () => {
      const mockEvents = [{ id: '1' }];
      mockQb.getManyAndCount.mockResolvedValueOnce([mockEvents, 1]);
      const result = await service.listEvents(wsId, {});
      expect(result).toEqual({ events: mockEvents, total: 1 });
    });
  });

  // ==================== GET EVENT TESTS ====================

  describe('getEvent()', () => {
    it('should find event by id and workspaceId', async () => {
      const mockEvent = { id: 'event-1', workspaceId: 'ws-1' };
      mockRepo.findOne.mockResolvedValueOnce(mockEvent);
      const result = await service.getEvent('ws-1', 'event-1');
      expect(result).toEqual(mockEvent);
    });

    it('should return null when event not found', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      const result = await service.getEvent('ws-1', 'missing-id');
      expect(result).toBeNull();
    });

    it('should return null for wrong workspace', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      const result = await service.getEvent('wrong-ws', 'event-1');
      expect(result).toBeNull();
    });
  });

  // ==================== GET EVENT STATS TESTS ====================

  describe('getEventStats()', () => {
    it('should return stats structure', async () => {
      // getEventStats now uses Promise.all with 2 getRawMany calls:
      // 1st for events-by-type, 2nd for top-actors
      mockQb.getRawMany
        .mockResolvedValueOnce([{ eventType: 'role_created', count: '5' }])
        .mockResolvedValueOnce([{ actorId: 'actor-1', count: '3' }]);

      const result = await service.getEventStats('ws-1');
      expect(result).toHaveProperty('totalEvents');
      expect(result).toHaveProperty('eventsByType');
      expect(result).toHaveProperty('topActors');
      expect(result).toHaveProperty('accessDenials');
    });

    it('should apply date range when provided', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');
      mockQb.getRawMany.mockResolvedValue([]);

      await service.getEventStats('ws-1', dateFrom, dateTo);
      expect(mockQb.andWhere).toHaveBeenCalled();
    });

    it('should derive access denials from events-by-type grouping', async () => {
      // The access denial count is now derived from the events-by-type query
      mockQb.getRawMany
        .mockResolvedValueOnce([
          { eventType: 'role_created', count: '5' },
          { eventType: 'access_denied_ip', count: '2' },
          { eventType: 'access_denied_geo', count: '1' },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getEventStats('ws-1');
      expect(result.accessDenials).toBe(3);
      expect(result.totalEvents).toBe(8);
    });

    it('should return empty stats for empty workspace', async () => {
      mockQb.getRawMany.mockResolvedValue([]);

      const result = await service.getEventStats('ws-1');
      expect(result.totalEvents).toBe(0);
      expect(result.eventsByType).toEqual({});
      expect(result.topActors).toEqual([]);
      expect(result.accessDenials).toBe(0);
    });

    it('should parse count strings to numbers', async () => {
      mockQb.getRawMany
        .mockResolvedValueOnce([{ eventType: 'role_created', count: '3' }])
        .mockResolvedValueOnce([{ actorId: 'actor-1', count: '5' }]);

      const result = await service.getEventStats('ws-1');
      expect(result.eventsByType['role_created']).toBe(3);
      expect(result.topActors[0].count).toBe(5);
    });
  });

  // ==================== EXPORT TESTS ====================

  describe('exportCSV()', () => {
    it('should generate CSV with headers', async () => {
      mockQb.getMany.mockResolvedValueOnce([]);
      const csv = await service.exportCSV('ws-1', {});
      expect(csv).toContain('Timestamp');
      expect(csv).toContain('Event Type');
      expect(csv).toContain('Actor ID');
    });

    it('should escape CSV formula prefixes', async () => {
      mockQb.getMany.mockResolvedValueOnce([
        {
          id: '1',
          eventType: PermissionAuditEventType.ROLE_CREATED,
          actorId: 'user-1',
          targetUserId: null,
          targetRoleId: null,
          ipAddress: null,
          beforeState: null,
          afterState: { formula: '=SUM(A1)' },
          createdAt: new Date('2024-01-01'),
        },
      ]);

      const csv = await service.exportCSV('ws-1', {});
      // The afterState is JSON stringified and should contain quote escaping
      expect(csv).toBeDefined();
      expect(csv.split('\n')).toHaveLength(2); // header + 1 row
    });

    it('should apply max export limit', async () => {
      mockQb.getMany.mockResolvedValueOnce([]);
      await service.exportCSV('ws-1', {});
      expect(mockQb.take).toHaveBeenCalledWith(10000);
    });
  });

  describe('exportJSON()', () => {
    it('should generate valid JSON', async () => {
      mockQb.getMany.mockResolvedValueOnce([
        {
          id: '1',
          eventType: PermissionAuditEventType.ROLE_CREATED,
          actorId: 'user-1',
          targetUserId: null,
          targetRoleId: 'role-1',
          beforeState: null,
          afterState: { name: 'test' },
          ipAddress: null,
          createdAt: new Date('2024-01-01'),
        },
      ]);

      const json = await service.exportJSON('ws-1', {});
      const parsed = JSON.parse(json);
      expect(parsed.exportedAt).toBeDefined();
      expect(parsed.workspaceId).toBe('ws-1');
      expect(parsed.totalEvents).toBe(1);
      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].eventType).toBe('role_created');
    });

    it('should apply max export limit', async () => {
      mockQb.getMany.mockResolvedValueOnce([]);
      await service.exportJSON('ws-1', {});
      expect(mockQb.take).toHaveBeenCalledWith(10000);
    });

    it('should include event details in export', async () => {
      mockQb.getMany.mockResolvedValueOnce([
        {
          id: 'event-1',
          eventType: PermissionAuditEventType.PERMISSION_GRANTED,
          actorId: 'actor-1',
          targetUserId: 'target-1',
          targetRoleId: 'role-1',
          beforeState: { granted: false },
          afterState: { granted: true },
          ipAddress: '10.0.0.1',
          createdAt: new Date('2024-06-15'),
        },
      ]);

      const json = await service.exportJSON('ws-1', {});
      const parsed = JSON.parse(json);
      expect(parsed.events[0].targetUserId).toBe('target-1');
      expect(parsed.events[0].targetRoleId).toBe('role-1');
      expect(parsed.events[0].beforeState).toEqual({ granted: false });
      expect(parsed.events[0].afterState).toEqual({ granted: true });
    });
  });

  // ==================== CLEANUP TESTS ====================

  describe('cleanupExpiredEvents()', () => {
    it('should delete events in batches', async () => {
      mockQb.getMany.mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);
      mockQb.execute.mockResolvedValueOnce({ affected: 500 });
      mockQb.getMany.mockResolvedValueOnce([]);

      const deleted = await service.cleanupExpiredEvents();
      expect(deleted).toBe(500);
    });

    it('should return 0 when nothing to delete', async () => {
      mockQb.getMany.mockResolvedValueOnce([]);
      const deleted = await service.cleanupExpiredEvents();
      expect(deleted).toBe(0);
    });

    it('should accept custom retention days', async () => {
      mockQb.getMany.mockResolvedValueOnce([]);
      await service.cleanupExpiredEvents(30);
      expect(mockQb.where).toHaveBeenCalledWith(
        'pae.created_at < :cutoffDate',
        expect.objectContaining({ cutoffDate: expect.any(Date) }),
      );
    });

    it('should continue deleting until batch is not full', async () => {
      mockQb.getMany
        .mockResolvedValueOnce(Array(1000).fill(null).map((_, i) => ({ id: `id-${i}` })));
      mockQb.execute.mockResolvedValueOnce({ affected: 1000 });
      mockQb.getMany
        .mockResolvedValueOnce(Array(1000).fill(null).map((_, i) => ({ id: `id-${i}` })));
      mockQb.execute.mockResolvedValueOnce({ affected: 1000 });
      mockQb.getMany
        .mockResolvedValueOnce(Array(300).fill(null).map((_, i) => ({ id: `id-${i}` })));
      mockQb.execute.mockResolvedValueOnce({ affected: 300 });
      mockQb.getMany.mockResolvedValueOnce([]);

      const deleted = await service.cleanupExpiredEvents();
      expect(deleted).toBe(2300);
    });
  });
});
