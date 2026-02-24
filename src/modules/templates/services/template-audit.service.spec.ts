/**
 * TemplateAuditService Tests
 *
 * Story 19-1: Template Registry Backend
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplateAuditService } from './template-audit.service';
import {
  TemplateAuditEvent,
  TemplateAuditEventType,
} from '../../../database/entities/template-audit-event.entity';

describe('TemplateAuditService', () => {
  let service: TemplateAuditService;
  let repository: jest.Mocked<Repository<TemplateAuditEvent>>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockTemplateId = '22222222-2222-2222-2222-222222222222';
  const mockActorId = '33333333-3333-3333-3333-333333333333';

  const mockAuditEvent: Partial<TemplateAuditEvent> = {
    id: '44444444-4444-4444-4444-444444444444',
    workspaceId: mockWorkspaceId,
    templateId: mockTemplateId,
    eventType: TemplateAuditEventType.TEMPLATE_CREATED,
    actorId: mockActorId,
    details: { name: 'test-template' },
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateAuditService,
        {
          provide: getRepositoryToken(TemplateAuditEvent),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TemplateAuditService>(TemplateAuditService);
    repository = module.get(getRepositoryToken(TemplateAuditEvent));
  });

  describe('logEvent', () => {
    it('should create and save audit event', async () => {
      repository.create.mockReturnValue(mockAuditEvent as TemplateAuditEvent);
      repository.save.mockResolvedValue(mockAuditEvent as TemplateAuditEvent);

      const result = await service.logEvent({
        workspaceId: mockWorkspaceId,
        eventType: TemplateAuditEventType.TEMPLATE_CREATED,
        templateId: mockTemplateId,
        actorId: mockActorId,
        details: { name: 'test-template' },
      });

      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockAuditEvent);
    });

    it('should return null and log error on save failure', async () => {
      repository.create.mockReturnValue(mockAuditEvent as TemplateAuditEvent);
      repository.save.mockRejectedValue(new Error('Database error'));

      const result = await service.logEvent({
        workspaceId: mockWorkspaceId,
        eventType: TemplateAuditEventType.TEMPLATE_CREATED,
      });

      expect(result).toBeNull();
    });
  });

  describe('logTemplateCreated', () => {
    it('should log template created event with correct type', async () => {
      repository.create.mockReturnValue(mockAuditEvent as TemplateAuditEvent);
      repository.save.mockResolvedValue(mockAuditEvent as TemplateAuditEvent);

      await service.logTemplateCreated(mockWorkspaceId, mockTemplateId, mockActorId, {
        name: 'test',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TemplateAuditEventType.TEMPLATE_CREATED,
        }),
      );
    });
  });

  describe('logTemplateUpdated', () => {
    it('should log template updated event with changed fields', async () => {
      repository.create.mockReturnValue(mockAuditEvent as TemplateAuditEvent);
      repository.save.mockResolvedValue(mockAuditEvent as TemplateAuditEvent);

      await service.logTemplateUpdated(
        mockWorkspaceId,
        mockTemplateId,
        mockActorId,
        ['displayName', 'description'],
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TemplateAuditEventType.TEMPLATE_UPDATED,
          details: expect.objectContaining({
            changedFields: ['displayName', 'description'],
          }),
        }),
      );
    });
  });

  describe('logTemplateDeleted', () => {
    it('should log template deleted event with snapshot', async () => {
      repository.create.mockReturnValue(mockAuditEvent as TemplateAuditEvent);
      repository.save.mockResolvedValue(mockAuditEvent as TemplateAuditEvent);

      const deletedSnapshot = { name: 'deleted-template', displayName: 'Deleted' };

      await service.logTemplateDeleted(
        mockWorkspaceId,
        mockTemplateId,
        mockActorId,
        deletedSnapshot,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TemplateAuditEventType.TEMPLATE_DELETED,
          details: expect.objectContaining({
            deletedTemplate: deletedSnapshot,
          }),
        }),
      );
    });
  });

  describe('logTemplatePublished', () => {
    it('should log template published event with version', async () => {
      repository.create.mockReturnValue(mockAuditEvent as TemplateAuditEvent);
      repository.save.mockResolvedValue(mockAuditEvent as TemplateAuditEvent);

      await service.logTemplatePublished(mockWorkspaceId, mockTemplateId, mockActorId, '1.0.0');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TemplateAuditEventType.TEMPLATE_PUBLISHED,
          details: expect.objectContaining({ version: '1.0.0' }),
        }),
      );
    });
  });

  describe('logTemplateUsed', () => {
    it('should log template used event', async () => {
      repository.create.mockReturnValue(mockAuditEvent as TemplateAuditEvent);
      repository.save.mockResolvedValue(mockAuditEvent as TemplateAuditEvent);

      await service.logTemplateUsed(mockWorkspaceId, mockTemplateId, 'project-123');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TemplateAuditEventType.TEMPLATE_USED,
        }),
      );
    });
  });

  describe('logTemplateRatingUpdated', () => {
    it('should log rating update with old and new values', async () => {
      repository.create.mockReturnValue(mockAuditEvent as TemplateAuditEvent);
      repository.save.mockResolvedValue(mockAuditEvent as TemplateAuditEvent);

      await service.logTemplateRatingUpdated(mockWorkspaceId, mockTemplateId, 4.0, 4.5, 10);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TemplateAuditEventType.TEMPLATE_RATING_UPDATED,
          details: expect.objectContaining({
            oldRating: 4.0,
            newRating: 4.5,
            ratingCount: 10,
          }),
        }),
      );
    });
  });

  describe('listEvents', () => {
    it('should return paginated events with default params', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditEvent], 1]),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.listEvents(mockWorkspaceId);

      expect(result.events).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should apply filters correctly', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.listEvents(mockWorkspaceId, {
        eventType: TemplateAuditEventType.TEMPLATE_CREATED,
        templateId: mockTemplateId,
        actorId: mockActorId,
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-12-31'),
        page: 2,
        limit: 10,
      });

      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(5); // eventType, templateId, actorId, dateFrom, dateTo
    });

    it('should handle null workspaceId', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.listEvents(null);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('event.workspace_id IS NULL');
    });
  });
});
