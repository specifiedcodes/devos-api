/**
 * Planner Agent Pipeline Integration Smoke Test
 * Story 11.6: Planner Agent CLI Integration
 *
 * End-to-end integration test for the Planner Agent execution flow
 * with mocked CLI process and GitHub API.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlannerAgentPipelineExecutorService } from './services/planner-agent-pipeline-executor.service';
import { CLISessionLifecycleService } from './services/cli-session-lifecycle.service';
import { PipelineBranchManagerService } from './services/pipeline-branch-manager.service';
import { CLIOutputStreamService } from './services/cli-output-stream.service';
import { SessionHealthMonitorService } from './services/session-health-monitor.service';
import { PlannerDocumentValidatorService } from './services/planner-document-validator.service';
import { PlannerSprintStatusUpdaterService } from './services/planner-sprint-status-updater.service';
import { PlannerGitOpsService } from './services/planner-git-ops.service';
import { DevAgentGitOpsService } from './services/dev-agent-git-ops.service';
import {
  PlannerAgentExecutionParams,
  PlannerAgentProgressEvent,
} from './interfaces/planner-agent-execution.interfaces';

describe('Planner Agent Pipeline Integration', () => {
  let executor: PlannerAgentPipelineExecutorService;
  let eventEmitter: EventEmitter2;
  let lifecycleService: jest.Mocked<CLISessionLifecycleService>;
  let outputStream: jest.Mocked<CLIOutputStreamService>;
  let healthMonitor: jest.Mocked<SessionHealthMonitorService>;
  let documentValidator: jest.Mocked<PlannerDocumentValidatorService>;
  let sprintStatusUpdater: jest.Mocked<PlannerSprintStatusUpdaterService>;
  let plannerGitOps: jest.Mocked<PlannerGitOpsService>;

  const integrationParams: PlannerAgentExecutionParams = {
    workspaceId: 'ws-int-test',
    projectId: 'proj-int-test',
    storyId: null,
    projectName: 'IntegrationTest Project',
    projectDescription: 'Test project for integration testing',
    projectGoals: ['Goal A', 'Goal B', 'Goal C'],
    epicId: 'epic-99',
    epicDescription: 'Integration test epic',
    planningTask: 'create-project-plan',
    techStack: 'NestJS, TypeScript, PostgreSQL',
    codeStylePreferences: 'ESLint + Prettier',
    templateType: null,
    workspacePath: '/tmp/integration-test-workspace',
    gitRepoUrl: 'https://github.com/test/repo.git',
    githubToken: 'ghp_integration_test_token',
    repoOwner: 'test',
    repoName: 'repo',
    existingEpics: [],
    existingStories: [],
    previousPlannerOutput: null,
  };

  function simulateCompletion(sessionId: string, exitCode = 0): void {
    setTimeout(() => {
      eventEmitter.emit('cli:session:completed', {
        type: 'cli:session:completed',
        sessionId,
        agentId: 'planner-int-test',
        agentType: 'planner',
        workspaceId: 'ws-int-test',
        projectId: 'proj-int-test',
        timestamp: new Date(),
        metadata: { exitCode, outputLineCount: 200 },
      });
    }, 10);
  }

  function simulateFailure(sessionId: string, error = 'Test failure'): void {
    setTimeout(() => {
      eventEmitter.emit('cli:session:failed', {
        type: 'cli:session:failed',
        sessionId,
        agentId: 'planner-int-test',
        agentType: 'planner',
        workspaceId: 'ws-int-test',
        projectId: 'proj-int-test',
        timestamp: new Date(),
        metadata: { exitCode: 1, error, outputLineCount: 5 },
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
          useValue: { spawnSession: jest.fn() },
        },
        {
          provide: PipelineBranchManagerService,
          useValue: { createFeatureBranch: jest.fn(), getCurrentBranch: jest.fn() },
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
          useValue: { startMonitoring: jest.fn(), stopMonitoring: jest.fn() },
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

    executor = module.get<PlannerAgentPipelineExecutorService>(
      PlannerAgentPipelineExecutorService,
    );
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    lifecycleService = module.get(CLISessionLifecycleService);
    outputStream = module.get(CLIOutputStreamService);
    healthMonitor = module.get(SessionHealthMonitorService);
    documentValidator = module.get(PlannerDocumentValidatorService);
    sprintStatusUpdater = module.get(PlannerSprintStatusUpdaterService);
    plannerGitOps = module.get(PlannerGitOpsService);
  });

  function setupFullMocks(sessionId: string): void {
    lifecycleService.spawnSession.mockResolvedValue({ sessionId, pid: 5555 });
    outputStream.getBufferedOutput.mockResolvedValue([
      'Created file: _bmad-output/planning-artifacts/product-brief.md',
      'Created file: _bmad-output/planning-artifacts/prd.md',
      'Created file: _bmad-output/planning-artifacts/epics/epic-99-integration.md',
      'Created file: _bmad-output/implementation-artifacts/99-1-setup.md',
      'Created file: _bmad-output/implementation-artifacts/99-2-core.md',
      'Modified: _bmad-output/implementation-artifacts/sprint-status.yaml',
    ]);
    documentValidator.extractDocumentPaths.mockReturnValue([
      '_bmad-output/planning-artifacts/product-brief.md',
      '_bmad-output/planning-artifacts/prd.md',
      '_bmad-output/planning-artifacts/epics/epic-99-integration.md',
      '_bmad-output/implementation-artifacts/99-1-setup.md',
      '_bmad-output/implementation-artifacts/99-2-core.md',
      '_bmad-output/implementation-artifacts/sprint-status.yaml',
    ]);
    documentValidator.validateDocuments.mockResolvedValue({
      valid: true,
      documents: [
        { filePath: '/ws/product-brief.md', documentType: 'product-brief', valid: true, hasAcceptanceCriteria: false, hasTaskBreakdown: false, issues: [] },
        { filePath: '/ws/prd.md', documentType: 'prd', valid: true, hasAcceptanceCriteria: false, hasTaskBreakdown: false, issues: [] },
        { filePath: '/ws/epic-99.md', documentType: 'epic', valid: true, hasAcceptanceCriteria: false, hasTaskBreakdown: false, issues: [] },
        { filePath: '/ws/99-1-setup.md', documentType: 'story', valid: true, hasAcceptanceCriteria: true, hasTaskBreakdown: true, issues: [] },
        { filePath: '/ws/99-2-core.md', documentType: 'story', valid: true, hasAcceptanceCriteria: true, hasTaskBreakdown: true, issues: [] },
        { filePath: '/ws/sprint-status.yaml', documentType: 'sprint-status', valid: true, hasAcceptanceCriteria: false, hasTaskBreakdown: false, issues: [] },
      ],
      totalDocuments: 6,
      validDocuments: 6,
      issues: [],
    });
    sprintStatusUpdater.updateSprintStatus.mockResolvedValue({
      success: true,
      storiesAdded: 2,
      storiesSkipped: 0,
      updatedFilePath: '/ws/sprint-status.yaml',
      error: null,
    });
    plannerGitOps.stageDocuments.mockResolvedValue();
    plannerGitOps.commitDocuments.mockResolvedValue({
      hash: 'int-test-commit-hash',
      message: 'plan(devos-epic-99): Generate project plan',
    });
    plannerGitOps.pushToRemote.mockResolvedValue();
  }

  // ─── Full flow tests ──────────────────────────────────────────────────────

  it('should complete full planner agent execution flow', async () => {
    const sessionId = 'int-session-1';
    setupFullMocks(sessionId);
    simulateCompletion(sessionId);

    const result = await executor.execute(integrationParams);

    expect(result.success).toBe(true);
    expect(result.planningTask).toBe('create-project-plan');
    expect(result.documentsGenerated.length).toBe(6);
    expect(result.storiesCreated.length).toBe(2);
    expect(result.commitHash).toBe('int-test-commit-hash');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeNull();
  });

  it('should emit progress events at each step in correct order', async () => {
    const sessionId = 'int-session-progress';
    setupFullMocks(sessionId);
    const progressEvents: PlannerAgentProgressEvent[] = [];
    eventEmitter.on('planner-agent:progress', (event) => {
      progressEvents.push(event);
    });
    simulateCompletion(sessionId);

    await executor.execute(integrationParams);

    // Verify step order
    const steps = progressEvents.map((e) => `${e.step}:${e.status}`);
    expect(steps).toContain('reading-project-context:started');
    expect(steps).toContain('reading-project-context:completed');
    expect(steps).toContain('spawning-cli:started');
    expect(steps).toContain('spawning-cli:completed');
    expect(steps).toContain('generating-documents:started');
    expect(steps).toContain('generating-documents:completed');
    expect(steps).toContain('validating-documents:started');
    expect(steps).toContain('validating-documents:completed');
    expect(steps).toContain('updating-sprint-status:started');
    expect(steps).toContain('updating-sprint-status:completed');
    expect(steps).toContain('staging-files:started');
    expect(steps).toContain('staging-files:completed');
    expect(steps).toContain('committing-documents:started');
    expect(steps).toContain('committing-documents:completed');
    expect(steps).toContain('pushing-to-remote:started');
    expect(steps).toContain('pushing-to-remote:completed');
    expect(steps).toContain('updating-status:started');
    expect(steps).toContain('updating-status:completed');

    // Verify all events have correct metadata
    for (const event of progressEvents) {
      expect(event.type).toBe('planner-agent:progress');
      expect(event.projectId).toBe('proj-int-test');
      expect(event.workspaceId).toBe('ws-int-test');
    }
  });

  it('should validate documents against BMAD template format', async () => {
    const sessionId = 'int-session-validate';
    setupFullMocks(sessionId);
    simulateCompletion(sessionId);

    await executor.execute(integrationParams);

    expect(documentValidator.validateDocuments).toHaveBeenCalledWith(
      integrationParams.workspacePath,
      'create-project-plan',
    );
  });

  it('should update sprint-status.yaml with new story entries', async () => {
    const sessionId = 'int-session-sprint';
    setupFullMocks(sessionId);
    simulateCompletion(sessionId);

    await executor.execute(integrationParams);

    expect(sprintStatusUpdater.updateSprintStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: integrationParams.workspacePath,
        epicId: 'epic-99',
      }),
    );
  });

  it('should stage, commit, and push documents', async () => {
    const sessionId = 'int-session-git';
    setupFullMocks(sessionId);
    simulateCompletion(sessionId);

    await executor.execute(integrationParams);

    expect(plannerGitOps.stageDocuments).toHaveBeenCalled();
    expect(plannerGitOps.commitDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        epicId: 'epic-99',
        planningTask: 'create-project-plan',
      }),
    );
    expect(plannerGitOps.pushToRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        githubToken: 'ghp_integration_test_token',
        repoOwner: 'test',
        repoName: 'repo',
      }),
    );
  });

  it('should include all data needed for Dev Agent handoff', async () => {
    const sessionId = 'int-session-handoff';
    setupFullMocks(sessionId);
    simulateCompletion(sessionId);

    const result = await executor.execute(integrationParams);

    // Dev Agent handoff requires stories with IDs
    expect(result.storiesCreated.length).toBeGreaterThan(0);
    for (const story of result.storiesCreated) {
      expect(story.storyId).toMatch(/^\d+-\d+$/);
      expect(story.epicId).toBe('epic-99');
      // First story is 'ready-for-dev', rest are 'backlog'
      expect(['backlog', 'ready-for-dev']).toContain(story.status);
    }
    // Verify first story is ready-for-dev per BMAD convention
    expect(result.storiesCreated[0].status).toBe('ready-for-dev');
    expect(result.commitHash).toBeTruthy();
    expect(result.planningTask).toBe('create-project-plan');
  });

  it('should return error result on CLI failure (not thrown exception)', async () => {
    const sessionId = 'int-session-fail';
    setupFullMocks(sessionId);
    simulateFailure(sessionId, 'CLI timeout');

    const result = await executor.execute(integrationParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('CLI timeout');
    expect(result.documentsGenerated).toHaveLength(0);
    expect(result.storiesCreated).toHaveLength(0);
    // Should not throw - errors are returned in result
  });

  it('should handle push failure but still return result', async () => {
    const sessionId = 'int-session-push-fail';
    setupFullMocks(sessionId);
    plannerGitOps.pushToRemote.mockRejectedValue(
      new Error('Push rejected'),
    );
    simulateCompletion(sessionId);

    const result = await executor.execute(integrationParams);

    // Push failure results in error result
    expect(result.success).toBe(false);
    expect(result.error).toContain('Push rejected');
  });

  // ─── Task type variations ─────────────────────────────────────────────────

  it('should handle create-project-plan task generating Product Brief + PRD + epic breakdown', async () => {
    const sessionId = 'int-session-plan';
    setupFullMocks(sessionId);
    simulateCompletion(sessionId);

    const result = await executor.execute(integrationParams);

    expect(result.success).toBe(true);
    expect(result.planningTask).toBe('create-project-plan');
    // Should have product-brief, prd, epic docs and story docs
    const docTypes = result.documentsGenerated.map((d) => d.type);
    expect(docTypes).toContain('prd');
  });

  it('should handle breakdown-epic task generating stories with acceptance criteria', async () => {
    const sessionId = 'int-session-epic';
    const params = { ...integrationParams, planningTask: 'breakdown-epic' as const };
    setupFullMocks(sessionId);
    simulateCompletion(sessionId);

    const result = await executor.execute(params);

    expect(result.success).toBe(true);
    expect(result.planningTask).toBe('breakdown-epic');
  });

  it('should handle create-stories task generating story files and updating sprint-status', async () => {
    const sessionId = 'int-session-stories';
    const params = { ...integrationParams, planningTask: 'create-stories' as const };
    setupFullMocks(sessionId);
    simulateCompletion(sessionId);

    const result = await executor.execute(params);

    expect(result.success).toBe(true);
    expect(result.planningTask).toBe('create-stories');
    expect(sprintStatusUpdater.updateSprintStatus).toHaveBeenCalled();
  });
});
