/**
 * HandoffHistoryService Tests
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Tests for handoff audit trail persistence in PostgreSQL.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HandoffHistoryService } from './handoff-history.service';
import { HandoffHistory } from '../entities/handoff-history.entity';

describe('HandoffHistoryService', () => {
  let service: HandoffHistoryService;
  let repository: jest.Mocked<Repository<HandoffHistory>>;

  const mockHandoffRecords: HandoffHistory[] = [
    {
      id: 'hh-1',
      workspaceId: 'ws-1',
      storyId: 'story-1',
      fromAgentType: 'planner',
      fromAgentId: 'agent-1',
      toAgentType: 'dev',
      toAgentId: 'agent-2',
      fromPhase: 'planning',
      toPhase: 'implementing',
      handoffType: 'normal',
      contextSummary: 'Planner -> Dev handoff',
      iterationCount: 0,
      durationMs: 5000,
      metadata: {},
      createdAt: new Date('2026-02-15T10:00:00Z'),
    },
    {
      id: 'hh-2',
      workspaceId: 'ws-1',
      storyId: 'story-1',
      fromAgentType: 'dev',
      fromAgentId: 'agent-2',
      toAgentType: 'qa',
      toAgentId: 'agent-3',
      fromPhase: 'implementing',
      toPhase: 'qa',
      handoffType: 'normal',
      contextSummary: 'Dev -> QA handoff',
      iterationCount: 0,
      durationMs: 30000,
      metadata: {},
      createdAt: new Date('2026-02-15T10:30:00Z'),
    },
  ];

  beforeEach(async () => {
    const mockRepository = {
      create: jest
        .fn()
        .mockImplementation((data) => ({ id: 'hh-new', ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue(mockHandoffRecords),
      findAndCount: jest
        .fn()
        .mockResolvedValue([mockHandoffRecords, mockHandoffRecords.length]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandoffHistoryService,
        {
          provide: getRepositoryToken(HandoffHistory),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<HandoffHistoryService>(HandoffHistoryService);
    repository = module.get(getRepositoryToken(HandoffHistory));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordHandoff', () => {
    it('should create PostgreSQL record', async () => {
      const handoff = {
        workspaceId: 'ws-1',
        storyId: 'story-1',
        fromAgentType: 'planner',
        fromAgentId: 'agent-1',
        toAgentType: 'dev',
        toAgentId: 'agent-2',
        fromPhase: 'planning',
        toPhase: 'implementing',
        handoffType: 'normal' as const,
        contextSummary: 'Planner -> Dev handoff',
        iterationCount: 0,
        durationMs: 5000,
        metadata: {},
      };

      await service.recordHandoff(handoff);

      expect(repository.create).toHaveBeenCalledWith(handoff);
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('getStoryHandoffs', () => {
    it('should return handoff history for story', async () => {
      const result = await service.getStoryHandoffs('story-1', 'ws-1');

      expect(result).toHaveLength(2);
      expect(repository.find).toHaveBeenCalledWith({
        where: { storyId: 'story-1', workspaceId: 'ws-1' },
        order: { createdAt: 'DESC' },
      });
    });

    it('should order by timestamp descending', async () => {
      await service.getStoryHandoffs('story-1', 'ws-1');

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });

  describe('getWorkspaceHandoffs', () => {
    it('should return paginated handoff history', async () => {
      const result = await service.getWorkspaceHandoffs({
        workspaceId: 'ws-1',
        limit: 20,
        offset: 0,
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should respect limit and offset', async () => {
      await service.getWorkspaceHandoffs({
        workspaceId: 'ws-1',
        limit: 10,
        offset: 5,
      });

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        order: { createdAt: 'DESC' },
        take: 10,
        skip: 5,
      });
    });

    it('should cap limit at 100', async () => {
      await service.getWorkspaceHandoffs({
        workspaceId: 'ws-1',
        limit: 200,
        offset: 0,
      });

      expect(repository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });
  });
});
