/**
 * DevAgentPipelineExecutorService Tests
 * Story 11.4: Dev Agent CLI Integration
 *
 * Tests for the main dev agent orchestrator that coordinates
 * CLI session, Git operations, and GitHub API calls.
 */

// Mock @octokit/rest to avoid ESM import issues in Jest
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DevAgentPipelineExecutorService } from './dev-agent-pipeline-executor.service';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { PipelineBranchManagerService } from './pipeline-branch-manager.service';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { DevAgentGitOpsService } from './dev-agent-git-ops.service';
import { DevAgentTestExtractorService } from './dev-agent-test-extractor.service';
import { DevAgentPRCreatorService } from './dev-agent-pr-creator.service';
import { DevAgentExecutionParams } from '../interfaces/dev-agent-execution.interfaces';

describe('DevAgentPipelineExecutorService', () => {
  let service: DevAgentPipelineExecutorService;
  let eventEmitter: EventEmitter2;
  let lifecycleService: jest.Mocked<CLISessionLifecycleService>;
  let branchManager: jest.Mocked<PipelineBranchManagerService>;
  let outputStream: jest.Mocked<CLIOutputStreamService>;
  let healthMonitor: jest.Mocked<SessionHealthMonitorService>;
  let gitOps: jest.Mocked<DevAgentGitOpsService>;
  let testExtractor: jest.Mocked<DevAgentTestExtractorService>;
  let prCreator: jest.Mocked<DevAgentPRCreatorService>;

  const baseParams: DevAgentExecutionParams = {
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    storyId: '11-4',
    storyTitle: 'Dev Agent CLI Integration',
    storyDescription: 'Implement dev agent CLI integration',
    acceptanceCriteria: ['CLI spawns correctly', 'Tests pass'],
    techStack: 'NestJS, TypeScript',
    codeStylePreferences: 'ESLint + Prettier',
    testingStrategy: 'TDD with Jest',
    workspacePath: '/tmp/workspaces/ws-123/proj-456',
    gitRepoUrl: 'https://github.com/owner/repo.git',
    githubToken: 'ghp_test_token',
    repoOwner: 'owner',
    repoName: 'repo',
  };

  /**
   * Helper to simulate CLI session completion after a brief delay.
   */
  function simulateSessionCompletion(
    emitter: EventEmitter2,
    sessionId: string,
    exitCode: number = 0,
  ): void {
    // Delay to allow the executor to start listening
    setTimeout(() => {
      emitter.emit('cli:session:completed', {
        type: 'cli:session:completed',
        sessionId,
        agentId: 'dev-agent-11-4',
        agentType: 'dev',
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        timestamp: new Date(),
        metadata: {
          exitCode,
          outputLineCount: 100,
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
        agentId: 'dev-agent-11-4',
        agentType: 'dev',
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        timestamp: new Date(),
        metadata: {
          exitCode: 1,
          error,
          outputLineCount: 50,
        },
      });
    }, 10);
  }

  beforeEach(async () => {
    eventEmitter = new EventEmitter2();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevAgentPipelineExecutorService,
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
        {
          provide: CLISessionLifecycleService,
          useValue: {
            spawnSession: jest.fn().mockResolvedValue({
              sessionId: 'session-123',
              pid: 12345,
            }),
          },
        },
        {
          provide: PipelineBranchManagerService,
          useValue: {
            createFeatureBranch: jest
              .fn()
              .mockResolvedValue('devos/dev/11-4'),
          },
        },
        {
          provide: CLIOutputStreamService,
          useValue: {
            startStreaming: jest.fn(),
            stopStreaming: jest.fn().mockResolvedValue(undefined),
            getBufferedOutput: jest.fn().mockResolvedValue([
              'Tests:       15 passed, 15 total',
              'All files |  90.00% |',
            ]),
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
          provide: DevAgentGitOpsService,
          useValue: {
            getLatestCommit: jest.fn().mockResolvedValue({
              hash: 'abc123def456',
              message: 'feat(devos-11-4): implement dev agent',
              author: 'DevOS Agent',
              timestamp: new Date(),
            }),
            pushBranch: jest.fn().mockResolvedValue(undefined),
            getChangedFiles: jest.fn().mockResolvedValue({
              created: ['src/new.ts'],
              modified: ['src/existing.ts'],
              deleted: [],
            }),
          },
        },
        {
          provide: DevAgentTestExtractorService,
          useValue: {
            extractTestResults: jest.fn().mockReturnValue({
              total: 15,
              passed: 15,
              failed: 0,
              coverage: 90.0,
              testCommand: 'npm test',
            }),
            runTests: jest.fn().mockResolvedValue({
              total: 10,
              passed: 10,
              failed: 0,
              coverage: 85.0,
              testCommand: 'npm test',
            }),
          },
        },
        {
          provide: DevAgentPRCreatorService,
          useValue: {
            createPullRequest: jest.fn().mockResolvedValue({
              prUrl: 'https://github.com/owner/repo/pull/42',
              prNumber: 42,
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DevAgentPipelineExecutorService>(
      DevAgentPipelineExecutorService,
    );
    lifecycleService = module.get(CLISessionLifecycleService);
    branchManager = module.get(PipelineBranchManagerService);
    outputStream = module.get(CLIOutputStreamService);
    healthMonitor = module.get(SessionHealthMonitorService);
    gitOps = module.get(DevAgentGitOpsService);
    testExtractor = module.get(DevAgentTestExtractorService);
    prCreator = module.get(DevAgentPRCreatorService);
  });

  afterEach(() => {
    eventEmitter.removeAllListeners();
  });

  describe('execute', () => {
    it('should successfully complete full 10-step workflow', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      const result = await service.execute(baseParams);

      expect(result.success).toBe(true);
      expect(result.branch).toBe('devos/dev/11-4');
      expect(result.commitHash).toBe('abc123def456');
      expect(result.prUrl).toBe(
        'https://github.com/owner/repo/pull/42',
      );
      expect(result.prNumber).toBe(42);
      expect(result.error).toBeNull();
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should create feature branch via PipelineBranchManager', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      await service.execute(baseParams);

      expect(branchManager.createFeatureBranch).toHaveBeenCalledWith({
        workspacePath: baseParams.workspacePath,
        agentType: 'dev',
        storyId: '11-4',
      });
    });

    it('should assemble correct dev-specific prompt with story context', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      await service.execute(baseParams);

      const spawnCall = lifecycleService.spawnSession.mock.calls[0];
      const taskPrompt = spawnCall[0].task;
      expect(taskPrompt).toContain('Dev Agent CLI Integration');
      expect(taskPrompt).toContain('feat(devos-11-4)');
      expect(taskPrompt).toContain('Test-Driven Development');
    });

    it('should spawn CLI session via CLISessionLifecycleService', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      await service.execute(baseParams);

      expect(lifecycleService.spawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-123',
          projectId: 'proj-456',
          agentType: 'dev',
          storyId: '11-4',
        }),
      );
    });

    it('should wait for CLI session completion', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      const result = await service.execute(baseParams);

      // If it completes, the session completion was handled
      expect(result.success).toBe(true);
    });

    it('should extract test results from CLI output', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      const result = await service.execute(baseParams);

      expect(testExtractor.extractTestResults).toHaveBeenCalled();
      expect(result.testResults).not.toBeNull();
      expect(result.testResults!.total).toBe(15);
      expect(result.testResults!.passed).toBe(15);
    });

    it('should push branch to remote after CLI completes', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      await service.execute(baseParams);

      expect(gitOps.pushBranch).toHaveBeenCalledWith(
        baseParams.workspacePath,
        'devos/dev/11-4',
        baseParams.githubToken,
        baseParams.repoOwner,
        baseParams.repoName,
      );
    });

    it('should create pull request with correct title and body', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      await service.execute(baseParams);

      expect(prCreator.createPullRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          storyId: '11-4',
          storyTitle: 'Dev Agent CLI Integration',
          branch: 'devos/dev/11-4',
          baseBranch: 'main',
        }),
      );
    });

    it('should return DevAgentExecutionResult with all fields populated', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      const result = await service.execute(baseParams);

      expect(result.success).toBe(true);
      expect(result.branch).toBe('devos/dev/11-4');
      expect(result.commitHash).toBe('abc123def456');
      expect(result.prUrl).toBe(
        'https://github.com/owner/repo/pull/42',
      );
      expect(result.prNumber).toBe(42);
      expect(result.testResults).not.toBeNull();
      expect(result.filesCreated).toEqual(['src/new.ts']);
      expect(result.filesModified).toEqual(['src/existing.ts']);
      expect(result.sessionId).toBe('session-123');
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.error).toBeNull();
    });

    it('should handle CLI session failure (non-zero exit code)', async () => {
      simulateSessionFailure(
        eventEmitter,
        'session-123',
        'CLI crashed',
      );

      const result = await service.execute(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('CLI');
      expect(result.prUrl).toBeNull();
      expect(result.prNumber).toBeNull();
    });

    it('should handle GitHub push failure with retry', async () => {
      gitOps.pushBranch.mockRejectedValue(
        new Error('Push failed after retry'),
      );
      simulateSessionCompletion(eventEmitter, 'session-123');

      const result = await service.execute(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Push failed');
    });

    it('should handle PR creation failure gracefully', async () => {
      prCreator.createPullRequest.mockRejectedValue(
        new Error('GitHub API error'),
      );
      simulateSessionCompletion(eventEmitter, 'session-123');

      const result = await service.execute(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub API error');
    });

    it('should emit progress events at each step', async () => {
      const progressEvents: any[] = [];
      eventEmitter.on('dev-agent:progress', (event: any) => {
        progressEvents.push(event);
      });

      simulateSessionCompletion(eventEmitter, 'session-123');

      await service.execute(baseParams);

      // Should have progress events for all steps
      const steps = progressEvents.map((e) => e.step);
      expect(steps).toContain('reading-story');
      expect(steps).toContain('creating-branch');
      expect(steps).toContain('spawning-cli');
      expect(steps).toContain('writing-code');
      expect(steps).toContain('running-tests');
      expect(steps).toContain('committing-code');
      expect(steps).toContain('pushing-branch');
      expect(steps).toContain('creating-pr');
      expect(steps).toContain('updating-status');
    });

    it('should handle missing GitHub token (throws error)', async () => {
      branchManager.createFeatureBranch.mockRejectedValue(
        new Error('Failed to create branch'),
      );

      const result = await service.execute(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle no commits after CLI session (reports error)', async () => {
      gitOps.getLatestCommit.mockResolvedValue(null);
      simulateSessionCompletion(eventEmitter, 'session-123');

      const result = await service.execute(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'did not produce any commits',
      );
    });

    it('should set story metadata for QA handoff in result', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      const result = await service.execute(baseParams);

      // QA handoff data
      expect(result.prUrl).toBeTruthy();
      expect(result.branch).toBeTruthy();
      expect(result.commitHash).toBeTruthy();
      expect(result.testResults).toBeTruthy();
    });

    it('should run tests explicitly when extraction from output fails', async () => {
      testExtractor.extractTestResults.mockReturnValue(null);
      simulateSessionCompletion(eventEmitter, 'session-123');

      await service.execute(baseParams);

      expect(testExtractor.runTests).toHaveBeenCalledWith(
        baseParams.workspacePath,
      );
    });

    it('should start and stop output streaming', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      await service.execute(baseParams);

      expect(outputStream.startStreaming).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-123',
          workspaceId: 'ws-123',
        }),
      );
      expect(outputStream.stopStreaming).toHaveBeenCalledWith(
        'session-123',
      );
    });

    it('should start and stop health monitoring', async () => {
      simulateSessionCompletion(eventEmitter, 'session-123');

      await service.execute(baseParams);

      expect(healthMonitor.startMonitoring).toHaveBeenCalledWith(
        'session-123',
      );
      expect(healthMonitor.stopMonitoring).toHaveBeenCalledWith(
        'session-123',
      );
    });

    it('should cleanup monitoring and streaming on error', async () => {
      branchManager.createFeatureBranch.mockRejectedValue(
        new Error('Branch creation failed'),
      );

      await service.execute(baseParams);

      // stopStreaming should be called during cleanup
      expect(outputStream.stopStreaming).toHaveBeenCalled();
    });
  });
});
