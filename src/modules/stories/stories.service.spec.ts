import { Test, TestingModule } from '@nestjs/testing';
import { StoriesService } from './stories.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Story, StoryStatus, StoryPriority } from '../../database/entities/story.entity';
import { Project } from '../../database/entities/project.entity';
import { RedisService } from '../redis/redis.service';
import { NotFoundException } from '@nestjs/common';

describe('StoriesService', () => {
  let service: StoriesService;
  let mockStoryRepository: any;
  let mockProjectRepository: any;
  let mockRedisService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockStoryId = '55555555-5555-5555-5555-555555555555';
  const mockAgentId = '77777777-7777-7777-7777-777777777777';

  const mockProject = {
    id: mockProjectId,
    name: 'My Project',
    workspaceId: mockWorkspaceId,
  };

  const mockAgent = {
    id: mockAgentId,
    name: 'Dev Agent',
    type: 'dev',
    status: 'running',
  };

  const mockStory = {
    id: mockStoryId,
    projectId: mockProjectId,
    epicId: null,
    storyKey: '7.1',
    title: 'Kanban Board Component',
    description: 'As a user, I want a Kanban board',
    status: StoryStatus.BACKLOG,
    priority: StoryPriority.HIGH,
    storyPoints: 5,
    position: 0,
    tags: ['feature'],
    assignedAgentId: null,
    assignedAgent: null,
    createdAt: new Date('2026-02-01T10:00:00Z'),
    updatedAt: new Date('2026-02-01T10:00:00Z'),
  };

  const mockStoryWithAgent = {
    ...mockStory,
    id: '66666666-6666-6666-6666-666666666666',
    storyKey: '7.2',
    title: 'Real-Time Updates',
    status: StoryStatus.IN_PROGRESS,
    priority: StoryPriority.MEDIUM,
    assignedAgentId: mockAgentId,
    assignedAgent: mockAgent,
    position: 1,
  };

  const createMockQueryBuilder = (stories: any[] = [], count = 0) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([stories, count]),
    getRawOne: jest.fn().mockResolvedValue({ maxPosition: null }),
  });

  beforeEach(async () => {
    mockStoryRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockProjectRepository = {
      findOne: jest.fn().mockResolvedValue(mockProject),
    };

    mockRedisService = {
      publish: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoriesService,
        { provide: getRepositoryToken(Story), useValue: mockStoryRepository },
        { provide: getRepositoryToken(Project), useValue: mockProjectRepository },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<StoriesService>(StoriesService);
  });

  describe('listStories', () => {
    it('should return paginated list of stories sorted by position', async () => {
      const stories = [mockStory, mockStoryWithAgent];
      const queryBuilder = createMockQueryBuilder(stories, 2);
      mockStoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.listStories(mockWorkspaceId, mockProjectId, {
        page: 1,
        perPage: 100,
      });

      expect(result.stories).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(100);
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('story.position', 'ASC');
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('story.createdAt', 'ASC');
    });

    it('should filter by status', async () => {
      const queryBuilder = createMockQueryBuilder([mockStory], 1);
      mockStoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.listStories(mockWorkspaceId, mockProjectId, {
        status: StoryStatus.BACKLOG,
        page: 1,
        perPage: 100,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('story.status = :status', {
        status: StoryStatus.BACKLOG,
      });
    });

    it('should filter by priority', async () => {
      const queryBuilder = createMockQueryBuilder([mockStory], 1);
      mockStoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.listStories(mockWorkspaceId, mockProjectId, {
        priority: StoryPriority.HIGH,
        page: 1,
        perPage: 100,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('story.priority = :priority', {
        priority: StoryPriority.HIGH,
      });
    });

    it('should filter by epicId', async () => {
      const epicId = '99999999-9999-9999-9999-999999999999';
      const queryBuilder = createMockQueryBuilder([], 0);
      mockStoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.listStories(mockWorkspaceId, mockProjectId, {
        epicId,
        page: 1,
        perPage: 100,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('story.epicId = :epicId', {
        epicId,
      });
    });

    it('should filter by assignedAgentId', async () => {
      const queryBuilder = createMockQueryBuilder([mockStoryWithAgent], 1);
      mockStoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.listStories(mockWorkspaceId, mockProjectId, {
        assignedAgentId: mockAgentId,
        page: 1,
        perPage: 100,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'story.assignedAgentId = :assignedAgentId',
        { assignedAgentId: mockAgentId },
      );
    });

    it('should return empty list when no stories exist', async () => {
      const queryBuilder = createMockQueryBuilder([], 0);
      mockStoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.listStories(mockWorkspaceId, mockProjectId, {
        page: 1,
        perPage: 100,
      });

      expect(result.stories).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.listStories(mockWorkspaceId, 'invalid-project-id', {
          page: 1,
          perPage: 100,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should include assigned agent relation', async () => {
      const queryBuilder = createMockQueryBuilder([mockStoryWithAgent], 1);
      mockStoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.listStories(mockWorkspaceId, mockProjectId, {
        page: 1,
        perPage: 100,
      });

      expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'story.assignedAgent',
        'agent',
      );
      expect(result.stories[0].assignedAgent).toEqual({
        id: mockAgentId,
        name: 'Dev Agent',
        type: 'dev',
        status: 'running',
      });
    });
  });

  describe('getStory', () => {
    it('should return story with full details', async () => {
      mockStoryRepository.findOne.mockResolvedValue(mockStory);

      const result = await service.getStory(mockWorkspaceId, mockProjectId, mockStoryId);

      expect(result.id).toBe(mockStoryId);
      expect(result.title).toBe('Kanban Board Component');
      expect(result.status).toBe(StoryStatus.BACKLOG);
      expect(result.priority).toBe(StoryPriority.HIGH);
    });

    it('should throw NotFoundException for invalid story', async () => {
      mockStoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getStory(mockWorkspaceId, mockProjectId, 'invalid-story-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getStory(mockWorkspaceId, 'invalid-project-id', mockStoryId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createStory', () => {
    it('should create story with default status backlog', async () => {
      const createDto = {
        storyKey: '7.3',
        title: 'Drag and Drop',
      };

      const queryBuilder = createMockQueryBuilder();
      mockStoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const savedStory = {
        id: 'new-story-id',
        ...createDto,
        projectId: mockProjectId,
        status: StoryStatus.BACKLOG,
        priority: StoryPriority.MEDIUM,
        position: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStoryRepository.create.mockReturnValue(savedStory);
      mockStoryRepository.save.mockResolvedValue(savedStory);

      const result = await service.createStory(mockWorkspaceId, mockProjectId, createDto);

      expect(result.status).toBe(StoryStatus.BACKLOG);
      expect(result.storyKey).toBe('7.3');
      expect(result.title).toBe('Drag and Drop');
    });

    it('should create story with specified priority and tags', async () => {
      const createDto = {
        storyKey: '7.4',
        title: 'Story Detail Modal',
        priority: StoryPriority.HIGH,
        tags: ['feature', 'ui'],
        storyPoints: 8,
      };

      const queryBuilder = createMockQueryBuilder();
      mockStoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const savedStory = {
        id: 'new-story-id',
        ...createDto,
        projectId: mockProjectId,
        status: StoryStatus.BACKLOG,
        position: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStoryRepository.create.mockReturnValue(savedStory);
      mockStoryRepository.save.mockResolvedValue(savedStory);

      const result = await service.createStory(mockWorkspaceId, mockProjectId, createDto);

      expect(result.priority).toBe(StoryPriority.HIGH);
      expect(result.tags).toEqual(['feature', 'ui']);
      expect(result.storyPoints).toBe(8);
    });

    it('should auto-assign position to end of backlog', async () => {
      const createDto = {
        storyKey: '7.5',
        title: 'Create Stories UI',
      };

      const queryBuilder = createMockQueryBuilder();
      queryBuilder.getRawOne.mockResolvedValue({ maxPosition: 3 });
      mockStoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const savedStory = {
        id: 'new-story-id',
        ...createDto,
        projectId: mockProjectId,
        status: StoryStatus.BACKLOG,
        priority: StoryPriority.MEDIUM,
        position: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStoryRepository.create.mockReturnValue(savedStory);
      mockStoryRepository.save.mockResolvedValue(savedStory);

      await service.createStory(mockWorkspaceId, mockProjectId, createDto);

      expect(mockStoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ position: 4 }),
      );
    });

    it('should publish story:updated event after creation', async () => {
      const createDto = {
        storyKey: '7.3',
        title: 'Drag and Drop',
      };

      const queryBuilder = createMockQueryBuilder();
      mockStoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const savedStory = {
        id: 'new-story-id',
        ...createDto,
        projectId: mockProjectId,
        storyKey: '7.3',
        status: StoryStatus.BACKLOG,
        priority: StoryPriority.MEDIUM,
        position: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStoryRepository.create.mockReturnValue(savedStory);
      mockStoryRepository.save.mockResolvedValue(savedStory);

      await service.createStory(mockWorkspaceId, mockProjectId, createDto);

      expect(mockRedisService.publish).toHaveBeenCalledWith(
        'story-events',
        expect.stringContaining('story:updated'),
      );
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createStory(mockWorkspaceId, 'invalid-project-id', {
          storyKey: '7.1',
          title: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStory', () => {
    it('should update story fields and return updated story', async () => {
      const updateDto = {
        title: 'Updated Title',
        description: 'Updated description',
        priority: StoryPriority.LOW,
      };

      mockStoryRepository.findOne.mockResolvedValue({ ...mockStory });
      mockStoryRepository.save.mockResolvedValue({
        ...mockStory,
        ...updateDto,
      });

      const result = await service.updateStory(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        updateDto,
      );

      expect(result.title).toBe('Updated Title');
      expect(result.description).toBe('Updated description');
      expect(result.priority).toBe(StoryPriority.LOW);
    });

    it('should throw NotFoundException for invalid story', async () => {
      mockStoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStory(mockWorkspaceId, mockProjectId, 'invalid-id', {
          title: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStory(mockWorkspaceId, 'invalid-project-id', mockStoryId, {
          title: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should publish story:updated event to Redis', async () => {
      const updateDto = { title: 'New Title' };

      mockStoryRepository.findOne.mockResolvedValue({ ...mockStory });
      mockStoryRepository.save.mockResolvedValue({
        ...mockStory,
        ...updateDto,
      });

      await service.updateStory(mockWorkspaceId, mockProjectId, mockStoryId, updateDto);

      expect(mockRedisService.publish).toHaveBeenCalledWith(
        'story-events',
        expect.stringContaining('story:updated'),
      );
    });
  });

  describe('updateStoryStatus', () => {
    it('should update status and recalculate position', async () => {
      mockStoryRepository.findOne.mockResolvedValue({
        ...mockStory,
        status: StoryStatus.BACKLOG,
        position: 0,
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxPosition: 2 }),
      };
      mockStoryRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      mockStoryRepository.save.mockResolvedValue({
        ...mockStory,
        status: StoryStatus.IN_PROGRESS,
        position: 3,
      });

      const result = await service.updateStoryStatus(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        { status: StoryStatus.IN_PROGRESS },
      );

      expect(result.status).toBe(StoryStatus.IN_PROGRESS);
      expect(mockRedisService.publish).toHaveBeenCalledWith(
        'story-events',
        expect.stringContaining('story:status_changed'),
      );
    });

    it('should throw NotFoundException for invalid story', async () => {
      mockStoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStoryStatus(mockWorkspaceId, mockProjectId, 'invalid-id', {
          status: StoryStatus.IN_PROGRESS,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStoryStatus(mockWorkspaceId, 'invalid-project-id', mockStoryId, {
          status: StoryStatus.IN_PROGRESS,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should publish story:status_changed event to Redis', async () => {
      mockStoryRepository.findOne.mockResolvedValue({
        ...mockStory,
        status: StoryStatus.BACKLOG,
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxPosition: 0 }),
      };
      mockStoryRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      mockStoryRepository.save.mockResolvedValue({
        ...mockStory,
        status: StoryStatus.REVIEW,
        position: 1,
      });

      await service.updateStoryStatus(mockWorkspaceId, mockProjectId, mockStoryId, {
        status: StoryStatus.REVIEW,
      });

      expect(mockRedisService.publish).toHaveBeenCalledWith(
        'story-events',
        expect.stringContaining('story:status_changed'),
      );

      const publishCall = mockRedisService.publish.mock.calls[0][1];
      const payload = JSON.parse(publishCall);
      expect(payload.event).toBe('story:status_changed');
      expect(payload.projectId).toBe(mockProjectId);
      expect(payload.data.id).toBe(mockStoryId);
      expect(payload.data.status).toBe(StoryStatus.REVIEW);
      expect(payload.data.previousStatus).toBe(StoryStatus.BACKLOG);
    });
  });

  describe('assignStory', () => {
    it('should assign agent to story and return with agent relation', async () => {
      mockStoryRepository.findOne
        .mockResolvedValueOnce({ ...mockStory }) // First findOne (validate)
        .mockResolvedValueOnce({ ...mockStory, assignedAgentId: mockAgentId, assignedAgent: mockAgent }); // Second findOne (reload)

      mockStoryRepository.save.mockResolvedValue({
        ...mockStory,
        assignedAgentId: mockAgentId,
      });

      const result = await service.assignStory(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        { assignedAgentId: mockAgentId },
      );

      expect(result.assignedAgentId).toBe(mockAgentId);
      expect(result.assignedAgent).toEqual({
        id: mockAgentId,
        name: 'Dev Agent',
        type: 'dev',
        status: 'running',
      });
    });

    it('should unassign agent when null is passed', async () => {
      mockStoryRepository.findOne
        .mockResolvedValueOnce({ ...mockStoryWithAgent }) // First findOne
        .mockResolvedValueOnce({ ...mockStory, assignedAgentId: null, assignedAgent: null }); // Reload

      mockStoryRepository.save.mockResolvedValue({
        ...mockStory,
        assignedAgentId: undefined,
      });

      const result = await service.assignStory(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        { assignedAgentId: null },
      );

      // Null is returned from the reload, mapped through mapToResponseDto
      expect(result.assignedAgentId).toBeNull();
    });

    it('should throw NotFoundException for invalid story', async () => {
      // First call to projectRepository
      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      // Story not found
      mockStoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assignStory(mockWorkspaceId, mockProjectId, 'invalid-id', {
          assignedAgentId: mockAgentId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assignStory(mockWorkspaceId, 'invalid-project-id', mockStoryId, {
          assignedAgentId: mockAgentId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should publish story:assigned event to Redis', async () => {
      mockStoryRepository.findOne
        .mockResolvedValueOnce({ ...mockStory })
        .mockResolvedValueOnce({ ...mockStory, assignedAgentId: mockAgentId, assignedAgent: mockAgent });

      mockStoryRepository.save.mockResolvedValue({
        ...mockStory,
        assignedAgentId: mockAgentId,
      });

      await service.assignStory(mockWorkspaceId, mockProjectId, mockStoryId, {
        assignedAgentId: mockAgentId,
      });

      expect(mockRedisService.publish).toHaveBeenCalledWith(
        'story-events',
        expect.stringContaining('story:assigned'),
      );

      const publishCall = mockRedisService.publish.mock.calls[0][1];
      const payload = JSON.parse(publishCall);
      expect(payload.event).toBe('story:assigned');
      expect(payload.data.assignedAgentId).toBe(mockAgentId);
    });
  });

  describe('deleteStory', () => {
    it('should delete story from database', async () => {
      mockStoryRepository.findOne.mockResolvedValue({ ...mockStory });
      mockStoryRepository.remove.mockResolvedValue(undefined);

      await service.deleteStory(mockWorkspaceId, mockProjectId, mockStoryId);

      expect(mockStoryRepository.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: mockStoryId }),
      );
    });

    it('should throw NotFoundException for invalid project', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteStory(mockWorkspaceId, 'invalid-project-id', mockStoryId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid story', async () => {
      mockStoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteStory(mockWorkspaceId, mockProjectId, 'invalid-story-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should publish story:deleted event to Redis', async () => {
      mockStoryRepository.findOne.mockResolvedValue({ ...mockStory });
      mockStoryRepository.remove.mockResolvedValue(undefined);

      await service.deleteStory(mockWorkspaceId, mockProjectId, mockStoryId);

      expect(mockRedisService.publish).toHaveBeenCalledWith(
        'story-events',
        expect.stringContaining('story:deleted'),
      );

      const publishCall = mockRedisService.publish.mock.calls[0][1];
      const payload = JSON.parse(publishCall);
      expect(payload.event).toBe('story:deleted');
      expect(payload.projectId).toBe(mockProjectId);
      expect(payload.data.id).toBe(mockStoryId);
    });
  });
});
