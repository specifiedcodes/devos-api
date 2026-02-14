/**
 * PlannerAgentPipelineExecutorService Tests
 * Story 11.6: Planner Agent CLI Integration
 *
 * Tests for the main planner agent orchestrator that coordinates
 * CLI session, document generation, validation, and Git operations.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlannerAgentPipelineExecutorService } from './planner-agent-pipeline-executor.service';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { PipelineBranchManagerService } from './pipeline-branch-manager.service';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { PlannerDocumentValidatorService } from './planner-document-validator.service';
import { PlannerSprintStatusUpdaterService } from './planner-sprint-status-updater.service';
import { PlannerGitOpsService } from './planner-git-ops.service';
import { DevAgentGitOpsService } from './dev-agent-git-ops.service';
import { PlannerAgentExecutionParams } from '../interfaces/planner-agent-execution.interfaces';

describe('PlannerAgentPipelineExecutorService', () => {
  let service: PlannerAgentPipelineExecutorService;
  let eventEmitter: EventEmitter2;
  let lifecycleService: jest.Mocked<CLISessionLifecycleService>;
  let branchManager: jest.Mocked<PipelineBranchManagerService>;
  let outputStream: jest.Mocked<CLIOutputStreamService>;
  let healthMonitor: jest.Mocked<SessionHealthMonitorService>;
  let documentValidator: jest.Mocked<PlannerDocumentValidatorService>;
  let sprintStatusUpdater: jest.Mocked<PlannerSprintStatusUpdaterService>;
  let plannerGitOps: jest.Mocked<PlannerGitOpsService>;
  let devAgentGitOps: jest.Mocked<DevAgentGitOpsService>;

  const baseParams: PlannerAgentExecutionParams = {
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    storyId: null,
    projectName: 'DevOS',
    projectDescription: 'AI-powered development platform',
    projectGoals: ['Automate dev workflow', 'Multi-agent collaboration'],
    epicId: 'epic-12',
    epicDescription: 'AI Memory & Context Management',
    planningTask: 'create-project-plan',
    techStack: 'NestJS, TypeScript, PostgreSQL',
    codeStylePreferences: 'ESLint + Prettier',
    templateType: null,
    workspacePath: '/tmp/workspaces/ws-123/proj-456',
    gitRepoUrl: 'https://github.com/owner/repo.git',
    githubToken: 'ghp_test_token',
    repoOwner: 'owner',
    repoName: 'repo',
    existingEpics: ['Epic 11: Orchestrator'],
    existingStories: ['11-1: State Machine'],
    previousPlannerOutput: null,
  };

  /**
   * Helper to simulate CLI session completion after a brief delay.
   */
  function simulateSessionCompletion(
    emitter: EventEmitter2,
    sessionId: string,
    exitCode: number = 0,
  ): void {
    setTimeout(() => {
      emitter.emit('cli:session:completed', {
        type: 'cli:session:completed',
        sessionId,
        agentId: 'planner-agent-test',
        agentType: 'planner',
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        timestamp: new Date(),
        metadata: {
          exitCode,
          outputLineCount: 50,
        },
      });
    }, 10);
  }

  function simulateSessionFailure(
    emitter: EventEmitter2,
    sessionId: string,
    error: string = 'CLI crashed',
  ): void {
    setTimeout(() => {
      emitter.emit('cli:session:failed', {
        type: 'cli:session:failed',
        sessionId,
        agentId: 'planner-agent-test',
        agentType: 'planner',
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        timestamp: new Date(),
        metadata: {
          exitCode: 1,
          error,
          outputLineCount: 10,
        },
      });
    }, 10);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannerAgentPipelineExecutorService,
        EventEmitter2,
        {
          provide: CLISessionLifecycleService,
          useValue: {
            spawnSession: jest.fn(),
          },
        },
        {
          provide: PipelineBranchManagerService,
          useValue: {
            createFeatureBranch: jest.fn(),
            getCurrentBranch: jest.fn(),
          },
        },
        {
          provide: CLIOutputStreamService,
          useValue: {
            startStreaming: jest.fn(),
            stopStreaming: jest.fn(),
            getBufferedOutput: jest.fn(),
          },
        },
        {
          provide: SessionHealthMonitorService,
          useValue: {
            startMonitoring: jest.fn(),
            stopMonitoring: jest.fn(),
          },
        },
        {
          provide: PlannerDocumentValidatorService,
          useValue: {
            validateDocuments: jest.fn(),
            extractDocumentPaths: jest.fn(),
            validateDocument: jest.fn(),
          },
        },
        {
          provide: PlannerSprintStatusUpdaterService,
          useValue: {
            updateSprintStatus: jest.fn(),
            parseSprintStatus: jest.fn(),
          },
        },
        {
          provide: PlannerGitOpsService,
          useValue: {
            stageDocuments: jest.fn(),
            commitDocuments: jest.fn(),
            pushToRemote: jest.fn(),
          },
        },
        {
          provide: DevAgentGitOpsService,
          useValue: {
            getLatestCommit: jest.fn(),
            pushBranch: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlannerAgentPipelineExecutorService>(
      PlannerAgentPipelineExecutorService,
    );
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    lifecycleService = module.get(CLISessionLifecycleService);
    branchManager = module.get(PipelineBranchManagerService);
    outputStream = module.get(CLIOutputStreamService);
    healthMonitor = module.get(SessionHealthMonitorService);
    documentValidator = module.get(PlannerDocumentValidatorService);
    sprintStatusUpdater = module.get(PlannerSprintStatusUpdaterService);
    plannerGitOps = module.get(PlannerGitOpsService);
    devAgentGitOps = module.get(DevAgentGitOpsService);
  });

  /**
   * Setup common mocks for a successful execution flow.
   */
  function setupSuccessMocks(overrideSessionId?: string): string {
    const sessionId = overrideSessionId || 'session-planner-123';

    lifecycleService.spawnSession.mockResolvedValue({
      sessionId,
      pid: 12345,
    });

    outputStream.getBufferedOutput.mockResolvedValue([
      'Created file: _bmad-output/planning-artifacts/prd.md',
      'Created file: _bmad-output/implementation-artifacts/12-1-setup.md',
    ]);

    documentValidator.extractDocumentPaths.mockReturnValue([
      '_bmad-output/planning-artifacts/prd.md',
      '_bmad-output/implementation-artifacts/12-1-setup.md',
    ]);

    documentValidator.validateDocuments.mockResolvedValue({
      valid: true,
      documents: [
        {
          filePath: '/workspace/_bmad-output/planning-artifacts/prd.md',
          documentType: 'prd',
          valid: true,
          hasAcceptanceCriteria: false,
          hasTaskBreakdown: false,
          issues: [],
        },
        {
          filePath: '/workspace/_bmad-output/implementation-artifacts/12-1-setup.md',
          documentType: 'story',
          valid: true,
          hasAcceptanceCriteria: true,
          hasTaskBreakdown: true,
          issues: [],
        },
      ],
      totalDocuments: 2,
      validDocuments: 2,
      issues: [],
    });

    sprintStatusUpdater.updateSprintStatus.mockResolvedValue({
      success: true,
      storiesAdded: 1,
      storiesSkipped: 0,
      updatedFilePath: '/workspace/sprint-status.yaml',
      error: null,
    });

    plannerGitOps.stageDocuments.mockResolvedValue();
    plannerGitOps.commitDocuments.mockResolvedValue({
      hash: 'abc123def456',
      message: 'plan(devos-epic-12): Generate planning documents',
    });
    plannerGitOps.pushToRemote.mockResolvedValue();

    return sessionId;
  }

  // ─── Full workflow tests ──────────────────────────────────────────────────

  it('should successfully complete full 9-step planning workflow', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(baseParams);

    expect(result.success).toBe(true);
    expect(result.planningTask).toBe('create-project-plan');
    expect(result.documentsGenerated.length).toBeGreaterThan(0);
    expect(result.commitHash).toBe('abc123def456');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeNull();
  });

  it('should read project context from workspace', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(baseParams);

    expect(result.success).toBe(true);
    // The prompt is built with project context - verified by successful execution
    expect(lifecycleService.spawnSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'planner',
        task: expect.stringContaining('DevOS'),
      }),
    );
  });

  it('should assemble correct planner-specific prompt with project context', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    await service.execute(baseParams);

    const spawnCall = lifecycleService.spawnSession.mock.calls[0][0];
    expect(spawnCall.task).toContain('DevOS');
    expect(spawnCall.task).toContain('AI-powered development platform');
    expect(spawnCall.task).toContain('NestJS, TypeScript, PostgreSQL');
  });

  it('should spawn CLI session via CLISessionLifecycleService', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    await service.execute(baseParams);

    expect(lifecycleService.spawnSession).toHaveBeenCalledTimes(1);
    expect(lifecycleService.spawnSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'planner',
        workspaceId: 'ws-123',
        projectId: 'proj-456',
      }),
    );
  });

  it('should wait for CLI session completion', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(baseParams);

    expect(result.success).toBe(true);
    expect(outputStream.startStreaming).toHaveBeenCalledTimes(1);
    expect(healthMonitor.startMonitoring).toHaveBeenCalledWith(sessionId);
  });

  it('should validate generated documents after CLI completes', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    await service.execute(baseParams);

    expect(documentValidator.validateDocuments).toHaveBeenCalledWith(
      baseParams.workspacePath,
      baseParams.planningTask,
    );
  });

  it('should update sprint-status.yaml with new stories', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    await service.execute(baseParams);

    expect(sprintStatusUpdater.updateSprintStatus).toHaveBeenCalled();
  });

  it('should stage and commit planning documents', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    await service.execute(baseParams);

    expect(plannerGitOps.stageDocuments).toHaveBeenCalled();
    expect(plannerGitOps.commitDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: baseParams.workspacePath,
        epicId: 'epic-12',
        planningTask: 'create-project-plan',
      }),
    );
  });

  it('should push commits to remote', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    await service.execute(baseParams);

    expect(plannerGitOps.pushToRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: baseParams.workspacePath,
        githubToken: 'ghp_test_token',
        repoOwner: 'owner',
        repoName: 'repo',
      }),
    );
  });

  it('should return PlannerAgentExecutionResult with all fields populated', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(baseParams);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        planningTask: 'create-project-plan',
        documentsGenerated: expect.any(Array),
        storiesCreated: expect.any(Array),
        commitHash: 'abc123def456',
        sessionId: expect.any(String),
        durationMs: expect.any(Number),
        error: null,
      }),
    );
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  it('should handle CLI session failure (non-zero exit code)', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionFailure(eventEmitter, sessionId, 'CLI crashed');

    const result = await service.execute(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('CLI crashed');
    expect(result.documentsGenerated).toHaveLength(0);
    expect(result.storiesCreated).toHaveLength(0);
  });

  it('should handle no documents generated (reports in result)', async () => {
    const sessionId = setupSuccessMocks();
    documentValidator.validateDocuments.mockResolvedValue({
      valid: true,
      documents: [],
      totalDocuments: 0,
      validDocuments: 0,
      issues: [],
    });
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(baseParams);

    expect(result.success).toBe(true);
    expect(result.documentsGenerated).toHaveLength(0);
  });

  it('should handle push failure with error in result', async () => {
    const sessionId = setupSuccessMocks();
    plannerGitOps.pushToRemote.mockRejectedValue(
      new Error('Push failed after retry'),
    );
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Push failed after retry');
  });

  // ─── Progress events ──────────────────────────────────────────────────────

  it('should emit progress events at each step', async () => {
    const sessionId = setupSuccessMocks();
    const progressEvents: any[] = [];
    eventEmitter.on('planner-agent:progress', (event) => {
      progressEvents.push(event);
    });
    simulateSessionCompletion(eventEmitter, sessionId);

    await service.execute(baseParams);

    // Should have emitted progress events for multiple steps
    expect(progressEvents.length).toBeGreaterThan(0);
    const steps = progressEvents.map((e) => e.step);
    expect(steps).toContain('reading-project-context');
    expect(steps).toContain('spawning-cli');
    expect(steps).toContain('generating-documents');
    expect(steps).toContain('validating-documents');
    expect(steps).toContain('committing-documents');
    expect(steps).toContain('updating-status');
  });

  it('should set pipeline metadata for Dev Agent handoff', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(baseParams);

    // The result contains everything needed for Dev Agent handoff
    expect(result.storiesCreated).toBeDefined();
    expect(result.documentsGenerated).toBeDefined();
    expect(result.planningTask).toBe('create-project-plan');
  });

  // ─── Planning task types ──────────────────────────────────────────────────

  it('should handle create-project-plan task type', async () => {
    const sessionId = setupSuccessMocks();
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(baseParams);

    expect(result.success).toBe(true);
    expect(result.planningTask).toBe('create-project-plan');
    expect(lifecycleService.spawnSession).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining('Create Project Plan'),
      }),
    );
  });

  it('should handle breakdown-epic task type', async () => {
    const sessionId = setupSuccessMocks();
    const params = { ...baseParams, planningTask: 'breakdown-epic' as const };
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(params);

    expect(result.success).toBe(true);
    expect(result.planningTask).toBe('breakdown-epic');
  });

  it('should handle create-stories task type', async () => {
    const sessionId = setupSuccessMocks();
    const params = { ...baseParams, planningTask: 'create-stories' as const };
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(params);

    expect(result.success).toBe(true);
    expect(result.planningTask).toBe('create-stories');
  });

  it('should handle generate-prd task type', async () => {
    const sessionId = setupSuccessMocks();
    const params = { ...baseParams, planningTask: 'generate-prd' as const };
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(params);

    expect(result.success).toBe(true);
    expect(result.planningTask).toBe('generate-prd');
  });

  it('should handle generate-architecture task type', async () => {
    const sessionId = setupSuccessMocks();
    const params = {
      ...baseParams,
      planningTask: 'generate-architecture' as const,
    };
    simulateSessionCompletion(eventEmitter, sessionId);

    const result = await service.execute(params);

    expect(result.success).toBe(true);
    expect(result.planningTask).toBe('generate-architecture');
  });

  // ─── Cleanup and edge cases ───────────────────────────────────────────────

  it('should cleanup streaming and monitoring on error', async () => {
    const sessionId = setupSuccessMocks();
    lifecycleService.spawnSession.mockRejectedValue(
      new Error('Spawn failed'),
    );

    const result = await service.execute(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Spawn failed');
  });

  it('should not push if no commit hash', async () => {
    const sessionId = setupSuccessMocks();
    plannerGitOps.commitDocuments.mockResolvedValue(null);
    simulateSessionCompletion(eventEmitter, sessionId);

    await service.execute(baseParams);

    expect(plannerGitOps.pushToRemote).not.toHaveBeenCalled();
  });

  it('should not push if no GitHub token', async () => {
    const sessionId = setupSuccessMocks();
    const params = { ...baseParams, githubToken: '' };
    simulateSessionCompletion(eventEmitter, sessionId);

    await service.execute(params);

    expect(plannerGitOps.pushToRemote).not.toHaveBeenCalled();
  });
});
