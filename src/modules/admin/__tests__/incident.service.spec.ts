import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IncidentService } from '../services/incident.service';
import { Incident } from '../../../database/entities/incident.entity';
import { IncidentUpdate } from '../../../database/entities/incident-update.entity';

describe('IncidentService', () => {
  let service: IncidentService;
  let mockIncidentRepository: any;
  let mockIncidentUpdateRepository: any;
  let mockAlertHistoryRepository: any;
  let mockEventEmitter: any;

  const mockIncident: Partial<Incident> = {
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
    createdAt: new Date('2026-02-16T10:00:00Z'),
    updatedAt: new Date('2026-02-16T10:00:00Z'),
  };

  const mockUpdate: Partial<IncidentUpdate> = {
    id: 'update-1',
    incidentId: 'incident-1',
    message: 'Primary database is not responding',
    status: 'investigating',
    author: 'admin-1',
    createdAt: new Date('2026-02-16T10:00:00Z'),
  };

  beforeEach(() => {
    mockIncidentRepository = {
      create: jest.fn((data: any) => ({ ...data, id: 'incident-1' })),
      save: jest.fn((data: any) => Promise.resolve({ ...data })),
      findOne: jest.fn().mockImplementation(() => Promise.resolve({ ...mockIncident })),
      find: jest.fn().mockResolvedValue([{ ...mockIncident }]),
      createQueryBuilder: jest.fn().mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockIncident], 1]),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    mockIncidentUpdateRepository = {
      create: jest.fn((data: any) => ({ ...data, id: 'update-1' })),
      save: jest.fn((data: any) => Promise.resolve({ ...data, id: data.id || 'update-1' })),
    };

    mockAlertHistoryRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    service = new IncidentService(
      mockIncidentRepository,
      mockIncidentUpdateRepository,
      mockAlertHistoryRepository,
      mockEventEmitter,
    );
  });

  describe('createIncident', () => {
    it('should create incident with status investigating', async () => {
      const dto = {
        title: 'Database Outage',
        description: 'Primary database is not responding',
        severity: 'critical' as const,
        affectedServices: ['database', 'api'],
      };

      const result = await service.createIncident(dto, 'admin-1');

      expect(mockIncidentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: dto.title,
          status: 'investigating',
          severity: 'critical',
        }),
      );
      expect(mockIncidentRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create initial IncidentUpdate entry', async () => {
      const dto = {
        title: 'Database Outage',
        description: 'Primary database is not responding',
        severity: 'critical' as const,
        affectedServices: ['database', 'api'],
      };

      await service.createIncident(dto, 'admin-1');

      expect(mockIncidentUpdateRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: dto.description,
          status: 'investigating',
          author: 'admin-1',
        }),
      );
      expect(mockIncidentUpdateRepository.save).toHaveBeenCalled();
    });

    it('should validate alertHistoryId exists when provided', async () => {
      const dto = {
        title: 'Database Outage',
        description: 'Primary database is not responding',
        severity: 'critical' as const,
        affectedServices: ['database'],
        alertHistoryId: 'alert-1',
      };

      // alertHistoryRepository.findOne returns null (not found)
      await expect(
        service.createIncident(dto, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should accept valid alertHistoryId', async () => {
      mockAlertHistoryRepository.findOne.mockResolvedValue({ id: 'alert-1' });

      const dto = {
        title: 'Database Outage',
        description: 'Primary database is not responding',
        severity: 'critical' as const,
        affectedServices: ['database'],
        alertHistoryId: 'alert-1',
      };

      const result = await service.createIncident(dto, 'admin-1');
      expect(result).toBeDefined();
    });

    it('should emit incident.created event', async () => {
      const dto = {
        title: 'Database Outage',
        description: 'Primary database is not responding',
        severity: 'critical' as const,
        affectedServices: ['database'],
      };

      await service.createIncident(dto, 'admin-1');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'incident.created',
        expect.objectContaining({
          incident: expect.any(Object),
          update: expect.any(Object),
        }),
      );
    });
  });

  describe('addUpdate', () => {
    it('should create IncidentUpdate record', async () => {
      const dto = {
        message: 'Root cause identified: disk full',
        status: 'identified' as const,
      };

      const result = await service.addUpdate('incident-1', dto, 'admin-1');

      expect(mockIncidentUpdateRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          incidentId: 'incident-1',
          message: dto.message,
          status: 'identified',
        }),
      );
      expect(result).toBeDefined();
    });

    it('should change parent incident status', async () => {
      const dto = {
        message: 'Root cause identified',
        status: 'identified' as const,
      };

      await service.addUpdate('incident-1', dto, 'admin-1');

      expect(mockIncidentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'identified',
        }),
      );
    });

    it('should reject update on resolved incident', async () => {
      mockIncidentRepository.findOne.mockResolvedValue({
        ...mockIncident,
        status: 'resolved',
      });

      const dto = {
        message: 'Test update',
        status: 'monitoring' as const,
      };

      await expect(
        service.addUpdate('incident-1', dto, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should emit incident.updated event', async () => {
      const dto = {
        message: 'Status update',
        status: 'identified' as const,
      };

      await service.addUpdate('incident-1', dto, 'admin-1');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'incident.updated',
        expect.objectContaining({
          incident: expect.any(Object),
          update: expect.any(Object),
        }),
      );
    });

    it('should throw NotFoundException for unknown incident', async () => {
      mockIncidentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addUpdate('unknown', { message: 'test', status: 'identified' }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveIncident', () => {
    beforeEach(() => {
      // Reset findOne to return a fresh non-resolved incident
      mockIncidentRepository.findOne.mockImplementation(() =>
        Promise.resolve({ ...mockIncident, status: 'investigating' }),
      );
    });

    it('should set status to resolved and resolvedAt', async () => {
      const dto = { message: 'Fixed the issue' };

      const result = await service.resolveIncident('incident-1', dto, 'admin-1');

      expect(mockIncidentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'resolved',
          resolvedAt: expect.any(Date),
        }),
      );
      expect(result).toBeDefined();
    });

    it('should create final resolved IncidentUpdate', async () => {
      const dto = { message: 'Disk space freed' };

      await service.resolveIncident('incident-1', dto, 'admin-1');

      expect(mockIncidentUpdateRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'resolved',
          message: 'Disk space freed',
        }),
      );
    });

    it('should store postMortemUrl if provided', async () => {
      const dto = {
        message: 'Fixed',
        postMortemUrl: 'https://docs.example.com/postmortem',
      };

      await service.resolveIncident('incident-1', dto, 'admin-1');

      expect(mockIncidentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          postMortemUrl: 'https://docs.example.com/postmortem',
        }),
      );
    });

    it('should emit incident.resolved event', async () => {
      await service.resolveIncident('incident-1', {}, 'admin-1');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'incident.resolved',
        expect.objectContaining({
          incident: expect.any(Object),
          update: expect.any(Object),
        }),
      );
    });

    it('should reject already resolved incident', async () => {
      mockIncidentRepository.findOne.mockResolvedValue({
        ...mockIncident,
        status: 'resolved',
      });

      await expect(
        service.resolveIncident('incident-1', {}, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getIncident', () => {
    it('should return incident with all updates ordered by createdAt ASC', async () => {
      const updates = [
        { id: 'u2', createdAt: new Date('2026-02-16T12:00:00Z') },
        { id: 'u1', createdAt: new Date('2026-02-16T10:00:00Z') },
      ];
      mockIncidentRepository.findOne.mockResolvedValue({
        ...mockIncident,
        updates,
      });

      const result = await service.getIncident('incident-1');

      expect(result.updates![0].id).toBe('u1');
      expect(result.updates![1].id).toBe('u2');
    });

    it('should throw NotFoundException for unknown id', async () => {
      mockIncidentRepository.findOne.mockResolvedValue(null);

      await expect(service.getIncident('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listIncidents', () => {
    it('should return paginated results', async () => {
      const result = await service.listIncidents({ page: 1, limit: 20 });

      expect(result).toEqual({ items: [mockIncident], total: 1 });
    });

    it('should filter by status', async () => {
      await service.listIncidents({ status: 'investigating' });

      const qb = mockIncidentRepository.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('should filter by severity', async () => {
      await service.listIncidents({ severity: 'critical' });

      const qb = mockIncidentRepository.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('should filter by date range', async () => {
      await service.listIncidents({
        startDate: '2026-02-01T00:00:00Z',
        endDate: '2026-02-28T23:59:59Z',
      });

      const qb = mockIncidentRepository.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalled();
    });
  });

  describe('getActiveIncidents', () => {
    it('should return only non-resolved incidents', async () => {
      const activeIncidents = [
        { ...mockIncident, severity: 'critical', status: 'investigating' },
        { ...mockIncident, id: 'incident-2', severity: 'minor', status: 'monitoring' },
      ];
      mockIncidentRepository.find.mockResolvedValue(activeIncidents);

      const result = await service.getActiveIncidents();

      expect(result).toHaveLength(2);
      expect(mockIncidentRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['updates'],
        }),
      );
    });

    it('should order by severity (critical first)', async () => {
      const activeIncidents = [
        { ...mockIncident, id: 'i2', severity: 'minor', status: 'monitoring', createdAt: new Date('2026-02-16T10:00:00Z') },
        { ...mockIncident, id: 'i1', severity: 'critical', status: 'investigating', createdAt: new Date('2026-02-16T10:00:00Z') },
      ];
      mockIncidentRepository.find.mockResolvedValue(activeIncidents);

      const result = await service.getActiveIncidents();

      expect(result[0].severity).toBe('critical');
      expect(result[1].severity).toBe('minor');
    });
  });

  describe('updateIncident', () => {
    it('should update metadata fields', async () => {
      const dto = { title: 'Updated Title', severity: 'major' as const };

      await service.updateIncident('incident-1', dto, 'admin-1');

      expect(mockIncidentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated Title',
          severity: 'major',
        }),
      );
    });

    it('should allow postMortemUrl update on resolved incidents', async () => {
      mockIncidentRepository.findOne.mockResolvedValue({
        ...mockIncident,
        status: 'resolved',
      });

      const dto = { postMortemUrl: 'https://docs.example.com/pm' };
      const result = await service.updateIncident('incident-1', dto, 'admin-1');

      expect(mockIncidentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          postMortemUrl: 'https://docs.example.com/pm',
        }),
      );
    });

    it('should reject updating resolved incident (except postMortemUrl)', async () => {
      mockIncidentRepository.findOne.mockResolvedValue({
        ...mockIncident,
        status: 'resolved',
      });

      const dto = { title: 'New Title' };

      await expect(
        service.updateIncident('incident-1', dto, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not change status', async () => {
      const dto = { title: 'Updated Title' };

      await service.updateIncident('incident-1', dto, 'admin-1');

      // Status should remain investigating
      expect(mockIncidentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'investigating',
        }),
      );
    });
  });
});
