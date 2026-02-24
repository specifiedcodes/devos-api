/**
 * Tests for PermissionAuditController
 * Story 20-6: Permission Audit Trail
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PermissionAuditController } from '../controllers/permission-audit.controller';
import { PermissionAuditService } from '../services/permission-audit.service';
import { PermissionAuditEventType } from '../../../database/entities/permission-audit-event.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';

const mockService = {
  listEvents: jest.fn().mockResolvedValue({ events: [], total: 0 }),
  getEventStats: jest.fn().mockResolvedValue({
    totalEvents: 0,
    eventsByType: {},
    topActors: [],
    accessDenials: 0,
  }),
  exportCSV: jest.fn().mockResolvedValue('Timestamp,Event Type'),
  exportJSON: jest.fn().mockResolvedValue('{"events":[]}'),
  getEvent: jest.fn().mockResolvedValue(null),
};

describe('PermissionAuditController', () => {
  let controller: PermissionAuditController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mockGuard = { canActivate: jest.fn().mockReturnValue(true) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionAuditController],
      providers: [{ provide: PermissionAuditService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(RoleGuard)
      .useValue(mockGuard)
      .compile();
    controller = module.get<PermissionAuditController>(PermissionAuditController);
  });

  describe('listEvents()', () => {
    it('should return paginated event list', async () => {
      const mockEvents = [
        {
          id: 'e1',
          eventType: PermissionAuditEventType.ROLE_CREATED,
          actorId: 'user-1',
          targetUserId: null,
          targetRoleId: 'role-1',
          beforeState: null,
          afterState: { name: 'test' },
          ipAddress: null,
          createdAt: new Date('2024-01-01'),
        },
      ];
      mockService.listEvents.mockResolvedValueOnce({ events: mockEvents, total: 1 });

      const result = await controller.listEvents('ws-1', {});
      expect(result.events).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should pass filters to service', async () => {
      await controller.listEvents('ws-1', {
        eventType: PermissionAuditEventType.ROLE_CREATED,
        actorId: 'user-1',
        limit: 10,
        offset: 5,
      });

      expect(mockService.listEvents).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          eventType: PermissionAuditEventType.ROLE_CREATED,
          actorId: 'user-1',
        }),
        { limit: 10, offset: 5 },
      );
    });

    it('should convert dateFrom string to Date', async () => {
      await controller.listEvents('ws-1', { dateFrom: '2024-01-01T00:00:00Z' });
      expect(mockService.listEvents).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({ dateFrom: expect.any(Date) }),
        expect.any(Object),
      );
    });
  });

  describe('getStats()', () => {
    it('should return stats', async () => {
      const result = await controller.getStats('ws-1');
      expect(result).toHaveProperty('totalEvents');
      expect(result).toHaveProperty('eventsByType');
      expect(result).toHaveProperty('topActors');
      expect(result).toHaveProperty('accessDenials');
    });

    it('should pass date range to service', async () => {
      await controller.getStats('ws-1', '2024-01-01', '2024-12-31');
      expect(mockService.getEventStats).toHaveBeenCalledWith(
        'ws-1',
        expect.any(Date),
        expect.any(Date),
      );
    });
  });

  describe('exportEvents()', () => {
    const mockRes = {
      setHeader: jest.fn(),
    } as any;

    it('should export CSV by default', async () => {
      const result = await controller.exportEvents('ws-1', {}, 'csv', mockRes);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockService.exportCSV).toHaveBeenCalledWith('ws-1', expect.any(Object));
      expect(result).toContain('Timestamp');
    });

    it('should export JSON when format=json', async () => {
      const result = await controller.exportEvents('ws-1', {}, 'json', mockRes);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockService.exportJSON).toHaveBeenCalledWith('ws-1', expect.any(Object));
    });

    it('should set Content-Disposition header', async () => {
      await controller.exportEvents('ws-1', {}, 'csv', mockRes);
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename='),
      );
    });
  });

  describe('getEvent()', () => {
    it('should return event when found', async () => {
      const mockEvent = {
        id: 'e1',
        eventType: PermissionAuditEventType.ROLE_CREATED,
        actorId: 'user-1',
        targetUserId: null,
        targetRoleId: null,
        beforeState: null,
        afterState: null,
        ipAddress: null,
        createdAt: new Date('2024-01-01'),
      };
      mockService.getEvent.mockResolvedValueOnce(mockEvent);

      const result = await controller.getEvent('ws-1', 'e1');
      expect(result.id).toBe('e1');
    });

    it('should throw NotFoundException when event not found', async () => {
      mockService.getEvent.mockResolvedValueOnce(null);
      await expect(controller.getEvent('ws-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
