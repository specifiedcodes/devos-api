import { Test, TestingModule } from '@nestjs/testing';
import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: DashboardService;

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';

  const mockDashboardService = {
    getDashboardStats: jest.fn(),
    getActivityFeed: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: mockDashboardService,
        },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboardStats', () => {
    it('should return dashboard stats for workspace', async () => {
      const mockStats = {
        activeProject: {
          id: 'project-1',
          name: 'Test Project',
          sprintProgress: 75,
        },
        agentStats: [
          {
            id: 'agent-1',
            name: 'Dev Agent',
            type: 'dev',
            status: 'running',
            currentTask: 'Implement feature X',
          },
        ],
        quickStats: {
          storiesCompletedToday: 5,
          deployments: 2,
          costs: 15.5,
        },
      };

      mockDashboardService.getDashboardStats.mockResolvedValue(mockStats);

      const result = await controller.getDashboardStats(mockWorkspaceId);

      expect(service.getDashboardStats).toHaveBeenCalledWith(mockWorkspaceId);
      expect(result).toEqual(mockStats);
    });
  });

  describe('getActivityFeed', () => {
    it('should return activity feed for workspace', async () => {
      const mockActivityFeed = [
        {
          id: 'activity-1',
          type: 'agent_task_completed',
          message: 'Dev Agent completed task: Implement feature X',
          timestamp: new Date().toISOString(),
          metadata: {
            agentId: 'agent-1',
            agentName: 'Dev Agent',
            taskId: 'task-1',
          },
        },
      ];

      mockDashboardService.getActivityFeed.mockResolvedValue(mockActivityFeed);

      const result = await controller.getActivityFeed(mockWorkspaceId, 20);

      expect(service.getActivityFeed).toHaveBeenCalledWith(mockWorkspaceId, 20);
      expect(result).toEqual(mockActivityFeed);
    });

    it('should respect limit parameter', async () => {
      const limit = 10;
      mockDashboardService.getActivityFeed.mockResolvedValue([]);

      await controller.getActivityFeed(mockWorkspaceId, limit);

      expect(service.getActivityFeed).toHaveBeenCalledWith(mockWorkspaceId, limit);
    });

    it('should clamp limit to valid range', async () => {
      mockDashboardService.getActivityFeed.mockResolvedValue([]);

      await controller.getActivityFeed(mockWorkspaceId, 150);

      expect(service.getActivityFeed).toHaveBeenCalledWith(mockWorkspaceId, 100);
    });
  });
});
