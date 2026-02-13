import { Test, TestingModule } from '@nestjs/testing';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';
import { SprintStatus } from '../../database/entities/sprint.entity';

// Mock guards
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

const mockSprintResponse = {
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
  storyCount: 0,
  completedStoryCount: 0,
  totalPoints: 0,
  completedPoints: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('SprintsController', () => {
  let controller: SprintsController;
  let sprintsService: jest.Mocked<SprintsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SprintsController],
      providers: [
        {
          provide: SprintsService,
          useValue: {
            listSprints: jest.fn(),
            getSprint: jest.fn(),
            createSprint: jest.fn(),
            updateSprint: jest.fn(),
            startSprint: jest.fn(),
            completeSprint: jest.fn(),
            deleteSprint: jest.fn(),
            addStoryToSprint: jest.fn(),
            removeStoryFromSprint: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SprintsController>(SprintsController);
    sprintsService = module.get(SprintsService);
  });

  describe('listSprints', () => {
    it('should return list of sprints', async () => {
      const expected = { sprints: [mockSprintResponse], total: 1 };
      sprintsService.listSprints.mockResolvedValue(expected as any);

      const result = await controller.listSprints('workspace-uuid', 'project-uuid');

      expect(result).toEqual(expected);
      expect(sprintsService.listSprints).toHaveBeenCalledWith('workspace-uuid', 'project-uuid');
    });
  });

  describe('getSprint', () => {
    it('should return a single sprint', async () => {
      sprintsService.getSprint.mockResolvedValue(mockSprintResponse as any);

      const result = await controller.getSprint('workspace-uuid', 'project-uuid', 'sprint-uuid');

      expect(result).toEqual(mockSprintResponse);
      expect(sprintsService.getSprint).toHaveBeenCalledWith(
        'workspace-uuid',
        'project-uuid',
        'sprint-uuid',
      );
    });
  });

  describe('createSprint', () => {
    it('should create and return a sprint', async () => {
      sprintsService.createSprint.mockResolvedValue(mockSprintResponse as any);

      const result = await controller.createSprint('workspace-uuid', 'project-uuid', {
        name: 'Sprint 1',
        goal: 'First sprint',
      });

      expect(result).toEqual(mockSprintResponse);
      expect(sprintsService.createSprint).toHaveBeenCalledWith(
        'workspace-uuid',
        'project-uuid',
        { name: 'Sprint 1', goal: 'First sprint' },
      );
    });
  });

  describe('updateSprint', () => {
    it('should update and return a sprint', async () => {
      sprintsService.updateSprint.mockResolvedValue(mockSprintResponse as any);

      const result = await controller.updateSprint(
        'workspace-uuid',
        'project-uuid',
        'sprint-uuid',
        { name: 'Updated' },
      );

      expect(result).toEqual(mockSprintResponse);
    });
  });

  describe('startSprint', () => {
    it('should start a sprint', async () => {
      const startedSprint = { ...mockSprintResponse, status: SprintStatus.ACTIVE };
      sprintsService.startSprint.mockResolvedValue(startedSprint as any);

      const result = await controller.startSprint(
        'workspace-uuid',
        'project-uuid',
        'sprint-uuid',
        { startDate: '2026-02-01', endDate: '2026-02-14' },
      );

      expect(result.status).toBe(SprintStatus.ACTIVE);
    });
  });

  describe('completeSprint', () => {
    it('should complete a sprint', async () => {
      const completedSprint = { ...mockSprintResponse, status: SprintStatus.COMPLETED };
      sprintsService.completeSprint.mockResolvedValue(completedSprint as any);

      const result = await controller.completeSprint(
        'workspace-uuid',
        'project-uuid',
        'sprint-uuid',
      );

      expect(result.status).toBe(SprintStatus.COMPLETED);
    });
  });

  describe('deleteSprint', () => {
    it('should delete a sprint and return message', async () => {
      sprintsService.deleteSprint.mockResolvedValue(undefined);

      const result = await controller.deleteSprint(
        'workspace-uuid',
        'project-uuid',
        'sprint-uuid',
      );

      expect(result).toEqual({ message: 'Sprint deleted successfully' });
    });
  });

  describe('addStoryToSprint', () => {
    it('should add story and return sprint', async () => {
      sprintsService.addStoryToSprint.mockResolvedValue(mockSprintResponse as any);

      const result = await controller.addStoryToSprint(
        'workspace-uuid',
        'project-uuid',
        'sprint-uuid',
        { storyId: 'story-uuid' },
      );

      expect(result).toEqual(mockSprintResponse);
      expect(sprintsService.addStoryToSprint).toHaveBeenCalledWith(
        'workspace-uuid',
        'project-uuid',
        'sprint-uuid',
        'story-uuid',
      );
    });
  });

  describe('removeStoryFromSprint', () => {
    it('should remove story and return sprint', async () => {
      sprintsService.removeStoryFromSprint.mockResolvedValue(mockSprintResponse as any);

      const result = await controller.removeStoryFromSprint(
        'workspace-uuid',
        'project-uuid',
        'sprint-uuid',
        'story-uuid',
      );

      expect(result).toEqual(mockSprintResponse);
      expect(sprintsService.removeStoryFromSprint).toHaveBeenCalledWith(
        'workspace-uuid',
        'project-uuid',
        'sprint-uuid',
        'story-uuid',
      );
    });
  });
});
