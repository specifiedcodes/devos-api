import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IncidentController } from '../controllers/incident.controller';
import { IncidentService } from '../services/incident.service';

describe('IncidentController', () => {
  let controller: IncidentController;
  let mockIncidentService: any;
  let mockAuditService: any;

  const mockIncident = {
    id: 'incident-1',
    title: 'Database Outage',
    description: 'Primary database is not responding',
    severity: 'critical',
    status: 'investigating',
    affectedServices: ['database', 'api'],
    alertHistoryId: null,
    createdBy: 'admin-1',
    postMortemUrl: null,
    resolvedAt: null,
    createdAt: '2026-02-16T10:00:00Z',
    updatedAt: '2026-02-16T10:00:00Z',
    updates: [
      {
        id: 'update-1',
        incidentId: 'incident-1',
        message: 'Investigating',
        status: 'investigating',
        author: 'admin-1',
        createdAt: '2026-02-16T10:00:00Z',
      },
    ],
  };

  const mockUpdate = {
    id: 'update-2',
    incidentId: 'incident-1',
    message: 'Root cause identified',
    status: 'identified',
    author: 'admin-1',
    createdAt: '2026-02-16T11:00:00Z',
  };

  const mockReq = {
    user: { userId: 'admin-1' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
  };

  beforeEach(() => {
    mockIncidentService = {
      createIncident: jest.fn().mockResolvedValue(mockIncident),
      getIncident: jest.fn().mockResolvedValue(mockIncident),
      listIncidents: jest.fn().mockResolvedValue({ items: [mockIncident], total: 1 }),
      updateIncident: jest.fn().mockResolvedValue(mockIncident),
      addUpdate: jest.fn().mockResolvedValue(mockUpdate),
      resolveIncident: jest.fn().mockResolvedValue({ ...mockIncident, status: 'resolved' }),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    controller = new IncidentController(
      mockIncidentService,
      mockAuditService,
    );
  });

  describe('POST /api/admin/incidents', () => {
    it('should create incident with admin userId', async () => {
      const dto = {
        title: 'Database Outage',
        description: 'Primary database is not responding',
        severity: 'critical' as const,
        affectedServices: ['database', 'api'],
      };

      const result = await controller.createIncident(dto, mockReq);

      expect(mockIncidentService.createIncident).toHaveBeenCalledWith(
        dto,
        'admin-1',
      );
      expect(result).toEqual(mockIncident);
    });

    it('should log audit action for incident creation', async () => {
      const dto = {
        title: 'Test',
        description: 'Test',
        severity: 'minor' as const,
        affectedServices: ['api'],
      };

      await controller.createIncident(dto, mockReq);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.incident_created',
        'incident',
        mockIncident.id,
        expect.any(Object),
      );
    });

    it('should validate required fields via service', async () => {
      mockIncidentService.createIncident.mockRejectedValue(
        new BadRequestException('Validation failed'),
      );

      await expect(
        controller.createIncident({} as any, mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /api/admin/incidents/:id', () => {
    it('should return incident with updates', async () => {
      const result = await controller.getIncident('incident-1');

      expect(mockIncidentService.getIncident).toHaveBeenCalledWith('incident-1');
      expect(result).toEqual(mockIncident);
    });

    it('should return 404 for unknown incident', async () => {
      mockIncidentService.getIncident.mockRejectedValue(
        new NotFoundException('Incident not found'),
      );

      await expect(
        controller.getIncident('unknown'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /api/admin/incidents', () => {
    it('should return paginated list', async () => {
      const result = await controller.listIncidents({ page: 1, limit: 20 }, mockReq);

      expect(result).toEqual(
        expect.objectContaining({
          items: [mockIncident],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );
    });

    it('should filter by status', async () => {
      await controller.listIncidents({ status: 'investigating' }, mockReq);

      expect(mockIncidentService.listIncidents).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'investigating' }),
      );
    });

    it('should filter by severity', async () => {
      await controller.listIncidents({ severity: 'critical' }, mockReq);

      expect(mockIncidentService.listIncidents).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' }),
      );
    });

    it('should filter by date range', async () => {
      await controller.listIncidents(
        { startDate: '2026-02-01T00:00:00Z', endDate: '2026-02-28T23:59:59Z' },
        mockReq,
      );

      expect(mockIncidentService.listIncidents).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: '2026-02-01T00:00:00Z',
          endDate: '2026-02-28T23:59:59Z',
        }),
      );
    });

    it('should log audit action for listing', async () => {
      await controller.listIncidents({}, mockReq);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.incident_listed',
        'incident',
        'list',
        expect.any(Object),
      );
    });
  });

  describe('PUT /api/admin/incidents/:id', () => {
    it('should update incident metadata', async () => {
      const dto = { title: 'Updated Title' };

      const result = await controller.updateIncident('incident-1', dto, mockReq);

      expect(mockIncidentService.updateIncident).toHaveBeenCalledWith(
        'incident-1',
        dto,
        'admin-1',
      );
      expect(result).toBeDefined();
    });

    it('should reject updating resolved incident (except postMortemUrl)', async () => {
      mockIncidentService.updateIncident.mockRejectedValue(
        new BadRequestException('Cannot update resolved incident'),
      );

      await expect(
        controller.updateIncident('incident-1', { title: 'New' }, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit action for update', async () => {
      await controller.updateIncident('incident-1', { title: 'Updated' }, mockReq);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.incident_updated',
        'incident',
        'incident-1',
        expect.any(Object),
      );
    });
  });

  describe('POST /api/admin/incidents/:id/updates', () => {
    it('should create timeline entry', async () => {
      const dto = { message: 'Root cause identified', status: 'identified' as const };

      const result = await controller.addUpdate('incident-1', dto, mockReq);

      expect(mockIncidentService.addUpdate).toHaveBeenCalledWith(
        'incident-1',
        dto,
        'admin-1',
      );
      expect(result).toEqual(mockUpdate);
    });

    it('should change incident status via update', async () => {
      const dto = { message: 'Monitoring', status: 'monitoring' as const };

      await controller.addUpdate('incident-1', dto, mockReq);

      expect(mockIncidentService.addUpdate).toHaveBeenCalledWith(
        'incident-1',
        expect.objectContaining({ status: 'monitoring' }),
        'admin-1',
      );
    });

    it('should reject update on resolved incident', async () => {
      mockIncidentService.addUpdate.mockRejectedValue(
        new BadRequestException('Cannot add update to resolved incident'),
      );

      await expect(
        controller.addUpdate('incident-1', { message: 'test', status: 'monitoring' }, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit action for update added', async () => {
      await controller.addUpdate(
        'incident-1',
        { message: 'Test', status: 'identified' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.incident_update_added',
        'incident',
        'incident-1',
        expect.any(Object),
      );
    });
  });

  describe('PUT /api/admin/incidents/:id/resolve', () => {
    it('should resolve incident', async () => {
      const dto = { message: 'Fixed' };

      const result = await controller.resolveIncident('incident-1', dto, mockReq);

      expect(mockIncidentService.resolveIncident).toHaveBeenCalledWith(
        'incident-1',
        dto,
        'admin-1',
      );
      expect(result.status).toBe('resolved');
    });

    it('should store postMortemUrl', async () => {
      const dto = {
        message: 'Fixed',
        postMortemUrl: 'https://docs.example.com/pm',
      };

      await controller.resolveIncident('incident-1', dto, mockReq);

      expect(mockIncidentService.resolveIncident).toHaveBeenCalledWith(
        'incident-1',
        expect.objectContaining({ postMortemUrl: 'https://docs.example.com/pm' }),
        'admin-1',
      );
    });

    it('should reject already resolved incident', async () => {
      mockIncidentService.resolveIncident.mockRejectedValue(
        new BadRequestException('Incident is already resolved'),
      );

      await expect(
        controller.resolveIncident('incident-1', {}, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit action for resolve', async () => {
      await controller.resolveIncident('incident-1', {}, mockReq);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.incident_resolved',
        'incident',
        'incident-1',
        expect.any(Object),
      );
    });
  });
});
