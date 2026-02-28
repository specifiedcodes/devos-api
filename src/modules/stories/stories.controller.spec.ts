import { Test, TestingModule } from '@nestjs/testing';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { NotFoundException } from '@nestjs/common';
import { StoryStatus, StoryPriority } from '../../database/entities/story.entity';
import { Reflector } from '@nestjs/core';

jest.mock('../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: jest.fn().mockImplementation(() => ({
    canActivate: jest.fn().mockReturnValue(true),
  })),
}));

jest.mock('../../common/guards/role.guard', () => ({
  RoleGuard: jest.fn().mockImplementation(() => ({
    canActivate: jest.fn().mockReturnValue(true),
  })),
  RequireRole: (..._roles: string[]) => jest.fn(),
}));

jest.mock('../../common/guards/permission.guard', () => ({
  PermissionGuard: jest.fn().mockImplementation(() => ({
    canActivate: jest.fn().mockReturnValue(true),
  })),
}));

describe('StoriesController', () => {
  let controller: StoriesController;
  let storiesService: jest.Mocked<StoriesService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockStoryId = '55555555-5555-5555-5555-555555555555';
  const mockAgentId = '77777777-7777-7777-7777-777777777777';

  const mockStoryResponse = {
    id: mockStoryId,
    projectId: mockProjectId,
    storyKey: '7.1',
    title: 'Kanban Board Component',
    description: 'As a user, I want a Kanban board',
    status: StoryStatus.BACKLOG,
    priority: StoryPriority.HIGH,
    storyPoints: 5,
    position: 0,
    tags: ['feature'],
    createdAt: new Date('2026-02-01T10:00:00Z'),
    updatedAt: new Date('2026-02-01T10:00:00Z'),
  };

  const mockStoryListResponse = {
    stories: [mockStoryResponse],
    total: 1,
    page: 1,
    perPage: 100,
  };

  beforeEach(async () => {
    const mockService = {
      listStories: jest.fn().mockResolvedValue(mockStoryListResponse),
      getStory: jest.fn().mockResolvedValue(mockStoryResponse),
      createStory: jest.fn().mockResolvedValue(mockStoryResponse),
      updateStory: jest.fn().mockResolvedValue(mockStoryResponse),
      updateStoryStatus: jest.fn().mockResolvedValue(mockStoryResponse),
      assignStory: jest.fn().mockResolvedValue(mockStoryResponse),
      deleteStory: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoriesController],
      providers: [
        {
          provide: StoriesService,
          useValue: mockService,
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<StoriesController>(StoriesController);
    storiesService = module.get(StoriesService);
  });

  describe('GET / (listStories)', () => {
    it('should return 200 with paginated story list', async () => {
      const result = await controller.listStories(mockWorkspaceId, mockProjectId, {
        page: 1,
        perPage: 100,
      });

      expect(result.stories).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(storiesService.listStories).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        { page: 1, perPage: 100 },
      );
    });

    it('should return 200 with status filter applied', async () => {
      await controller.listStories(mockWorkspaceId, mockProjectId, {
        status: StoryStatus.BACKLOG,
        page: 1,
        perPage: 100,
      });

      expect(storiesService.listStories).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        { status: StoryStatus.BACKLOG, page: 1, perPage: 100 },
      );
    });

    it('should return 200 with priority filter applied', async () => {
      await controller.listStories(mockWorkspaceId, mockProjectId, {
        priority: StoryPriority.HIGH,
        page: 1,
        perPage: 100,
      });

      expect(storiesService.listStories).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        { priority: StoryPriority.HIGH, page: 1, perPage: 100 },
      );
    });
  });

  describe('GET /:storyId (getStory)', () => {
    it('should return 200 with story detail', async () => {
      const result = await controller.getStory(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
      );

      expect(result.id).toBe(mockStoryId);
      expect(result.title).toBe('Kanban Board Component');
      expect(storiesService.getStory).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
      );
    });

    it('should return 404 when not found', async () => {
      storiesService.getStory.mockRejectedValue(new NotFoundException('Story not found'));

      await expect(
        controller.getStory(mockWorkspaceId, mockProjectId, 'invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST / (createStory)', () => {
    it('should return 201 with created story', async () => {
      const createDto = {
        storyKey: '7.1',
        title: 'Kanban Board Component',
        priority: StoryPriority.HIGH,
        tags: ['feature'],
      };

      const result = await controller.createStory(
        mockWorkspaceId,
        mockProjectId,
        createDto,
      );

      expect(result.id).toBe(mockStoryId);
      expect(storiesService.createStory).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        createDto,
      );
    });

    it('should propagate NotFoundException for invalid project', async () => {
      storiesService.createStory.mockRejectedValue(
        new NotFoundException('Project not found'),
      );

      await expect(
        controller.createStory(mockWorkspaceId, 'invalid-project-id', {
          storyKey: '7.1',
          title: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /:storyId (updateStory)', () => {
    it('should return 200 with updated story', async () => {
      const updateDto = {
        title: 'Updated Title',
        priority: StoryPriority.LOW,
      };

      const result = await controller.updateStory(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        updateDto,
      );

      expect(result.id).toBe(mockStoryId);
      expect(storiesService.updateStory).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        updateDto,
      );
    });

    it('should return 404 when story not found', async () => {
      storiesService.updateStory.mockRejectedValue(
        new NotFoundException('Story not found'),
      );

      await expect(
        controller.updateStory(mockWorkspaceId, mockProjectId, 'invalid-id', {
          title: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /:storyId/status (updateStoryStatus)', () => {
    it('should return 200 with updated status', async () => {
      const updatedResponse = {
        ...mockStoryResponse,
        status: StoryStatus.IN_PROGRESS,
      };
      storiesService.updateStoryStatus.mockResolvedValue(updatedResponse);

      const result = await controller.updateStoryStatus(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        { status: StoryStatus.IN_PROGRESS },
      );

      expect(result.status).toBe(StoryStatus.IN_PROGRESS);
      expect(storiesService.updateStoryStatus).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        { status: StoryStatus.IN_PROGRESS },
      );
    });

    it('should return 404 when story not found', async () => {
      storiesService.updateStoryStatus.mockRejectedValue(
        new NotFoundException('Story not found'),
      );

      await expect(
        controller.updateStoryStatus(mockWorkspaceId, mockProjectId, 'invalid-id', {
          status: StoryStatus.IN_PROGRESS,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /:storyId/assign (assignStory)', () => {
    it('should return 200 with assigned agent', async () => {
      const assignedResponse = {
        ...mockStoryResponse,
        assignedAgentId: mockAgentId,
        assignedAgent: {
          id: mockAgentId,
          name: 'Dev Agent',
          type: 'dev',
          status: 'running',
        },
      };
      storiesService.assignStory.mockResolvedValue(assignedResponse);

      const result = await controller.assignStory(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        { assignedAgentId: mockAgentId },
      );

      expect(result.assignedAgentId).toBe(mockAgentId);
      expect(storiesService.assignStory).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        { assignedAgentId: mockAgentId },
      );
    });

    it('should return 200 when unassigning (null)', async () => {
      const unassignedResponse = {
        ...mockStoryResponse,
        assignedAgentId: undefined,
        assignedAgent: undefined,
      };
      storiesService.assignStory.mockResolvedValue(unassignedResponse);

      const result = await controller.assignStory(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        { assignedAgentId: null },
      );

      expect(result.assignedAgentId).toBeUndefined();
      expect(storiesService.assignStory).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
        { assignedAgentId: null },
      );
    });

    it('should return 404 when story not found', async () => {
      storiesService.assignStory.mockRejectedValue(
        new NotFoundException('Story not found'),
      );

      await expect(
        controller.assignStory(mockWorkspaceId, mockProjectId, 'invalid-id', {
          assignedAgentId: mockAgentId,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /:storyId (deleteStory)', () => {
    it('should return 200 on success', async () => {
      const result = await controller.deleteStory(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
      );

      expect(result).toEqual({ message: 'Story deleted successfully' });
      expect(storiesService.deleteStory).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockStoryId,
      );
    });

    it('should return 404 for not found', async () => {
      storiesService.deleteStory.mockRejectedValue(
        new NotFoundException('Story not found'),
      );

      await expect(
        controller.deleteStory(mockWorkspaceId, mockProjectId, 'invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
