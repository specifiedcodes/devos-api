/**
 * AgentDefinitionAuditService Tests
 *
 * Story 18-1: Agent Definition Schema
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AgentDefinitionAuditService } from '../agent-definition-audit.service';
import {
  AgentDefinitionAuditEvent,
  AgentDefinitionAuditEventType,
} from '../../../database/entities/agent-definition-audit-event.entity';

describe('AgentDefinitionAuditService', () => {
  let service: AgentDefinitionAuditService;
  let repository: jest.Mocked<Repository<AgentDefinitionAuditEvent>>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockActorId = '22222222-2222-2222-2222-222222222222';
  const mockDefinitionId = '33333333-3333-3333-3333-333333333333';

  const mockAuditEvent: Partial<AgentDefinitionAuditEvent> = {
    id: '44444444-4444-4444-4444-444444444444',
    workspaceId: mockWorkspaceId,
    eventType: AgentDefinitionAuditEventType.AGENT_DEF_CREATED,
    agentDefinitionId: mockDefinitionId,
    actorId: mockActorId,
    details: { name: 'test-agent' },
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentDefinitionAuditService,
        {
          provide: getRepositoryToken(AgentDefinitionAuditEvent),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentDefinitionAuditService>(AgentDefinitionAuditService);
    repository = module.get(getRepositoryToken(AgentDefinitionAuditEvent)) as jest.Mocked<Repository<AgentDefinitionAuditEvent>>;
  });

  describe('logEvent', () => {
    it('should create audit record in database', async () => {
      repository.create.mockReturnValue(mockAuditEvent as AgentDefinitionAuditEvent);
      repository.save.mockResolvedValue(mockAuditEvent as AgentDefinitionAuditEvent);

      const result = await service.logEvent({
        workspaceId: mockWorkspaceId,
        eventType: AgentDefinitionAuditEventType.AGENT_DEF_CREATED,
        agentDefinitionId: mockDefinitionId,
        actorId: mockActorId,
        details: { name: 'test-agent' },
      });

      expect(repository.create).toHaveBeenCalledWith({
        workspaceId: mockWorkspaceId,
        eventType: AgentDefinitionAuditEventType.AGENT_DEF_CREATED,
        agentDefinitionId: mockDefinitionId,
        actorId: mockActorId,
        details: { name: 'test-agent' },
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle all event types', async () => {
      const eventTypes = Object.values(AgentDefinitionAuditEventType);
      repository.create.mockReturnValue(mockAuditEvent as AgentDefinitionAuditEvent);
      repository.save.mockResolvedValue(mockAuditEvent as AgentDefinitionAuditEvent);

      for (const eventType of eventTypes) {
        await service.logEvent({
          workspaceId: mockWorkspaceId,
          eventType,
        });
      }

      expect(repository.create).toHaveBeenCalledTimes(eventTypes.length);
    });

    it('should not throw on database error (fire-and-forget)', async () => {
      repository.create.mockReturnValue(mockAuditEvent as AgentDefinitionAuditEvent);
      repository.save.mockRejectedValue(new Error('DB connection failed'));

      const result = await service.logEvent({
        workspaceId: mockWorkspaceId,
        eventType: AgentDefinitionAuditEventType.AGENT_DEF_CREATED,
      });

      expect(result).toBeNull();
    });

    it('should store details JSONB correctly', async () => {
      const details = { changedFields: ['name', 'description'], previousVersion: '1.0.0' };
      repository.create.mockReturnValue(mockAuditEvent as AgentDefinitionAuditEvent);
      repository.save.mockResolvedValue(mockAuditEvent as AgentDefinitionAuditEvent);

      await service.logEvent({
        workspaceId: mockWorkspaceId,
        eventType: AgentDefinitionAuditEventType.AGENT_DEF_UPDATED,
        details,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ details }),
      );
    });

    it('should default details to empty object and nullable fields to null', async () => {
      repository.create.mockReturnValue(mockAuditEvent as AgentDefinitionAuditEvent);
      repository.save.mockResolvedValue(mockAuditEvent as AgentDefinitionAuditEvent);

      await service.logEvent({
        workspaceId: mockWorkspaceId,
        eventType: AgentDefinitionAuditEventType.AGENT_DEF_DELETED,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agentDefinitionId: null,
          actorId: null,
          details: {},
        }),
      );
    });
  });

  describe('listEvents', () => {
    let mockQb: Partial<SelectQueryBuilder<AgentDefinitionAuditEvent>>;

    beforeEach(() => {
      mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAuditEvent], 1]),
      };
      repository.createQueryBuilder = jest.fn().mockReturnValue(mockQb);
    });

    it('should return paginated results', async () => {
      const result = await service.listEvents(mockWorkspaceId);

      expect(result.events).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should apply eventType filter', async () => {
      await service.listEvents(mockWorkspaceId, {
        eventType: AgentDefinitionAuditEventType.AGENT_DEF_CREATED,
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'event.eventType = :eventType',
        { eventType: AgentDefinitionAuditEventType.AGENT_DEF_CREATED },
      );
    });

    it('should apply agentDefinitionId filter', async () => {
      await service.listEvents(mockWorkspaceId, {
        agentDefinitionId: mockDefinitionId,
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'event.agentDefinitionId = :agentDefinitionId',
        { agentDefinitionId: mockDefinitionId },
      );
    });

    it('should apply date range filter', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      await service.listEvents(mockWorkspaceId, { dateFrom, dateTo });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'event.createdAt >= :dateFrom',
        { dateFrom },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'event.createdAt <= :dateTo',
        { dateTo },
      );
    });

    it('should respect max limit (200)', async () => {
      const result = await service.listEvents(mockWorkspaceId, { limit: 500 });
      expect(result.limit).toBe(200);
      expect(mockQb.take).toHaveBeenCalledWith(200);
    });

    it('should order by createdAt DESC', async () => {
      await service.listEvents(mockWorkspaceId);
      expect(mockQb.orderBy).toHaveBeenCalledWith('event.createdAt', 'DESC');
    });
  });
});
