/**
 * DevOpsAgentPipelineExecutorService Tests
 * Story 11.7: DevOps Agent CLI Integration
 */

// Mock Octokit ESM module before imports
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DevOpsAgentPipelineExecutorService } from './devops-agent-pipeline-executor.service';
import { DevOpsPRMergerService } from './devops-pr-merger.service';
import { DevOpsDeploymentTriggerService } from './devops-deployment-trigger.service';
import { DevOpsDeploymentMonitorService } from './devops-deployment-monitor.service';
import { DevOpsSmokeTestRunnerService } from './devops-smoke-test-runner.service';
import { DevOpsRollbackHandlerService } from './devops-rollback-handler.service';
import { SupabaseService } from '../../integrations/supabase/supabase.service';
import { DevOpsAgentExecutionParams } from '../interfaces/devops-agent-execution.interfaces';

describe('DevOpsAgentPipelineExecutorService', () => {
  let service: DevOpsAgentPipelineExecutorService;
  let prMerger: jest.Mocked<DevOpsPRMergerService>;
  let deploymentTrigger: jest.Mocked<DevOpsDeploymentTriggerService>;
  let deploymentMonitor: jest.Mocked<DevOpsDeploymentMonitorService>;
  let smokeTestRunner: jest.Mocked<DevOpsSmokeTestRunnerService>;
  let rollbackHandler: jest.Mocked<DevOpsRollbackHandlerService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const baseParams: DevOpsAgentExecutionParams = {
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    storyId: 'story-789',
    storyTitle: 'Add user profile',
    storyDescription: 'Add user profile endpoint',
    workspacePath: '/tmp/workspace',
    gitRepoUrl: 'https://github.com/org/repo.git',
    githubToken: 'ghp_test',
    repoOwner: 'org',
    repoName: 'repo',
    prUrl: 'https://github.com/org/repo/pull/42',
    prNumber: 42,
    devBranch: 'devos/dev/story-789',
    qaVerdict: 'PASS',
    qaReportSummary: 'All tests passing',
    deploymentPlatform: 'railway',
    supabaseConfigured: false,
    environment: 'staging',
  };

  const successMergeResult = {
    success: true,
    mergeCommitHash: 'abc123',
    mergedAt: new Date(),
    error: null,
  };

  const successDeployResult = {
    success: true,
    deploymentId: 'deploy-123',
    deploymentUrl: 'https://app.railway.app',
    platform: 'railway' as const,
    error: null,
  };

  const successDeploymentStatus = {
    status: 'success' as const,
    deploymentUrl: 'https://app.railway.app',
    deployedAt: new Date(),
    buildLogs: null,
    error: null,
  };

  const successSmokeResults = {
    passed: true,
    healthCheck: {
      name: 'Health Check',
      url: 'https://app.railway.app/api/health',
      method: 'GET',
      expectedStatus: 200,
      actualStatus: 200,
      passed: true,
      responseTimeMs: 100,
      error: null,
    },
    apiChecks: [],
    totalChecks: 1,
    passedChecks: 1,
    failedChecks: 0,
    durationMs: 5000,
    details: '1/1 checks passed',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevOpsAgentPipelineExecutorService,
        {
          provide: DevOpsPRMergerService,
          useValue: { mergePullRequest: jest.fn() },
        },
        {
          provide: DevOpsDeploymentTriggerService,
          useValue: {
            detectPlatform: jest.fn(),
            triggerDeployment: jest.fn(),
          },
        },
        {
          provide: DevOpsDeploymentMonitorService,
          useValue: { waitForDeployment: jest.fn() },
        },
        {
          provide: DevOpsSmokeTestRunnerService,
          useValue: { runSmokeTests: jest.fn() },
        },
        {
          provide: DevOpsRollbackHandlerService,
          useValue: {
            performRollback: jest.fn(),
            createIncidentReport: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: SupabaseService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<DevOpsAgentPipelineExecutorService>(DevOpsAgentPipelineExecutorService);
    prMerger = module.get(DevOpsPRMergerService) as jest.Mocked<DevOpsPRMergerService>;
    deploymentTrigger = module.get(DevOpsDeploymentTriggerService) as jest.Mocked<DevOpsDeploymentTriggerService>;
    deploymentMonitor = module.get(DevOpsDeploymentMonitorService) as jest.Mocked<DevOpsDeploymentMonitorService>;
    smokeTestRunner = module.get(DevOpsSmokeTestRunnerService) as jest.Mocked<DevOpsSmokeTestRunnerService>;
    rollbackHandler = module.get(DevOpsRollbackHandlerService) as jest.Mocked<DevOpsRollbackHandlerService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
  });

  /** Set up mocks for a full successful pipeline execution */
  function setupSuccessMocks(): void {
    prMerger.mergePullRequest.mockResolvedValue(successMergeResult);
    deploymentTrigger.detectPlatform.mockResolvedValue('railway');
    deploymentTrigger.triggerDeployment.mockResolvedValue(successDeployResult);
    deploymentMonitor.waitForDeployment.mockResolvedValue(successDeploymentStatus);
    smokeTestRunner.runSmokeTests.mockResolvedValue(successSmokeResults);
  }

  describe('execute', () => {
    it('should successfully complete full 9-step deployment workflow', async () => {
      setupSuccessMocks();

      const result = await service.execute(baseParams);

      expect(result.success).toBe(true);
      expect(result.mergeCommitHash).toBe('abc123');
      expect(result.deploymentUrl).toBe('https://app.railway.app');
      expect(result.deploymentPlatform).toBe('railway');
      expect(result.smokeTestResults).toEqual(successSmokeResults);
      expect(result.rollbackPerformed).toBe(false);
      expect(result.incidentReport).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should merge PR via GitHub API before deployment', async () => {
      setupSuccessMocks();

      await service.execute(baseParams);

      expect(prMerger.mergePullRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          githubToken: 'ghp_test',
          repoOwner: 'org',
          repoName: 'repo',
          prNumber: 42,
          mergeMethod: 'squash',
        }),
      );
    });

    it('should detect Railway deployment platform', async () => {
      setupSuccessMocks();

      await service.execute(baseParams);

      expect(deploymentTrigger.detectPlatform).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-123',
          projectId: 'proj-456',
          preferredPlatform: 'railway',
        }),
      );
    });

    it('should detect Vercel deployment platform', async () => {
      setupSuccessMocks();
      deploymentTrigger.detectPlatform.mockResolvedValue('vercel');
      deploymentTrigger.triggerDeployment.mockResolvedValue({
        ...successDeployResult,
        platform: 'vercel',
      });

      const result = await service.execute({
        ...baseParams,
        deploymentPlatform: 'vercel',
      });

      expect(deploymentTrigger.detectPlatform).toHaveBeenCalledWith(
        expect.objectContaining({ preferredPlatform: 'vercel' }),
      );
      expect(result.success).toBe(true);
    });

    it('should run Supabase migrations when configured', async () => {
      setupSuccessMocks();

      // Should not throw, just log
      const result = await service.execute({
        ...baseParams,
        supabaseConfigured: true,
      });

      expect(result.success).toBe(true);
    });

    it('should trigger deployment via platform API', async () => {
      setupSuccessMocks();

      await service.execute(baseParams);

      expect(deploymentTrigger.triggerDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'railway',
          workspaceId: 'ws-123',
          projectId: 'proj-456',
          commitHash: 'abc123',
        }),
      );
    });

    it('should monitor deployment progress until completion', async () => {
      setupSuccessMocks();

      await service.execute(baseParams);

      expect(deploymentMonitor.waitForDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'railway',
          deploymentId: 'deploy-123',
        }),
      );
    });

    it('should spawn CLI session for smoke tests', async () => {
      setupSuccessMocks();

      await service.execute(baseParams);

      expect(smokeTestRunner.runSmokeTests).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentUrl: 'https://app.railway.app',
          workspaceId: 'ws-123',
          projectId: 'proj-456',
          storyTitle: 'Add user profile',
        }),
      );
    });

    it('should return success when deployment and smoke tests pass', async () => {
      setupSuccessMocks();

      const result = await service.execute(baseParams);

      expect(result.success).toBe(true);
      expect(result.smokeTestResults?.passed).toBe(true);
      expect(result.deploymentUrl).toBe('https://app.railway.app');
    });

    it('should trigger rollback when deployment fails', async () => {
      prMerger.mergePullRequest.mockResolvedValue(successMergeResult);
      deploymentTrigger.detectPlatform.mockResolvedValue('railway');
      deploymentTrigger.triggerDeployment.mockResolvedValue(successDeployResult);
      deploymentMonitor.waitForDeployment.mockResolvedValue({
        status: 'failed',
        deploymentUrl: null,
        deployedAt: null,
        buildLogs: 'Build error',
        error: 'Build failed',
      });
      rollbackHandler.performRollback.mockResolvedValue({
        success: true,
        previousDeploymentId: 'deploy-prev',
        rollbackUrl: null,
        error: null,
      });
      rollbackHandler.createIncidentReport.mockReturnValue({
        storyId: 'story-789',
        timestamp: new Date(),
        severity: 'high',
        failureType: 'deployment_failed',
        description: 'Deployment failed',
        deploymentId: 'deploy-123',
        rollbackPerformed: true,
        rollbackSuccessful: true,
        rootCause: 'Build failed',
        resolution: 'Automatic rollback completed',
        recommendations: ['Review build logs'],
      });

      const result = await service.execute(baseParams);

      expect(result.success).toBe(false);
      expect(result.rollbackPerformed).toBe(true);
      expect(rollbackHandler.performRollback).toHaveBeenCalled();
    });

    it('should trigger rollback when smoke tests fail', async () => {
      prMerger.mergePullRequest.mockResolvedValue(successMergeResult);
      deploymentTrigger.detectPlatform.mockResolvedValue('railway');
      deploymentTrigger.triggerDeployment.mockResolvedValue(successDeployResult);
      deploymentMonitor.waitForDeployment.mockResolvedValue(successDeploymentStatus);
      smokeTestRunner.runSmokeTests.mockResolvedValue({
        ...successSmokeResults,
        passed: false,
        failedChecks: 1,
      });
      rollbackHandler.performRollback.mockResolvedValue({
        success: true,
        previousDeploymentId: 'deploy-prev',
        rollbackUrl: null,
        error: null,
      });
      rollbackHandler.createIncidentReport.mockReturnValue({
        storyId: 'story-789',
        timestamp: new Date(),
        severity: 'medium',
        failureType: 'smoke_tests_failed',
        description: 'Smoke tests failed',
        deploymentId: 'deploy-123',
        rollbackPerformed: true,
        rollbackSuccessful: true,
        rootCause: 'Smoke tests failed',
        resolution: 'Automatic rollback completed',
        recommendations: ['Review smoke test failures'],
      });

      const result = await service.execute(baseParams);

      expect(result.success).toBe(false);
      expect(result.rollbackPerformed).toBe(true);
      expect(result.rollbackReason).toBe('Smoke tests failed');
      expect(rollbackHandler.performRollback).toHaveBeenCalled();
    });

    it('should create incident report on failure', async () => {
      prMerger.mergePullRequest.mockResolvedValue(successMergeResult);
      deploymentTrigger.detectPlatform.mockResolvedValue('railway');
      deploymentTrigger.triggerDeployment.mockResolvedValue(successDeployResult);
      deploymentMonitor.waitForDeployment.mockResolvedValue({
        status: 'failed',
        deploymentUrl: null,
        deployedAt: null,
        buildLogs: null,
        error: 'Build failed',
      });
      rollbackHandler.performRollback.mockResolvedValue({
        success: true,
        previousDeploymentId: null,
        rollbackUrl: null,
        error: null,
      });
      rollbackHandler.createIncidentReport.mockReturnValue({
        storyId: 'story-789',
        timestamp: new Date(),
        severity: 'high',
        failureType: 'deployment_failed',
        description: 'Deployment failed',
        deploymentId: 'deploy-123',
        rollbackPerformed: true,
        rollbackSuccessful: true,
        rootCause: 'Build failed',
        resolution: 'Automatic rollback completed',
        recommendations: [],
      });

      const result = await service.execute(baseParams);

      expect(result.incidentReport).toBeDefined();
      expect(rollbackHandler.createIncidentReport).toHaveBeenCalled();
    });

    it('should handle PR merge failure (conflict)', async () => {
      prMerger.mergePullRequest.mockResolvedValue({
        success: false,
        mergeCommitHash: null,
        mergedAt: null,
        error: 'Merge conflict',
      });

      const result = await service.execute(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Merge conflict');
      expect(result.rollbackPerformed).toBe(false);
      expect(deploymentTrigger.triggerDeployment).not.toHaveBeenCalled();
    });

    it('should handle no deployment platform configured', async () => {
      prMerger.mergePullRequest.mockResolvedValue(successMergeResult);
      deploymentTrigger.detectPlatform.mockResolvedValue(null);

      const result = await service.execute(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No deployment platform configured');
      expect(deploymentTrigger.triggerDeployment).not.toHaveBeenCalled();
    });

    it('should handle deployment timeout', async () => {
      prMerger.mergePullRequest.mockResolvedValue(successMergeResult);
      deploymentTrigger.detectPlatform.mockResolvedValue('railway');
      deploymentTrigger.triggerDeployment.mockResolvedValue(successDeployResult);
      deploymentMonitor.waitForDeployment.mockResolvedValue({
        status: 'timeout',
        deploymentUrl: null,
        deployedAt: null,
        buildLogs: null,
        error: 'Deployment timed out',
      });
      rollbackHandler.performRollback.mockResolvedValue({
        success: true,
        previousDeploymentId: null,
        rollbackUrl: null,
        error: null,
      });
      rollbackHandler.createIncidentReport.mockReturnValue({
        storyId: 'story-789',
        timestamp: new Date(),
        severity: 'high',
        failureType: 'timeout',
        description: 'Deployment timed out',
        deploymentId: 'deploy-123',
        rollbackPerformed: true,
        rollbackSuccessful: true,
        rootCause: 'Deployment timed out',
        resolution: 'Automatic rollback completed',
        recommendations: [],
      });

      const result = await service.execute(baseParams);

      expect(result.success).toBe(false);
      expect(result.rollbackPerformed).toBe(true);
    });

    it('should emit progress events at each step', async () => {
      setupSuccessMocks();

      await service.execute(baseParams);

      // Should emit progress for: merging-pr, detecting-platform, running-migrations,
      // triggering-deployment, monitoring-deployment, running-smoke-tests, updating-status
      // Each step has started + completed = 2 events per step
      const progressCalls = eventEmitter.emit.mock.calls.filter(
        (call) => call[0] === 'devops-agent:progress',
      );

      // At minimum 14 events (7 steps x 2 status each)
      expect(progressCalls.length).toBeGreaterThanOrEqual(14);

      // Verify steps are in correct order
      const steps = progressCalls.map((call) => call[1].step);
      const uniqueSteps = [...new Set(steps)];
      expect(uniqueSteps).toContain('merging-pr');
      expect(uniqueSteps).toContain('detecting-platform');
      expect(uniqueSteps).toContain('running-migrations');
      expect(uniqueSteps).toContain('triggering-deployment');
      expect(uniqueSteps).toContain('monitoring-deployment');
      expect(uniqueSteps).toContain('running-smoke-tests');
      expect(uniqueSteps).toContain('updating-status');
    });

    it('should skip deployment when qaVerdict is not PASS', async () => {
      const result = await service.execute({
        ...baseParams,
        qaVerdict: 'FAIL',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('QA verdict is FAIL');
      expect(prMerger.mergePullRequest).not.toHaveBeenCalled();
      expect(deploymentTrigger.triggerDeployment).not.toHaveBeenCalled();
    });

    it('should set pipeline metadata for story completion', async () => {
      setupSuccessMocks();

      const result = await service.execute(baseParams);

      expect(result.deploymentUrl).toBeDefined();
      expect(result.deploymentPlatform).toBeDefined();
      expect(result.mergeCommitHash).toBeDefined();
      expect(result.smokeTestResults).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.sessionId).toContain('devops-pipeline');
    });

    it('should handle unexpected errors gracefully', async () => {
      prMerger.mergePullRequest.mockRejectedValue(
        new Error('Unexpected error'),
      );

      const result = await service.execute(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unexpected error');
    });
  });
});
