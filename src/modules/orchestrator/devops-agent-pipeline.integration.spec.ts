/**
 * DevOps Agent Pipeline Integration Tests
 * Story 11.7: DevOps Agent CLI Integration
 *
 * End-to-end integration tests for the DevOps agent execution flow
 * with mocked GitHub API, deployment services, and CLI process.
 */

// Mock Octokit ESM module before imports
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DevOpsAgentPipelineExecutorService } from './services/devops-agent-pipeline-executor.service';
import { DevOpsPRMergerService } from './services/devops-pr-merger.service';
import { DevOpsDeploymentTriggerService } from './services/devops-deployment-trigger.service';
import { DevOpsDeploymentMonitorService } from './services/devops-deployment-monitor.service';
import { DevOpsSmokeTestRunnerService } from './services/devops-smoke-test-runner.service';
import { DevOpsRollbackHandlerService } from './services/devops-rollback-handler.service';
import { GitHubService } from '../integrations/github/github.service';
import { RailwayService } from '../integrations/railway/railway.service';
import { VercelService } from '../integrations/vercel/vercel.service';
import { IntegrationConnectionService } from '../integrations/integration-connection.service';
import { DeploymentMonitoringService } from '../integrations/deployment-monitoring/deployment-monitoring.service';
import { DeploymentRollbackService } from '../integrations/deployment-rollback/deployment-rollback.service';
import { CLISessionLifecycleService } from './services/cli-session-lifecycle.service';
import { CLIOutputStreamService } from './services/cli-output-stream.service';
import { SessionHealthMonitorService } from './services/session-health-monitor.service';
import { SupabaseService } from '../integrations/supabase/supabase.service';
import { DevOpsAgentExecutionParams } from './interfaces/devops-agent-execution.interfaces';

describe('DevOps Agent Pipeline Integration', () => {
  let executor: DevOpsAgentPipelineExecutorService;
  let githubService: jest.Mocked<GitHubService>;
  let railwayService: jest.Mocked<RailwayService>;
  let integrationService: jest.Mocked<IntegrationConnectionService>;
  let deploymentMonitoring: jest.Mocked<DeploymentMonitoringService>;
  let rollbackService: jest.Mocked<DeploymentRollbackService>;
  let lifecycleService: jest.Mocked<CLISessionLifecycleService>;
  let outputStream: jest.Mocked<CLIOutputStreamService>;
  let eventEmitter: EventEmitter2;

  const baseParams: DevOpsAgentExecutionParams = {
    workspaceId: 'ws-integration-test',
    projectId: 'proj-integration',
    storyId: 'story-integration',
    storyTitle: 'Integration test story',
    storyDescription: 'Testing full DevOps agent pipeline',
    workspacePath: '/tmp/integration-test',
    gitRepoUrl: 'https://github.com/org/repo.git',
    githubToken: 'ghp_integration_test',
    repoOwner: 'org',
    repoName: 'repo',
    prUrl: 'https://github.com/org/repo/pull/100',
    prNumber: 100,
    devBranch: 'devos/dev/story-integration',
    qaVerdict: 'PASS',
    qaReportSummary: 'All tests passing, no issues',
    deploymentPlatform: 'railway',
    supabaseConfigured: false,
    environment: 'staging',
  };

  const successSmokeOutput = `\`\`\`json
{
  "healthCheck": {
    "name": "Health Check",
    "url": "https://app.railway.app/api/health",
    "method": "GET",
    "expectedStatus": 200,
    "actualStatus": 200,
    "passed": true,
    "responseTimeMs": 120,
    "error": null
  },
  "apiChecks": []
}
\`\`\``;

  beforeEach(async () => {
    const realEventEmitter = new EventEmitter2();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        // Core executor
        DevOpsAgentPipelineExecutorService,
        // Sub-services with real implementations
        DevOpsPRMergerService,
        DevOpsDeploymentTriggerService,
        DevOpsDeploymentMonitorService,
        DevOpsSmokeTestRunnerService,
        DevOpsRollbackHandlerService,
        // Mocked external dependencies
        {
          provide: GitHubService,
          useValue: { mergePullRequest: jest.fn() },
        },
        {
          provide: RailwayService,
          useValue: { triggerDeployment: jest.fn() },
        },
        {
          provide: VercelService,
          useValue: { triggerDeployment: jest.fn() },
        },
        {
          provide: IntegrationConnectionService,
          useValue: { getDecryptedToken: jest.fn() },
        },
        {
          provide: DeploymentMonitoringService,
          useValue: { getDeploymentDetail: jest.fn() },
        },
        {
          provide: DeploymentRollbackService,
          useValue: { initiateAutoRollback: jest.fn() },
        },
        {
          provide: CLISessionLifecycleService,
          useValue: {
            spawnSession: jest.fn().mockResolvedValue({ sessionId: 'smoke-session' }),
          },
        },
        {
          provide: CLIOutputStreamService,
          useValue: {
            startStreaming: jest.fn(),
            stopStreaming: jest.fn().mockResolvedValue(undefined),
            getBufferedOutput: jest.fn().mockResolvedValue([]),
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
          provide: SupabaseService,
          useValue: {},
        },
        {
          provide: EventEmitter2,
          useValue: realEventEmitter,
        },
      ],
    }).compile();

    executor = module.get<DevOpsAgentPipelineExecutorService>(DevOpsAgentPipelineExecutorService);
    githubService = module.get(GitHubService) as jest.Mocked<GitHubService>;
    railwayService = module.get(RailwayService) as jest.Mocked<RailwayService>;
    integrationService = module.get(IntegrationConnectionService) as jest.Mocked<IntegrationConnectionService>;
    deploymentMonitoring = module.get(DeploymentMonitoringService) as jest.Mocked<DeploymentMonitoringService>;
    rollbackService = module.get(DeploymentRollbackService) as jest.Mocked<DeploymentRollbackService>;
    lifecycleService = module.get(CLISessionLifecycleService) as jest.Mocked<CLISessionLifecycleService>;
    outputStream = module.get(CLIOutputStreamService) as jest.Mocked<CLIOutputStreamService>;
    eventEmitter = module.get(EventEmitter2) as EventEmitter2;
  });

  function setupFullSuccessMocks(): void {
    // PR merge
    githubService.mergePullRequest.mockResolvedValue({
      merged: true,
      sha: 'merge-abc123',
      message: 'Merged',
    });

    // Platform detection
    integrationService.getDecryptedToken.mockResolvedValue('railway-token');

    // Deployment trigger
    railwayService.triggerDeployment.mockResolvedValue({
      id: 'deploy-int-123',
      status: 'building',
      projectId: 'proj-integration',
      deploymentUrl: 'https://app-int.railway.app',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    // Deployment monitoring
    deploymentMonitoring.getDeploymentDetail.mockResolvedValue({
      id: 'deploy-int-123',
      platform: 'railway',
      status: 'success',
      normalizedStatus: 'success',
      deploymentUrl: 'https://app-int.railway.app',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    } as any);

    // Smoke tests
    outputStream.getBufferedOutput.mockResolvedValue(successSmokeOutput.split('\n'));

    // Simulate smoke test CLI session completion
    setTimeout(() => {
      eventEmitter.emit('cli:session:completed', {
        sessionId: 'smoke-session',
        type: 'completed',
        timestamp: new Date(),
        metadata: { exitCode: 0 },
      });
    }, 10);
  }

  it('should merge PR, detect platform, trigger deployment, monitor, and run smoke tests', async () => {
    setupFullSuccessMocks();

    const result = await executor.execute(baseParams);

    expect(result.success).toBe(true);
    expect(result.mergeCommitHash).toBe('merge-abc123');
    expect(result.deploymentPlatform).toBe('railway');
    expect(result.deploymentId).toBe('deploy-int-123');
    expect(result.deploymentUrl).toBe('https://app-int.railway.app');
    expect(result.smokeTestResults).toBeDefined();
    expect(result.rollbackPerformed).toBe(false);
    expect(result.incidentReport).toBeNull();
  });

  it('should emit progress events at each step in correct order', async () => {
    setupFullSuccessMocks();

    const progressEvents: any[] = [];
    eventEmitter.on('devops-agent:progress', (event: any) => {
      progressEvents.push(event);
    });

    await executor.execute(baseParams);

    const steps = progressEvents.map((e) => e.step);
    expect(steps).toContain('merging-pr');
    expect(steps).toContain('detecting-platform');
    expect(steps).toContain('running-migrations');
    expect(steps).toContain('triggering-deployment');
    expect(steps).toContain('monitoring-deployment');
    expect(steps).toContain('running-smoke-tests');
    expect(steps).toContain('updating-status');

    // Verify order: merging-pr should come before detecting-platform
    const mergingIndex = steps.indexOf('merging-pr');
    const detectingIndex = steps.indexOf('detecting-platform');
    expect(mergingIndex).toBeLessThan(detectingIndex);
  });

  it('should handle successful deployment with passing smoke tests', async () => {
    setupFullSuccessMocks();

    const result = await executor.execute(baseParams);

    expect(result.success).toBe(true);
    expect(result.smokeTestResults?.passed).toBe(true);
    expect(result.error).toBeNull();
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('should trigger rollback and create incident report on deployment failure', async () => {
    // PR merge succeeds
    githubService.mergePullRequest.mockResolvedValue({
      merged: true,
      sha: 'merge-abc123',
      message: 'Merged',
    });

    // Platform detection
    integrationService.getDecryptedToken.mockResolvedValue('railway-token');

    // Deployment trigger
    railwayService.triggerDeployment.mockResolvedValue({
      id: 'deploy-fail',
      status: 'building',
      projectId: 'proj-integration',
      deploymentUrl: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    // Deployment fails
    deploymentMonitoring.getDeploymentDetail.mockResolvedValue({
      id: 'deploy-fail',
      platform: 'railway',
      status: 'failed',
      normalizedStatus: 'failed',
      deploymentUrl: null,
      startedAt: new Date().toISOString(),
      logs: 'Build error: missing dependency',
    } as any);

    // Rollback succeeds
    rollbackService.initiateAutoRollback.mockResolvedValue({
      id: 'rollback-1',
      status: 'completed',
      targetDeploymentId: 'deploy-prev',
      platform: 'railway',
      environment: 'production',
      reason: 'Deployment failed',
      createdAt: new Date().toISOString(),
    } as any);

    const result = await executor.execute(baseParams);

    expect(result.success).toBe(false);
    expect(result.rollbackPerformed).toBe(true);
    expect(result.incidentReport).toBeDefined();
    expect(result.incidentReport?.failureType).toBe('deployment_failed');
  });

  it('should trigger rollback and create incident report on smoke test failure', async () => {
    // PR merge succeeds
    githubService.mergePullRequest.mockResolvedValue({
      merged: true,
      sha: 'merge-abc123',
      message: 'Merged',
    });

    // Platform detection
    integrationService.getDecryptedToken.mockResolvedValue('railway-token');

    // Deployment trigger succeeds
    railwayService.triggerDeployment.mockResolvedValue({
      id: 'deploy-smoke-fail',
      status: 'building',
      projectId: 'proj-integration',
      deploymentUrl: 'https://app.railway.app',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    // Deployment succeeds
    deploymentMonitoring.getDeploymentDetail.mockResolvedValue({
      id: 'deploy-smoke-fail',
      platform: 'railway',
      status: 'success',
      normalizedStatus: 'success',
      deploymentUrl: 'https://app.railway.app',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    } as any);

    // Smoke tests fail (health check returns 503)
    const failedSmokeOutput = `\`\`\`json
{
  "healthCheck": {
    "name": "Health Check",
    "url": "https://app.railway.app/api/health",
    "method": "GET",
    "expectedStatus": 200,
    "actualStatus": 503,
    "passed": false,
    "responseTimeMs": 50,
    "error": "Service Unavailable"
  },
  "apiChecks": []
}
\`\`\``;
    outputStream.getBufferedOutput.mockResolvedValue(failedSmokeOutput.split('\n'));

    setTimeout(() => {
      eventEmitter.emit('cli:session:completed', {
        sessionId: 'smoke-session',
        type: 'completed',
        timestamp: new Date(),
        metadata: { exitCode: 0 },
      });
    }, 10);

    // Rollback
    rollbackService.initiateAutoRollback.mockResolvedValue({
      id: 'rollback-2',
      status: 'completed',
      targetDeploymentId: 'deploy-prev',
      platform: 'railway',
      environment: 'production',
      reason: 'Smoke tests failed',
      createdAt: new Date().toISOString(),
    } as any);

    const result = await executor.execute(baseParams);

    expect(result.success).toBe(false);
    expect(result.rollbackPerformed).toBe(true);
    expect(result.rollbackReason).toBe('Smoke tests failed');
    expect(result.incidentReport).toBeDefined();
    expect(result.incidentReport?.failureType).toBe('smoke_tests_failed');
  });

  it('should prevent deployment when PR merge fails (no rollback needed)', async () => {
    githubService.mergePullRequest.mockRejectedValue(
      Object.assign(new Error('Merge conflict'), { status: 409 }),
    );

    const result = await executor.execute(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Merge conflict');
    expect(result.rollbackPerformed).toBe(false);
    expect(railwayService.triggerDeployment).not.toHaveBeenCalled();
  });

  it('should report error when no deployment platform configured', async () => {
    githubService.mergePullRequest.mockResolvedValue({
      merged: true,
      sha: 'merge-abc123',
      message: 'Merged',
    });

    // No platform available
    integrationService.getDecryptedToken
      .mockRejectedValueOnce(new Error('No Railway'))
      .mockRejectedValueOnce(new Error('No Vercel'));

    const result = await executor.execute({
      ...baseParams,
      deploymentPlatform: 'auto',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No deployment platform configured');
    expect(result.rollbackPerformed).toBe(false);
  });

  it('should run Supabase migrations when configured', async () => {
    setupFullSuccessMocks();

    const result = await executor.execute({
      ...baseParams,
      supabaseConfigured: true,
    });

    // Should complete successfully (migrations are a placeholder for now)
    expect(result.success).toBe(true);
  });

  it('should handle CLI failure during smoke tests', async () => {
    // Setup everything to succeed up to smoke tests
    githubService.mergePullRequest.mockResolvedValue({
      merged: true,
      sha: 'merge-abc123',
      message: 'Merged',
    });
    integrationService.getDecryptedToken.mockResolvedValue('railway-token');
    railwayService.triggerDeployment.mockResolvedValue({
      id: 'deploy-cli-fail',
      status: 'building',
      projectId: 'proj-integration',
      deploymentUrl: 'https://app.railway.app',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);
    deploymentMonitoring.getDeploymentDetail.mockResolvedValue({
      id: 'deploy-cli-fail',
      platform: 'railway',
      status: 'success',
      normalizedStatus: 'success',
      deploymentUrl: 'https://app.railway.app',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    } as any);

    // CLI session fails to spawn
    lifecycleService.spawnSession.mockRejectedValue(
      new Error('CLI process failed to start'),
    );

    // Rollback
    rollbackService.initiateAutoRollback.mockResolvedValue({
      id: 'rollback-3',
      status: 'completed',
      targetDeploymentId: 'deploy-prev',
      platform: 'railway',
      environment: 'production',
      reason: 'Smoke test CLI failure',
      createdAt: new Date().toISOString(),
    } as any);

    const result = await executor.execute(baseParams);

    // Smoke test failure should trigger rollback
    expect(result.success).toBe(false);
    expect(result.rollbackPerformed).toBe(true);
  });

  it('should handle deployment timeout and trigger rollback', async () => {
    githubService.mergePullRequest.mockResolvedValue({
      merged: true,
      sha: 'merge-abc123',
      message: 'Merged',
    });
    integrationService.getDecryptedToken.mockResolvedValue('railway-token');
    railwayService.triggerDeployment.mockResolvedValue({
      id: 'deploy-timeout',
      status: 'building',
      projectId: 'proj-integration',
      deploymentUrl: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    // Simulate timeout by returning building status until timeout
    deploymentMonitoring.getDeploymentDetail.mockResolvedValue({
      id: 'deploy-timeout',
      platform: 'railway',
      status: 'building',
      normalizedStatus: 'building',
      deploymentUrl: null,
      startedAt: new Date().toISOString(),
    } as any);

    // The monitor has its own timeout - but we'll mock the direct result
    // by overriding the monitor's behavior to return timeout
    // Since we're testing integration, the monitor will use its timeout
    // For this test, we'll mock the monitor directly
    const monitorService = (executor as any).deploymentMonitor;
    jest.spyOn(monitorService, 'waitForDeployment').mockResolvedValue({
      status: 'timeout',
      deploymentUrl: null,
      deployedAt: null,
      buildLogs: null,
      error: 'Deployment timed out after 600000ms',
    });

    rollbackService.initiateAutoRollback.mockResolvedValue({
      id: 'rollback-4',
      status: 'completed',
      targetDeploymentId: 'deploy-prev',
      platform: 'railway',
      environment: 'production',
      reason: 'Deployment timeout',
      createdAt: new Date().toISOString(),
    } as any);

    const result = await executor.execute(baseParams);

    expect(result.success).toBe(false);
    expect(result.rollbackPerformed).toBe(true);
  });

  it('should include all data needed for story completion in result', async () => {
    setupFullSuccessMocks();

    const result = await executor.execute(baseParams);

    // Required fields for story completion
    expect(result.deploymentUrl).toBeDefined();
    expect(result.deploymentPlatform).toBeDefined();
    expect(result.mergeCommitHash).toBeDefined();
    expect(result.smokeTestResults).toBeDefined();
    expect(result.rollbackPerformed).toBeDefined();
    expect(result.sessionId).toBeDefined();
    expect(result.durationMs).toBeDefined();
    expect(result.success).toBe(true);
  });
});
