import { Test, TestingModule } from '@nestjs/testing';
import { AgentStatusController } from './agent-status.controller';
import { AgentStatusService } from '../services/agent-status.service';
import { Agent, AgentType, AgentStatus } from '../../../database/entities/agent.entity';
import { AgentStatusUpdate } from '../../../database/entities/agent-status-update.entity';
import { AgentActivityStatus, StatusUpdateCategory } from '../enums/agent-activity-status.enum';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';

// Mock the guards
const mockJwtAuthGuard = { canActivate: jest.fn().mockReturnValue(true) };
const mockWorkspaceAccessGuard = { canActivate: jest.fn().mockReturnValue(true) };

describe('AgentStatusController', () => {
  let controller: AgentStatusController;
  let agentStatusService: jest.Mocked<AgentStatusService>;

  const mockAgent: Agent = {
    id: 'agent-1',
    name: 'Dev Agent',
    type: AgentType.DEV,
    status: AgentStatus.RUNNING,
    activityStatus: AgentActivityStatus.CODING,
    activityStatusSince: new Date('2026-02-13T14:30:00Z'),
    activityMessage: 'Working on user-auth.ts',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    createdBy: 'user-1',
    config: null,
    context: null,
    currentTask: null,
    errorMessage: null,
    startedAt: new Date(),
    completedAt: null,
    lastHeartbeat: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    workspace: {} as any,
    project: {} as any,
    creator: {} as any,
  };

  const mockStatusUpdate: AgentStatusUpdate = {
    id: 'status-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    agentId: 'agent-1',
    agentType: AgentType.DEV,
    agentName: 'Dev Agent',
    previousStatus: AgentActivityStatus.IDLE,
    newStatus: AgentActivityStatus.CODING,
    message: 'Started coding',
    category: StatusUpdateCategory.PROGRESS,
    metadata: { file: 'src/auth.ts' },
    postedToChat: false,
    chatMessageId: null,
    createdAt: new Date('2026-02-13T14:30:00Z'),
    workspace: {} as any,
    project: {} as any,
    agent: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentStatusController],
      providers: [
        {
          provide: AgentStatusService,
          useValue: {
            getCurrentStatus: jest.fn(),
            getAgentStatusHistory: jest.fn(),
            getWorkspaceStatusUpdates: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(WorkspaceAccessGuard)
      .useValue(mockWorkspaceAccessGuard)
      .compile();

    controller = module.get<AgentStatusController>(AgentStatusController);
    agentStatusService = module.get(AgentStatusService);
  });

  describe('getAgentStatus', () => {
    it('should return current agent status', async () => {
      agentStatusService.getCurrentStatus.mockResolvedValue({
        currentStatus: {
          activityStatus: AgentActivityStatus.CODING,
          message: 'Working on user-auth.ts',
          since: new Date('2026-02-13T14:30:00Z'),
        },
        agent: mockAgent,
      });

      const result = await controller.getAgentStatus('workspace-1', 'agent-1');

      expect(result.currentStatus.activityStatus).toBe(AgentActivityStatus.CODING);
      expect(result.currentStatus.message).toBe('Working on user-auth.ts');
      expect(result.currentStatus.since).toBe('2026-02-13T14:30:00.000Z');
      expect(result.agent.id).toBe('agent-1');
      expect(result.agent.name).toBe('Dev Agent');
      expect(result.agent.type).toBe(AgentType.DEV);
    });

    it('should handle null activity status', async () => {
      agentStatusService.getCurrentStatus.mockResolvedValue({
        currentStatus: {
          activityStatus: null,
          message: null,
          since: null,
        },
        agent: { ...mockAgent, activityStatus: null },
      });

      const result = await controller.getAgentStatus('workspace-1', 'agent-1');

      expect(result.currentStatus.activityStatus).toBeNull();
      expect(result.currentStatus.message).toBeNull();
      expect(result.currentStatus.since).toBeNull();
    });
  });

  describe('getAgentStatusHistory', () => {
    it('should return paginated status history', async () => {
      agentStatusService.getAgentStatusHistory.mockResolvedValue({
        statusUpdates: [mockStatusUpdate],
        hasMore: false,
        cursor: '2026-02-13T14:30:00.000Z',
      });

      const result = await controller.getAgentStatusHistory(
        'workspace-1',
        'agent-1',
        { limit: 50 },
      );

      expect(result.statusUpdates).toHaveLength(1);
      expect(result.statusUpdates[0].id).toBe('status-1');
      expect(result.statusUpdates[0].newStatus).toBe(AgentActivityStatus.CODING);
      expect(result.statusUpdates[0].metadata).toEqual({ file: 'src/auth.ts' });
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBe('2026-02-13T14:30:00.000Z');
    });

    it('should pass query params to service', async () => {
      agentStatusService.getAgentStatusHistory.mockResolvedValue({
        statusUpdates: [],
        hasMore: false,
      });

      await controller.getAgentStatusHistory(
        'workspace-1',
        'agent-1',
        { limit: 20, before: '2026-02-13T14:00:00.000Z' },
      );

      expect(agentStatusService.getAgentStatusHistory).toHaveBeenCalledWith(
        'agent-1',
        'workspace-1',
        {
          limit: 20,
          before: expect.any(Date),
        },
      );
    });

    it('should handle hasMore flag correctly', async () => {
      agentStatusService.getAgentStatusHistory.mockResolvedValue({
        statusUpdates: Array(50).fill(mockStatusUpdate),
        hasMore: true,
        cursor: '2026-02-13T13:00:00.000Z',
      });

      const result = await controller.getAgentStatusHistory(
        'workspace-1',
        'agent-1',
        { limit: 50 },
      );

      expect(result.statusUpdates).toHaveLength(50);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('getWorkspaceStatusUpdates', () => {
    it('should return workspace status updates', async () => {
      agentStatusService.getWorkspaceStatusUpdates.mockResolvedValue({
        statusUpdates: [mockStatusUpdate],
        hasMore: false,
      });

      const result = await controller.getWorkspaceStatusUpdates(
        'workspace-1',
        {},
      );

      expect(result.statusUpdates).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should pass filter params to service', async () => {
      agentStatusService.getWorkspaceStatusUpdates.mockResolvedValue({
        statusUpdates: [],
        hasMore: false,
      });

      await controller.getWorkspaceStatusUpdates(
        'workspace-1',
        {
          projectId: 'project-1',
          agentId: 'agent-1',
          category: StatusUpdateCategory.ERROR,
          limit: 10,
        },
      );

      expect(agentStatusService.getWorkspaceStatusUpdates).toHaveBeenCalledWith(
        'workspace-1',
        {
          projectId: 'project-1',
          agentId: 'agent-1',
          category: StatusUpdateCategory.ERROR,
          limit: 10,
        },
      );
    });

    it('should omit undefined metadata in response', async () => {
      const statusWithoutMetadata = { ...mockStatusUpdate, metadata: null };
      agentStatusService.getWorkspaceStatusUpdates.mockResolvedValue({
        statusUpdates: [statusWithoutMetadata],
        hasMore: false,
      });

      const result = await controller.getWorkspaceStatusUpdates('workspace-1', {});

      expect(result.statusUpdates[0].metadata).toBeUndefined();
    });
  });
});
