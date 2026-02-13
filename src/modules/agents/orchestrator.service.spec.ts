import { Test, TestingModule } from '@nestjs/testing';
import { OrchestratorService } from './orchestrator.service';
import { AgentsService } from './agents.service';
import { DevAgentService } from './implementations/dev-agent.service';
import { PlannerAgentService } from './implementations/planner-agent.service';
import { QAAgentService } from './implementations/qa-agent.service';
import { DevOpsAgentService } from './implementations/devops-agent.service';
import { ContextRecoveryService } from './context-recovery.service';
import { AgentType, AgentStatus } from '../../database/entities/agent.entity';
import {
  WorkflowPhase,
  OrchestratorTask,
} from './interfaces/orchestrator.interfaces';

describe('OrchestratorService', () => {
  let service: OrchestratorService;
  let mockAgentsService: any;
  let mockDevAgentService: any;
  let mockPlannerAgentService: any;
  let mockQaAgentService: any;
  let mockDevOpsAgentService: any;
  let mockContextRecoveryService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockProjectId = '44444444-4444-4444-4444-444444444444';

  let agentIdCounter: number;

  const createMockAgent = (type: AgentType, overrides = {}) => {
    agentIdCounter++;
    return {
      id: `agent-${type}-${agentIdCounter}`,
      name: `${type} agent`,
      type,
      status: AgentStatus.RUNNING,
      workspaceId: mockWorkspaceId,
      createdBy: mockUserId,
      ...overrides,
    };
  };

  const createMockTask = (
    type: string,
    overrides: Partial<OrchestratorTask> = {},
  ): OrchestratorTask => ({
    id: 'task-1',
    type: type as OrchestratorTask['type'],
    description: `Test ${type} task`,
    workspaceId: mockWorkspaceId,
    userId: mockUserId,
    ...overrides,
  });

  const mockPlanResult = {
    status: 'plan_created',
    description: 'Test plan',
    plan: { summary: 'Plan', phases: [], milestones: [] },
    risks: [],
    estimatedEffort: '2 sprints',
    summary: 'Plan created',
    tokensUsed: { input: 100, output: 200 },
  };

  const mockImplementationResult = {
    status: 'implemented',
    storyId: 'story-1',
    plan: 'Implementation plan',
    filesGenerated: ['src/test.ts', 'src/test.spec.ts'],
    codeBlocks: [],
    testsGenerated: true,
    summary: 'Implementation complete',
    tokensUsed: { input: 100, output: 200 },
  };

  const mockFixResult = {
    status: 'fixed',
    description: 'Bug fix',
    rootCause: 'Null pointer',
    fix: 'Added null check',
    filesModified: ['src/buggy.ts'],
    codeChanges: [],
    testsAdded: true,
    tokensUsed: { input: 100, output: 200 },
  };

  const mockQaPassResult = {
    status: 'tests_completed',
    storyId: 'story-1',
    testResults: [],
    passed: 10,
    failed: 0,
    skipped: 0,
    coverageEstimate: 85,
    recommendations: [],
    summary: 'All tests passed',
    tokensUsed: { input: 100, output: 200 },
  };

  const mockQaFailResult = {
    status: 'tests_completed',
    storyId: 'story-1',
    testResults: [
      {
        file: 'src/test.spec.ts',
        testName: 'should work',
        status: 'fail',
        message: 'Expected true, got false',
      },
    ],
    passed: 8,
    failed: 2,
    skipped: 0,
    coverageEstimate: 70,
    recommendations: ['Fix failing tests'],
    summary: '2 tests failed',
    tokensUsed: { input: 100, output: 200 },
  };

  const mockDeployPassResult = {
    status: 'deployment_completed',
    environment: 'production',
    deploymentId: 'deploy-1',
    steps: [],
    deploymentUrl: 'https://app.example.com',
    smokeTestsPassed: true,
    rollbackAvailable: true,
    summary: 'Deployed successfully',
    tokensUsed: { input: 100, output: 200 },
  };

  const mockDeployFailResult = {
    status: 'deployment_completed',
    environment: 'production',
    deploymentId: 'deploy-1',
    steps: [],
    deploymentUrl: 'https://app.example.com',
    smokeTestsPassed: false,
    rollbackAvailable: true,
    summary: 'Deployment failed smoke tests',
    tokensUsed: { input: 100, output: 200 },
  };

  const mockRollbackResult = {
    status: 'rollback_completed',
    environment: 'production',
    previousDeploymentId: 'deploy-1',
    rollbackSteps: [],
    verificationPassed: true,
    incidentReport: {
      cause: 'Smoke test failure',
      impact: 'No production impact',
      resolution: 'Rolled back',
      preventionMeasures: [],
    },
    summary: 'Rollback completed',
    tokensUsed: { input: 100, output: 200 },
  };

  beforeEach(async () => {
    agentIdCounter = 0;

    mockAgentsService = {
      createAgent: jest.fn().mockImplementation((dto: any) => {
        return Promise.resolve(createMockAgent(dto.type));
      }),
      getAgent: jest.fn().mockImplementation((_id: string, _ws: string) => {
        return Promise.resolve(createMockAgent(AgentType.DEV));
      }),
      listAgents: jest.fn().mockResolvedValue({ agents: [], total: 0 }),
      terminateAgent: jest.fn().mockResolvedValue(undefined),
    };

    mockDevAgentService = {
      executeTask: jest.fn().mockResolvedValue(mockImplementationResult),
    };

    mockPlannerAgentService = {
      executeTask: jest.fn().mockResolvedValue(mockPlanResult),
    };

    mockQaAgentService = {
      executeTask: jest.fn().mockResolvedValue(mockQaPassResult),
    };

    mockDevOpsAgentService = {
      executeTask: jest.fn().mockResolvedValue(mockDeployPassResult),
    };

    mockContextRecoveryService = {
      saveContext: jest.fn().mockResolvedValue(undefined),
      recoverContext: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        { provide: AgentsService, useValue: mockAgentsService },
        { provide: DevAgentService, useValue: mockDevAgentService },
        { provide: PlannerAgentService, useValue: mockPlannerAgentService },
        { provide: QAAgentService, useValue: mockQaAgentService },
        { provide: DevOpsAgentService, useValue: mockDevOpsAgentService },
        { provide: ContextRecoveryService, useValue: mockContextRecoveryService },
      ],
    }).compile();

    service = module.get<OrchestratorService>(OrchestratorService);
    jest.clearAllMocks();
    // Reset counter after module creation
    agentIdCounter = 0;
  });

  // ===== Task Routing Tests =====

  describe('executeTask routing', () => {
    it('should route implement-feature to implementFeature handler', async () => {
      const task = createMockTask('implement-feature');
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      expect(mockPlannerAgentService.executeTask).toHaveBeenCalled();
      expect(mockDevAgentService.executeTask).toHaveBeenCalled();
      expect(mockQaAgentService.executeTask).toHaveBeenCalled();
    });

    it('should route fix-bug to fixBug handler', async () => {
      const task = createMockTask('fix-bug');
      mockDevAgentService.executeTask.mockResolvedValue(mockFixResult);
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      expect(mockDevAgentService.executeTask).toHaveBeenCalled();
      expect(mockQaAgentService.executeTask).toHaveBeenCalled();
      expect(mockPlannerAgentService.executeTask).not.toHaveBeenCalled();
    });

    it('should route deploy to deploy handler', async () => {
      const task = createMockTask('deploy');
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      expect(mockDevOpsAgentService.executeTask).toHaveBeenCalled();
      expect(mockPlannerAgentService.executeTask).not.toHaveBeenCalled();
    });

    it('should route full-lifecycle to fullLifecycle handler', async () => {
      const task = createMockTask('full-lifecycle');
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      expect(mockPlannerAgentService.executeTask).toHaveBeenCalled();
      expect(mockDevAgentService.executeTask).toHaveBeenCalled();
      expect(mockQaAgentService.executeTask).toHaveBeenCalled();
      expect(mockDevOpsAgentService.executeTask).toHaveBeenCalled();
    });

    it('should throw error for unknown task type', async () => {
      const task = createMockTask('unknown-type' as any);

      await expect(service.executeTask(task)).rejects.toThrow(
        'Unknown task type: unknown-type',
      );
    });
  });

  // ===== Implement Feature Tests =====

  describe('implementFeature', () => {
    it('should create planner agent and call plannerAgent.executeTask', async () => {
      const task = createMockTask('implement-feature');
      await service.executeTask(task);

      expect(mockAgentsService.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AgentType.PLANNER,
          workspaceId: mockWorkspaceId,
          createdBy: mockUserId,
        }),
      );
      expect(mockPlannerAgentService.executeTask).toHaveBeenCalledWith(
        expect.objectContaining({ type: AgentType.PLANNER }),
        expect.objectContaining({ type: 'create-plan' }),
      );
    });

    it('should create dev agent after planner completes with plan in config', async () => {
      const task = createMockTask('implement-feature');
      await service.executeTask(task);

      // Dev agent should receive plan in config
      const devCreateCall = mockAgentsService.createAgent.mock.calls.find(
        (call: any[]) => call[0].type === AgentType.DEV,
      );
      expect(devCreateCall).toBeDefined();
      expect(devCreateCall[0].config).toEqual(
        expect.objectContaining({ plan: mockPlanResult }),
      );
    });

    it('should create QA agent after dev completes with implementation files', async () => {
      const task = createMockTask('implement-feature');
      await service.executeTask(task);

      // QA agent should receive implementation in config
      const qaCreateCall = mockAgentsService.createAgent.mock.calls.find(
        (call: any[]) => call[0].type === AgentType.QA,
      );
      expect(qaCreateCall).toBeDefined();
      expect(qaCreateCall[0].config).toEqual(
        expect.objectContaining({ implementation: mockImplementationResult }),
      );

      // QA task should have files from implementation
      expect(mockQaAgentService.executeTask).toHaveBeenCalledWith(
        expect.objectContaining({ type: AgentType.QA }),
        expect.objectContaining({
          type: 'run-tests',
          files: mockImplementationResult.filesGenerated,
        }),
      );
    });

    it('should return workflow result with all phase results and agent IDs', async () => {
      const task = createMockTask('implement-feature');
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.phaseResults.planning).toEqual(mockPlanResult);
      expect(result.phaseResults.implementation).toEqual(mockImplementationResult);
      expect(result.phaseResults.qa).toEqual(mockQaPassResult);
      expect(result.agents.planner).toBeDefined();
      expect(result.agents.dev).toBeDefined();
      expect(result.agents.qa).toBeDefined();
    });

    it('should set workflow phase through PLANNING -> IMPLEMENTATION -> QA -> COMPLETED', async () => {
      const task = createMockTask('implement-feature');
      const result = await service.executeTask(task);

      expect(result.workflowState.phase).toBe(WorkflowPhase.COMPLETED);
      expect(result.workflowState.completedAt).toBeDefined();
    });

    it('should retry implementation when QA fails (up to maxRetries)', async () => {
      // QA fails first time, then succeeds
      mockQaAgentService.executeTask
        .mockResolvedValueOnce(mockQaFailResult)
        .mockResolvedValueOnce(mockQaPassResult);

      const task = createMockTask('implement-feature', {
        config: { maxRetries: 2 },
      });
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      // Dev should be called twice (original + 1 retry)
      expect(mockDevAgentService.executeTask).toHaveBeenCalledTimes(2);
      // QA should be called twice
      expect(mockQaAgentService.executeTask).toHaveBeenCalledTimes(2);
    });

    it('should mark workflow FAILED when QA fails after all retries', async () => {
      // QA always fails
      mockQaAgentService.executeTask.mockResolvedValue(mockQaFailResult);

      const task = createMockTask('implement-feature', {
        config: { maxRetries: 1 },
      });
      const result = await service.executeTask(task);

      expect(result.status).toBe('failed');
      expect(result.workflowState.phase).toBe(WorkflowPhase.FAILED);
      expect(result.workflowState.error).toContain('QA failed after');
      // Dev called: original + 1 retry = 2 times (retryCount exceeds maxRetries at 2 > 1)
      expect(mockDevAgentService.executeTask).toHaveBeenCalledTimes(2);
      expect(mockQaAgentService.executeTask).toHaveBeenCalledTimes(2);
    });

    it('should emit workflow events (started, phase.started, phase.completed, completed)', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      const task = createMockTask('implement-feature');
      await service.executeTask(task);

      const logCalls = logSpy.mock.calls.map((c) => c[0] as string);

      // Check for workflow events
      expect(logCalls.some((msg) => msg.includes('workflow.started'))).toBe(true);
      expect(logCalls.some((msg) => msg.includes('workflow.phase.started'))).toBe(true);
      expect(logCalls.some((msg) => msg.includes('workflow.phase.completed'))).toBe(true);
      expect(logCalls.some((msg) => msg.includes('workflow.completed'))).toBe(true);
    });

    it('should save agent context after each phase via ContextRecoveryService', async () => {
      const task = createMockTask('implement-feature');
      await service.executeTask(task);

      // Context saved for planner and dev agents
      expect(mockContextRecoveryService.saveContext).toHaveBeenCalledTimes(2);
      expect(mockContextRecoveryService.saveContext).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          phase: WorkflowPhase.PLANNING,
          result: mockPlanResult,
        }),
      );
      expect(mockContextRecoveryService.saveContext).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          phase: WorkflowPhase.IMPLEMENTATION,
          result: mockImplementationResult,
        }),
      );
    });
  });

  // ===== Fix Bug Tests =====

  describe('fixBug', () => {
    beforeEach(() => {
      mockDevAgentService.executeTask.mockResolvedValue(mockFixResult);
    });

    it('should create dev agent with fix-bug task', async () => {
      const task = createMockTask('fix-bug');
      await service.executeTask(task);

      expect(mockAgentsService.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AgentType.DEV,
          workspaceId: mockWorkspaceId,
        }),
      );
      expect(mockDevAgentService.executeTask).toHaveBeenCalledWith(
        expect.objectContaining({ type: AgentType.DEV }),
        expect.objectContaining({ type: 'fix-bug' }),
      );
    });

    it('should create QA agent after dev with modified files', async () => {
      const task = createMockTask('fix-bug');
      await service.executeTask(task);

      expect(mockQaAgentService.executeTask).toHaveBeenCalledWith(
        expect.objectContaining({ type: AgentType.QA }),
        expect.objectContaining({
          type: 'run-tests',
          files: mockFixResult.filesModified,
        }),
      );
    });

    it('should return workflow result with fix and verification details', async () => {
      const task = createMockTask('fix-bug');
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.phaseResults.implementation).toEqual(mockFixResult);
      expect(result.phaseResults.qa).toEqual(mockQaPassResult);
      expect(result.agents.dev).toBeDefined();
      expect(result.agents.qa).toBeDefined();
    });

    it('should retry dev fix when QA verification fails', async () => {
      mockQaAgentService.executeTask
        .mockResolvedValueOnce(mockQaFailResult)
        .mockResolvedValueOnce(mockQaPassResult);

      const task = createMockTask('fix-bug', {
        config: { maxRetries: 2 },
      });
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      expect(mockDevAgentService.executeTask).toHaveBeenCalledTimes(2);
      expect(mockQaAgentService.executeTask).toHaveBeenCalledTimes(2);
    });

    it('should mark workflow FAILED when QA verification fails after all retries', async () => {
      mockQaAgentService.executeTask.mockResolvedValue(mockQaFailResult);

      const task = createMockTask('fix-bug', {
        config: { maxRetries: 0 },
      });
      const result = await service.executeTask(task);

      expect(result.status).toBe('failed');
      expect(result.workflowState.phase).toBe(WorkflowPhase.FAILED);
      expect(result.workflowState.error).toContain('QA verification failed');
    });
  });

  // ===== Deploy Tests =====

  describe('deploy', () => {
    it('should create devops agent with deploy task', async () => {
      const task = createMockTask('deploy', {
        config: { environment: 'staging' },
      });
      await service.executeTask(task);

      expect(mockAgentsService.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AgentType.DEVOPS,
          workspaceId: mockWorkspaceId,
        }),
      );
      expect(mockDevOpsAgentService.executeTask).toHaveBeenCalledWith(
        expect.objectContaining({ type: AgentType.DEVOPS }),
        expect.objectContaining({
          type: 'deploy',
          environment: 'staging',
        }),
      );
    });

    it('should return workflow result with deployment details on success', async () => {
      const task = createMockTask('deploy');
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.phaseResults.deployment).toEqual(mockDeployPassResult);
      expect(result.agents.devops).toBeDefined();
      expect(result.workflowState.phase).toBe(WorkflowPhase.COMPLETED);
    });

    it('should trigger rollback when smoke tests fail', async () => {
      mockDevOpsAgentService.executeTask
        .mockResolvedValueOnce(mockDeployFailResult)
        .mockResolvedValueOnce(mockRollbackResult);

      const task = createMockTask('deploy');
      const result = await service.executeTask(task);

      expect(result.status).toBe('failed');
      expect(result.phaseResults.rollback).toEqual(mockRollbackResult);
      expect(result.workflowState.error).toContain('smoke tests failed');
      // Deploy called once, then rollback called once
      expect(mockDevOpsAgentService.executeTask).toHaveBeenCalledTimes(2);
      expect(mockDevOpsAgentService.executeTask).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'rollback' }),
      );
    });

    it('should mark workflow COMPLETED when smoke tests pass', async () => {
      const task = createMockTask('deploy');
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.workflowState.phase).toBe(WorkflowPhase.COMPLETED);
      expect(result.workflowState.completedAt).toBeDefined();
    });
  });

  // ===== Full Lifecycle Tests =====

  describe('fullLifecycle', () => {
    it('should chain planning -> implementation -> qa -> deployment phases', async () => {
      const task = createMockTask('full-lifecycle');
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      expect(mockPlannerAgentService.executeTask).toHaveBeenCalledTimes(1);
      expect(mockDevAgentService.executeTask).toHaveBeenCalledTimes(1);
      expect(mockQaAgentService.executeTask).toHaveBeenCalledTimes(1);
      expect(mockDevOpsAgentService.executeTask).toHaveBeenCalledTimes(1);

      // All phases have results
      expect(result.phaseResults.planning).toBeDefined();
      expect(result.phaseResults.implementation).toBeDefined();
      expect(result.phaseResults.qa).toBeDefined();
      expect(result.phaseResults.deployment).toBeDefined();
    });

    it('should pass planner output to dev, dev output to QA', async () => {
      const task = createMockTask('full-lifecycle');
      await service.executeTask(task);

      // Dev agent created with plan in config
      const devCreateCall = mockAgentsService.createAgent.mock.calls.find(
        (call: any[]) => call[0].type === AgentType.DEV,
      );
      expect(devCreateCall[0].config).toEqual(
        expect.objectContaining({ plan: mockPlanResult }),
      );

      // QA agent created with implementation in config
      const qaCreateCall = mockAgentsService.createAgent.mock.calls.find(
        (call: any[]) => call[0].type === AgentType.QA,
      );
      expect(qaCreateCall[0].config).toEqual(
        expect.objectContaining({ implementation: mockImplementationResult }),
      );
    });

    it('should mark workflow FAILED if any phase fails after retries', async () => {
      // QA always fails
      mockQaAgentService.executeTask.mockResolvedValue(mockQaFailResult);

      const task = createMockTask('full-lifecycle', {
        config: { maxRetries: 0 },
      });
      const result = await service.executeTask(task);

      expect(result.status).toBe('failed');
      expect(result.workflowState.phase).toBe(WorkflowPhase.FAILED);
      // DevOps should never be called since QA failed
      expect(mockDevOpsAgentService.executeTask).not.toHaveBeenCalled();
    });

    it('should fail if deployment smoke tests fail (with rollback)', async () => {
      mockDevOpsAgentService.executeTask
        .mockResolvedValueOnce(mockDeployFailResult)
        .mockResolvedValueOnce(mockRollbackResult);

      const task = createMockTask('full-lifecycle');
      const result = await service.executeTask(task);

      expect(result.status).toBe('failed');
      expect(result.phaseResults.rollback).toBeDefined();
      expect(result.workflowState.error).toContain('smoke tests failed');
    });

    it('should log approval gate for semi-autonomous mode', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      const task = createMockTask('full-lifecycle', {
        autonomyMode: 'semi',
        approvalGates: ['deployment'],
      });
      await service.executeTask(task);

      const logCalls = logSpy.mock.calls.map((c) => c[0] as string);
      expect(
        logCalls.some((msg) => msg.includes('Approval gate') && msg.includes('deployment')),
      ).toBe(true);
    });
  });

  // ===== Monitor Agents Tests =====

  describe('monitorAgents', () => {
    it('should return categorized agents (active, completed, failed)', async () => {
      const runningAgent = createMockAgent(AgentType.DEV, {
        status: AgentStatus.RUNNING,
      });
      const completedAgent = createMockAgent(AgentType.QA, {
        status: AgentStatus.COMPLETED,
      });
      const failedAgent = createMockAgent(AgentType.PLANNER, {
        status: AgentStatus.FAILED,
      });

      mockAgentsService.listAgents.mockResolvedValue({
        agents: [runningAgent, completedAgent, failedAgent],
        total: 3,
      });

      const result = await service.monitorAgents(mockWorkspaceId);

      expect(result.active).toHaveLength(1);
      expect(result.active[0].type).toBe(AgentType.DEV);
      expect(result.completed).toHaveLength(1);
      expect(result.completed[0].type).toBe(AgentType.QA);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].type).toBe(AgentType.PLANNER);
    });

    it('should filter agents by workspace', async () => {
      mockAgentsService.listAgents.mockResolvedValue({
        agents: [],
        total: 0,
      });

      await service.monitorAgents(mockWorkspaceId);

      expect(mockAgentsService.listAgents).toHaveBeenCalledWith(
        mockWorkspaceId,
        expect.objectContaining({ limit: 1000 }),
      );
    });
  });

  // ===== Workflow Management Tests =====

  describe('workflow management', () => {
    it('getWorkflowStatus should return workflow state by ID', async () => {
      const task = createMockTask('implement-feature');
      const result = await service.executeTask(task);

      const status = service.getWorkflowStatus(result.workflowState.id);

      expect(status).toBeDefined();
      expect(status!.id).toBe(result.workflowState.id);
      expect(status!.phase).toBe(WorkflowPhase.COMPLETED);
    });

    it('getWorkflowStatus should return null for non-existent workflow', () => {
      const status = service.getWorkflowStatus('non-existent-id');

      expect(status).toBeNull();
    });

    it('getActiveWorkflows should return only active workflows for workspace', async () => {
      // Create a completed workflow
      const task1 = createMockTask('deploy');
      await service.executeTask(task1);

      // Create an in-progress workflow by making QA fail always
      mockQaAgentService.executeTask.mockResolvedValue(mockQaFailResult);
      const task2 = createMockTask('implement-feature', {
        id: 'task-2',
        config: { maxRetries: 0 },
      });
      await service.executeTask(task2);

      const activeWorkflows = service.getActiveWorkflows(mockWorkspaceId);

      // Both are terminal (completed/failed), so no active workflows
      expect(activeWorkflows).toHaveLength(0);
    });

    it('cancelWorkflow should terminate active agents and mark workflow failed', async () => {
      // We need a workflow to cancel. Let's create one and get its ID.
      // Instead of running a full workflow, we'll create a workflow state directly
      const task = createMockTask('implement-feature');

      // Create the workflow state manually through createWorkflowState
      const workflowState = service.createWorkflowState(task);
      workflowState.agents.dev = 'dev-agent-1';
      workflowState.agents.qa = 'qa-agent-1';

      const result = await service.cancelWorkflow(workflowState.id);

      expect(result.cancelled).toBe(true);
      expect(mockAgentsService.terminateAgent).toHaveBeenCalledTimes(2);

      const status = service.getWorkflowStatus(workflowState.id);
      expect(status!.phase).toBe(WorkflowPhase.FAILED);
      expect(status!.error).toBe('Workflow cancelled');
    });

    it('cancelWorkflow should return cancelled: false for non-existent workflow', async () => {
      const result = await service.cancelWorkflow('non-existent-id');

      expect(result.cancelled).toBe(false);
    });

    it('cancelWorkflow should handle agent termination failures gracefully', async () => {
      mockAgentsService.terminateAgent.mockRejectedValue(
        new Error('Agent already terminated'),
      );

      const task = createMockTask('implement-feature');
      const workflowState = service.createWorkflowState(task);
      workflowState.agents.dev = 'dev-agent-1';

      const result = await service.cancelWorkflow(workflowState.id);

      expect(result.cancelled).toBe(true);
      // Should still mark as failed despite agent termination error
      const status = service.getWorkflowStatus(workflowState.id);
      expect(status!.phase).toBe(WorkflowPhase.FAILED);
    });
  });

  // ===== Workflow Event Logging Tests =====

  describe('workflow event logging', () => {
    it('should log workflow.started when executeTask begins', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      const task = createMockTask('implement-feature');
      await service.executeTask(task);

      const logCalls = logSpy.mock.calls.map((c) => c[0] as string);
      expect(logCalls.some((msg) => msg.includes('workflow.started'))).toBe(true);
    });

    it('should log workflow.phase.started for each phase', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      const task = createMockTask('implement-feature');
      await service.executeTask(task);

      const logCalls = logSpy.mock.calls.map((c) => c[0] as string);
      const phaseStartedLogs = logCalls.filter((msg) =>
        msg.includes('workflow.phase.started'),
      );

      // Should have at least 3 phase.started events: planning, implementation, qa
      expect(phaseStartedLogs.length).toBeGreaterThanOrEqual(3);
    });

    it('should log workflow.completed on success', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      const task = createMockTask('implement-feature');
      await service.executeTask(task);

      const logCalls = logSpy.mock.calls.map((c) => c[0] as string);
      expect(logCalls.some((msg) => msg.includes('workflow.completed'))).toBe(true);
    });

    it('should log workflow.failed on final failure', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      mockQaAgentService.executeTask.mockResolvedValue(mockQaFailResult);

      const task = createMockTask('implement-feature', {
        config: { maxRetries: 0 },
      });
      await service.executeTask(task);

      const logCalls = logSpy.mock.calls.map((c) => c[0] as string);
      expect(logCalls.some((msg) => msg.includes('workflow.failed'))).toBe(true);
    });

    it('should log workflow.agent.spawned when agent is created', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      const task = createMockTask('implement-feature');
      await service.executeTask(task);

      const logCalls = logSpy.mock.calls.map((c) => c[0] as string);
      const agentSpawnedLogs = logCalls.filter((msg) =>
        msg.includes('workflow.agent.spawned'),
      );

      // At least 3 agents spawned: planner, dev, qa
      expect(agentSpawnedLogs.length).toBeGreaterThanOrEqual(3);
    });

    it('should log workflow.agent.completed when agent finishes', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      const task = createMockTask('implement-feature');
      await service.executeTask(task);

      const logCalls = logSpy.mock.calls.map((c) => c[0] as string);
      const agentCompletedLogs = logCalls.filter((msg) =>
        msg.includes('workflow.agent.completed'),
      );

      // At least 3 agents completed: planner, dev, qa
      expect(agentCompletedLogs.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ===== Context Recovery Tests =====

  describe('context recovery integration', () => {
    it('should save agent context before phase transitions', async () => {
      const task = createMockTask('implement-feature');
      await service.executeTask(task);

      // Planner context saved, dev context saved
      expect(mockContextRecoveryService.saveContext).toHaveBeenCalledTimes(2);

      // Verify planner context save
      const plannerSaveCall = mockContextRecoveryService.saveContext.mock.calls[0];
      expect(plannerSaveCall[1]).toEqual(
        expect.objectContaining({
          phase: WorkflowPhase.PLANNING,
          result: mockPlanResult,
        }),
      );

      // Verify dev context save
      const devSaveCall = mockContextRecoveryService.saveContext.mock.calls[1];
      expect(devSaveCall[1]).toEqual(
        expect.objectContaining({
          phase: WorkflowPhase.IMPLEMENTATION,
          result: mockImplementationResult,
        }),
      );
    });

    it('should recover agent context when retrying after failure', async () => {
      const recoveredContext = {
        phase: 'implementation',
        result: { partial: true },
      };
      mockContextRecoveryService.recoverContext.mockResolvedValue(recoveredContext);

      mockQaAgentService.executeTask
        .mockResolvedValueOnce(mockQaFailResult)
        .mockResolvedValueOnce(mockQaPassResult);

      const task = createMockTask('implement-feature', {
        config: { maxRetries: 2 },
      });
      await service.executeTask(task);

      // Recovery attempted on retry
      expect(mockContextRecoveryService.recoverContext).toHaveBeenCalled();

      // Verify dev agent on retry was created with recovered context
      const devCreateCalls = mockAgentsService.createAgent.mock.calls.filter(
        (call: any[]) => call[0].type === AgentType.DEV,
      );
      // Second dev create call should have recoveredContext
      expect(devCreateCalls.length).toBe(2);
      expect(devCreateCalls[1][0].config).toEqual(
        expect.objectContaining({
          recoveredContext: recoveredContext,
        }),
      );
    });

    it('should gracefully handle context save failure (does not break workflow)', async () => {
      mockContextRecoveryService.saveContext.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      const task = createMockTask('implement-feature');
      const result = await service.executeTask(task);

      // Workflow should complete despite context save failure
      expect(result.status).toBe('completed');
      expect(mockContextRecoveryService.saveContext).toHaveBeenCalled();
    });

    it('should gracefully handle context recovery failure', async () => {
      mockContextRecoveryService.recoverContext.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      mockQaAgentService.executeTask
        .mockResolvedValueOnce(mockQaFailResult)
        .mockResolvedValueOnce(mockQaPassResult);

      const task = createMockTask('implement-feature', {
        config: { maxRetries: 2 },
      });
      const result = await service.executeTask(task);

      // Workflow should complete despite context recovery failure
      expect(result.status).toBe('completed');
    });
  });

  // ===== Workflow State Creation Tests =====

  describe('createWorkflowState', () => {
    it('should create workflow state with unique ID', () => {
      const task = createMockTask('implement-feature');

      const state1 = service.createWorkflowState(task);
      const state2 = service.createWorkflowState(task);

      expect(state1.id).toBeDefined();
      expect(state2.id).toBeDefined();
      expect(state1.id).not.toBe(state2.id);
    });

    it('should set default autonomy mode and retry settings', () => {
      const task = createMockTask('implement-feature');
      const state = service.createWorkflowState(task);

      expect(state.autonomyMode).toBe('full');
      expect(state.maxRetries).toBe(2);
      expect(state.retryCount).toBe(0);
      expect(state.approvalGates).toEqual([]);
      expect(state.agentHistory).toEqual([]);
    });

    it('should respect custom autonomy mode and approval gates', () => {
      const task = createMockTask('implement-feature', {
        autonomyMode: 'semi',
        approvalGates: ['deployment'],
        config: { maxRetries: 5 },
      });
      const state = service.createWorkflowState(task);

      expect(state.autonomyMode).toBe('semi');
      expect(state.approvalGates).toEqual(['deployment']);
      expect(state.maxRetries).toBe(5);
    });
  });

  // ===== Error Handling Tests =====

  describe('error handling', () => {
    it('should catch and wrap errors in implementFeature', async () => {
      mockPlannerAgentService.executeTask.mockRejectedValue(
        new Error('Planner service unavailable'),
      );

      const task = createMockTask('implement-feature');
      const result = await service.executeTask(task);

      expect(result.status).toBe('failed');
      expect(result.workflowState.phase).toBe(WorkflowPhase.FAILED);
      expect(result.workflowState.error).toBe('Planner service unavailable');
    });

    it('should catch and wrap errors in fixBug', async () => {
      mockDevAgentService.executeTask.mockRejectedValue(
        new Error('Dev agent crashed'),
      );

      const task = createMockTask('fix-bug');
      const result = await service.executeTask(task);

      expect(result.status).toBe('failed');
      expect(result.workflowState.error).toBe('Dev agent crashed');
    });

    it('should catch and wrap errors in deploy', async () => {
      mockDevOpsAgentService.executeTask.mockRejectedValue(
        new Error('Deployment infrastructure unavailable'),
      );

      const task = createMockTask('deploy');
      const result = await service.executeTask(task);

      expect(result.status).toBe('failed');
      expect(result.workflowState.error).toBe('Deployment infrastructure unavailable');
    });
  });

  // ===== Custom Task Tests =====

  describe('customTask', () => {
    it('should return completed result for custom task', async () => {
      const task = createMockTask('custom');
      const result = await service.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.workflowState.phase).toBe(WorkflowPhase.COMPLETED);
    });
  });
});
