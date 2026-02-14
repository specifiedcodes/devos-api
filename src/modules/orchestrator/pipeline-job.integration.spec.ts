/**
 * Pipeline Job Integration Tests
 * Story 11.3: Agent-to-CLI Execution Pipeline
 *
 * Integration smoke tests for the full pipeline job execution flow.
 * Tests coordination between all Story 11.3 services with mocked CLI process.
 */

// Mock @octokit/rest to avoid ESM import issues in Jest (needed after Story 11.4 imports)
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PipelineJobHandlerService } from './services/pipeline-job-handler.service';
import { CLISessionLifecycleService } from './services/cli-session-lifecycle.service';
import { TaskContextAssemblerService } from './services/task-context-assembler.service';
import { PipelineBranchManagerService } from './services/pipeline-branch-manager.service';
import { CLIOutputStreamService } from './services/cli-output-stream.service';
import { SessionHealthMonitorService } from './services/session-health-monitor.service';
import { WorkspaceManagerService } from './services/workspace-manager.service';
import { RedisService } from '../redis/redis.service';
import { CliSessionsService } from '../cli-sessions/cli-sessions.service';
import {
  PipelineJobData,
  PipelineJobResult,
} from './interfaces/pipeline-job.interfaces';

describe('Pipeline Job Integration', () => {
  let handler: PipelineJobHandlerService;
  let lifecycleService: jest.Mocked<CLISessionLifecycleService>;
  let branchManager: jest.Mocked<PipelineBranchManagerService>;
  let outputStream: CLIOutputStreamService;
  let healthMonitor: SessionHealthMonitorService;
  let redisService: jest.Mocked<RedisService>;
  let eventEmitter: EventEmitter2;

  const baseJobData: PipelineJobData = {
    pipelineProjectId: 'proj-int-1',
    pipelineWorkflowId: 'wf-int-1',
    phase: 'implementing',
    storyId: '11-3',
    agentType: 'dev',
    workspaceId: 'ws-int-1',
    userId: 'user-int-1',
  };

  beforeEach(async () => {
    jest.useFakeTimers({ advanceTimers: true });

    eventEmitter = new EventEmitter2();

    redisService = {
      del: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      expire: jest.fn().mockResolvedValue(true),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineJobHandlerService,
        {
          provide: CLISessionLifecycleService,
          useValue: {
            spawnSession: jest.fn().mockResolvedValue({
              sessionId: 'int-session-1',
              pid: 99999,
            }),
            getSessionStatus: jest.fn().mockResolvedValue({
              status: 'completed',
              pid: null,
              outputLineCount: 100,
              durationMs: 60000,
            }),
            terminateSession: jest.fn().mockResolvedValue(undefined),
          },
        },
        TaskContextAssemblerService,
        {
          provide: PipelineBranchManagerService,
          useValue: {
            createFeatureBranch: jest.fn().mockResolvedValue('devos/dev/11-3'),
            getCurrentBranch: jest.fn().mockResolvedValue('devos/dev/11-3'),
            branchExists: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: CLIOutputStreamService,
          useFactory: () =>
            new CLIOutputStreamService(
              redisService as any,
              eventEmitter,
              { createSession: jest.fn().mockResolvedValue({ id: 'int-session-1' }) } as any,
            ),
        },
        {
          provide: SessionHealthMonitorService,
          useFactory: () => new SessionHealthMonitorService(eventEmitter),
        },
        {
          provide: WorkspaceManagerService,
          useValue: {
            getWorkspacePath: jest.fn().mockReturnValue('/workspaces/ws-int-1/proj-int-1'),
            prepareWorkspace: jest.fn().mockResolvedValue('/workspaces/ws-int-1/proj-int-1'),
            cleanupWorkspace: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
        {
          provide: CliSessionsService,
          useValue: {
            createSession: jest.fn().mockResolvedValue({ id: 'int-session-1' }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(''),
          },
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
      ],
    }).compile();

    handler = module.get<PipelineJobHandlerService>(PipelineJobHandlerService);
    lifecycleService = module.get(CLISessionLifecycleService) as jest.Mocked<CLISessionLifecycleService>;
    branchManager = module.get(PipelineBranchManagerService) as jest.Mocked<PipelineBranchManagerService>;
    outputStream = module.get<CLIOutputStreamService>(CLIOutputStreamService);
    healthMonitor = module.get<SessionHealthMonitorService>(SessionHealthMonitorService);
  });

  afterEach(() => {
    jest.useRealTimers();
    outputStream.onModuleDestroy();
    healthMonitor.onModuleDestroy();
  });

  it('should execute full pipeline job flow: session, stream, result', async () => {
    // Simulate session completion
    setTimeout(() => {
      eventEmitter.emit('cli:session:completed', {
        type: 'cli:session:completed',
        sessionId: 'int-session-1',
        agentId: 'pipeline-dev-test',
        agentType: 'dev',
        workspaceId: 'ws-int-1',
        projectId: 'proj-int-1',
        timestamp: new Date(),
        metadata: { exitCode: 0, outputLineCount: 100 },
      });
    }, 50);

    const result = await handler.handlePipelineJob(baseJobData);

    expect(result).toBeDefined();
    expect(result.sessionId).toBe('int-session-1');
    expect(result.exitCode).toBe(0);
    expect(result.error).toBeNull();
    expect(result.branch).toBe('devos/dev/11-3');
  });

  it('should create feature branch for dev agent', async () => {
    setTimeout(() => {
      eventEmitter.emit('cli:session:completed', {
        type: 'cli:session:completed',
        sessionId: 'int-session-1',
        agentId: 'pipeline-dev-test',
        agentType: 'dev',
        workspaceId: 'ws-int-1',
        projectId: 'proj-int-1',
        timestamp: new Date(),
        metadata: { exitCode: 0 },
      });
    }, 50);

    await handler.handlePipelineJob(baseJobData);

    expect(branchManager.createFeatureBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'dev',
        storyId: '11-3',
      }),
    );
  });

  it('should handle CLI crash and return error result', async () => {
    setTimeout(() => {
      eventEmitter.emit('cli:session:failed', {
        type: 'cli:session:failed',
        sessionId: 'int-session-1',
        agentId: 'pipeline-dev-test',
        agentType: 'dev',
        workspaceId: 'ws-int-1',
        projectId: 'proj-int-1',
        timestamp: new Date(),
        metadata: { exitCode: 1, error: 'Process crashed' },
      });
    }, 50);

    const result = await handler.handlePipelineJob(baseJobData);

    expect(result.exitCode).toBe(1);
    expect(result.error).toBeDefined();
    expect(result.error).not.toBeNull();
  });

  it('should detect session stall after 10+ minutes of no activity', () => {
    healthMonitor.startMonitoring('stall-test-session');

    // Advance past stall threshold
    jest.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(healthMonitor.isStalled('stall-test-session')).toBe(true);

    healthMonitor.stopMonitoring('stall-test-session');
  });

  it('should buffer and retrieve output from Redis', async () => {
    outputStream.startStreaming({
      sessionId: 'buffer-test',
      workspaceId: 'ws-int-1',
      agentId: 'agent-1',
      agentType: 'dev',
    });

    outputStream.onOutput('buffer-test', Buffer.from('test line 1\ntest line 2\n'));

    jest.advanceTimersByTime(100);

    // Verify Redis was called with output
    expect(redisService.set).toHaveBeenCalledWith(
      'cli:output:buffer-test',
      expect.any(String),
      3600,
    );

    await outputStream.stopStreaming('buffer-test');
  });

  it('should not create branch for planner agent', async () => {
    const plannerJob: PipelineJobData = {
      ...baseJobData,
      agentType: 'planner',
      phase: 'planning',
      storyId: null,
    };

    setTimeout(() => {
      eventEmitter.emit('cli:session:completed', {
        type: 'cli:session:completed',
        sessionId: 'int-session-1',
        agentId: 'pipeline-planner-test',
        agentType: 'planner',
        workspaceId: 'ws-int-1',
        projectId: 'proj-int-1',
        timestamp: new Date(),
        metadata: { exitCode: 0 },
      });
    }, 50);

    const result = await handler.handlePipelineJob(plannerJob);

    expect(branchManager.createFeatureBranch).not.toHaveBeenCalled();
    expect(result.branch).toBeNull();
  });

  it('should workspace preparation failure throws error', async () => {
    const workspaceManager = {
      prepareWorkspace: jest.fn().mockRejectedValue(new Error('Disk full')),
    };

    // Replace workspace manager
    (handler as any).workspaceManager = workspaceManager;

    await expect(handler.handlePipelineJob(baseJobData)).rejects.toThrow('Disk full');
  });
});
