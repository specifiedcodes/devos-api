import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { SprintsService } from './sprints.service';
import { Sprint, SprintStatus } from '../../database/entities/sprint.entity';
import { Story, StoryStatus, StoryPriority } from '../../database/entities/story.entity';
import { Project } from '../../database/entities/project.entity';
import { RedisService } from '../redis/redis.service';

const mockProject = {
  id: 'project-uuid',
  workspaceId: 'workspace-uuid',
  name: 'Test Project',
};

const mockSprint = {
  id: 'sprint-uuid',
  projectId: 'project-uuid',
  sprintNumber: 1,
  name: 'Sprint 1',
  goal: 'First sprint',
  startDate: null,
  endDate: null,
  capacity: 30,
  status: SprintStatus.PLANNED,
  completedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockStory = {
  id: 'story-uuid',
  projectId: 'project-uuid',
  sprintId: undefined,
  storyKey: 'DEV-1',
  title: 'Test Story',
  status: StoryStatus.BACKLOG,
  priority: StoryPriority.MEDIUM,
  storyPoints: 5,
  position: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('SprintsService', () => {
  let service: SprintsService;
  let sprintRepository: jest.Mocked<Repository<Sprint>>;
  let storyRepository: jest.Mocked<Repository<Story>>;
  let projectRepository: jest.Mocked<Repository<Project>>;
  let redisService: jest.Mocked<RedisService>;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    execute: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintsService,
        {
          provide: getRepositoryToken(Sprint),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(Story),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(Project),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            publish: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get<SprintsService>(SprintsService);
    sprintRepository = module.get(getRepositoryToken(Sprint));
    storyRepository = module.get(getRepositoryToken(Story));
    projectRepository = module.get(getRepositoryToken(Project));
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSprint', () => {
    it('should auto-generate sprintNumber', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxNumber: 2 });
      sprintRepository.create.mockReturnValue({ ...mockSprint, sprintNumber: 3 } as any);
      sprintRepository.save.mockResolvedValue({ ...mockSprint, sprintNumber: 3 } as any);
      storyRepository.find.mockResolvedValue([]);

      const result = await service.createSprint('workspace-uuid', 'project-uuid', {});

      expect(result.sprintNumber).toBe(3);
    });

    it('should auto-name "Sprint N" if name not provided', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxNumber: 0 });
      sprintRepository.create.mockImplementation((data: any) => ({ ...mockSprint, ...data } as any));
      sprintRepository.save.mockImplementation((data: any) => Promise.resolve({ ...mockSprint, ...data } as any));
      storyRepository.find.mockResolvedValue([]);

      const result = await service.createSprint('workspace-uuid', 'project-uuid', {});

      expect(result.name).toBe('Sprint 1');
    });

    it('should use custom name and goal', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxNumber: 0 });
      sprintRepository.create.mockImplementation((data: any) => ({ ...mockSprint, ...data } as any));
      sprintRepository.save.mockImplementation((data: any) => Promise.resolve({ ...mockSprint, ...data } as any));
      storyRepository.find.mockResolvedValue([]);

      const result = await service.createSprint('workspace-uuid', 'project-uuid', {
        name: 'My Sprint',
        goal: 'Custom goal',
      });

      expect(result.name).toBe('My Sprint');
      expect(result.goal).toBe('Custom goal');
    });

    it('should throw NotFoundException if project not found', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createSprint('workspace-uuid', 'bad-project', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listSprints', () => {
    it('should return sprints ordered by sprintNumber DESC', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      const sprints = [
        { ...mockSprint, sprintNumber: 2, name: 'Sprint 2' },
        { ...mockSprint, sprintNumber: 1, name: 'Sprint 1' },
      ];
      sprintRepository.find.mockResolvedValue(sprints as any);
      storyRepository.find.mockResolvedValue([]);

      const result = await service.listSprints('workspace-uuid', 'project-uuid');

      expect(result.sprints).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(sprintRepository.find).toHaveBeenCalledWith({
        where: { projectId: 'project-uuid' },
        order: { sprintNumber: 'DESC' },
      });
    });
  });

  describe('getSprint', () => {
    it('should return sprint with computed story counts', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue(mockSprint as any);
      storyRepository.find.mockResolvedValue([
        { ...mockStory, storyPoints: 5, status: StoryStatus.DONE },
        { ...mockStory, id: 'story-2', storyPoints: 3, status: StoryStatus.BACKLOG },
      ] as any);

      const result = await service.getSprint('workspace-uuid', 'project-uuid', 'sprint-uuid');

      expect(result.storyCount).toBe(2);
      expect(result.completedStoryCount).toBe(1);
      expect(result.totalPoints).toBe(8);
      expect(result.completedPoints).toBe(5);
    });

    it('should throw NotFoundException if sprint not found', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getSprint('workspace-uuid', 'project-uuid', 'bad-sprint'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSprint', () => {
    it('should succeed for planned sprint', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue({ ...mockSprint } as any);
      sprintRepository.save.mockImplementation((data: any) => Promise.resolve({ ...data } as any));
      storyRepository.find.mockResolvedValue([]);

      const result = await service.updateSprint('workspace-uuid', 'project-uuid', 'sprint-uuid', {
        name: 'Updated Sprint',
        capacity: 40,
      });

      expect(result.name).toBe('Updated Sprint');
    });

    it('should fail for active sprint when changing dates or capacity', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.ACTIVE,
      } as any);

      await expect(
        service.updateSprint('workspace-uuid', 'project-uuid', 'sprint-uuid', {
          capacity: 40,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should fail for completed sprint', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.COMPLETED,
      } as any);

      await expect(
        service.updateSprint('workspace-uuid', 'project-uuid', 'sprint-uuid', {
          name: 'Updated',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('startSprint', () => {
    it('should set status to active and validate dates', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValueOnce({ ...mockSprint } as any); // findSprint
      sprintRepository.findOne.mockResolvedValueOnce(null); // no active sprint
      sprintRepository.save.mockImplementation((data: any) => Promise.resolve({ ...data } as any));
      storyRepository.find.mockResolvedValue([]);

      const result = await service.startSprint('workspace-uuid', 'project-uuid', 'sprint-uuid', {
        startDate: '2026-02-01',
        endDate: '2026-02-14',
      });

      expect(result.status).toBe(SprintStatus.ACTIVE);
      expect(result.startDate).toBe('2026-02-01');
      expect(result.endDate).toBe('2026-02-14');
    });

    it('should fail if another sprint is active', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValueOnce({ ...mockSprint } as any); // findSprint
      sprintRepository.findOne.mockResolvedValueOnce({
        ...mockSprint,
        id: 'other-sprint',
        status: SprintStatus.ACTIVE,
        name: 'Active Sprint',
      } as any); // active sprint exists

      await expect(
        service.startSprint('workspace-uuid', 'project-uuid', 'sprint-uuid', {
          startDate: '2026-02-01',
          endDate: '2026-02-14',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should fail if sprint is not planned', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValueOnce({
        ...mockSprint,
        status: SprintStatus.ACTIVE,
      } as any);

      await expect(
        service.startSprint('workspace-uuid', 'project-uuid', 'sprint-uuid', {
          startDate: '2026-02-01',
          endDate: '2026-02-14',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should fail if end date is before start date', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValueOnce({ ...mockSprint } as any);
      sprintRepository.findOne.mockResolvedValueOnce(null); // no active sprint

      await expect(
        service.startSprint('workspace-uuid', 'project-uuid', 'sprint-uuid', {
          startDate: '2026-02-14',
          endDate: '2026-02-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('completeSprint', () => {
    it('should set status to completed and return incomplete stories to backlog', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.ACTIVE,
      } as any);
      mockQueryBuilder.execute.mockResolvedValue({ affected: 2 });
      sprintRepository.save.mockImplementation((data: any) =>
        Promise.resolve({ ...data, completedAt: new Date() } as any),
      );
      storyRepository.find.mockResolvedValue([]);

      const result = await service.completeSprint('workspace-uuid', 'project-uuid', 'sprint-uuid');

      expect(result.status).toBe(SprintStatus.COMPLETED);
      expect(storyRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should fail if sprint is not active', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue({ ...mockSprint } as any);

      await expect(
        service.completeSprint('workspace-uuid', 'project-uuid', 'sprint-uuid'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteSprint', () => {
    it('should only work for planned sprints', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue({ ...mockSprint } as any);
      mockQueryBuilder.execute.mockResolvedValue({ affected: 0 });
      sprintRepository.remove.mockResolvedValue(undefined as any);

      await service.deleteSprint('workspace-uuid', 'project-uuid', 'sprint-uuid');

      expect(sprintRepository.remove).toHaveBeenCalled();
    });

    it('should fail for active sprints', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue({
        ...mockSprint,
        status: SprintStatus.ACTIVE,
      } as any);

      await expect(
        service.deleteSprint('workspace-uuid', 'project-uuid', 'sprint-uuid'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('addStoryToSprint', () => {
    it('should set story.sprintId', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue(mockSprint as any);
      storyRepository.findOne.mockResolvedValue({ ...mockStory } as any);
      storyRepository.save.mockImplementation((data: any) => Promise.resolve({ ...data } as any));
      storyRepository.find.mockResolvedValue([{ ...mockStory, sprintId: 'sprint-uuid' }] as any);

      const result = await service.addStoryToSprint(
        'workspace-uuid',
        'project-uuid',
        'sprint-uuid',
        'story-uuid',
      );

      expect(storyRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ sprintId: 'sprint-uuid' }),
      );
      expect(result.storyCount).toBe(1);
    });

    it('should throw if story not found', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue(mockSprint as any);
      storyRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addStoryToSprint('workspace-uuid', 'project-uuid', 'sprint-uuid', 'bad-story'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeStoryFromSprint', () => {
    it('should clear story.sprintId', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue(mockSprint as any);
      storyRepository.findOne.mockResolvedValue({
        ...mockStory,
        sprintId: 'sprint-uuid',
      } as any);
      storyRepository.save.mockImplementation((data: any) => Promise.resolve({ ...data } as any));
      storyRepository.find.mockResolvedValue([]);

      await service.removeStoryFromSprint(
        'workspace-uuid',
        'project-uuid',
        'sprint-uuid',
        'story-uuid',
      );

      expect(storyRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ sprintId: undefined }),
      );
    });

    it('should throw if story not in sprint', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject as any);
      sprintRepository.findOne.mockResolvedValue(mockSprint as any);
      storyRepository.findOne.mockResolvedValue(null);

      await expect(
        service.removeStoryFromSprint('workspace-uuid', 'project-uuid', 'sprint-uuid', 'bad-story'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
