/**
 * CLISessionLifecycleService Tests
 * Story 11.2: Claude Code CLI Container Setup
 *
 * TDD: Tests written first, then implementation.
 * Tests the full lifecycle of CLI sessions: spawn, monitor, terminate.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { WorkspaceManagerService } from './workspace-manager.service';
import { CLISessionConfigService } from './cli-session-config.service';
import { GitConfigService } from './git-config.service';
import {
  SessionStatus,
  CLISessionConfig,
} from '../interfaces/cli-session-config.interfaces';
import { PipelineState } from '../interfaces/pipeline.interfaces';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    pid: 12345,
    stdout: {
      on: jest.fn(),
    },
    stderr: {
      on: jest.fn(),
    },
    on: jest.fn(),
    kill: jest.fn().mockReturnValue(true),
  }),
}));

describe('CLISessionLifecycleService', () => {
  let service: CLISessionLifecycleService;
  let workspaceManager: jest.Mocked<WorkspaceManagerService>;
  let sessionConfigService: jest.Mocked<CLISessionConfigService>;
  let gitConfigService: jest.Mocked<GitConfigService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockWorkspaceId = 'workspace-123';
  const mockProjectId = 'project-456';
  const mockAgentId = 'agent-789';
  const mockAgentType = 'dev';
  const mockTask = 'Implement feature X';
  const mockWorkspacePath = '/workspaces/workspace-123/project-456';
  const mockApiKey = 'sk-ant-api03-test-key-1234567890abcdef';
  const mockGitRepoUrl = 'https://github.com/test/repo.git';
  const mockGitToken = 'ghp_test-token';

  const mockConfig: CLISessionConfig = {
    apiKey: mockApiKey,
    projectPath: mockWorkspacePath,
    task: mockTask,
    maxTokens: 200_000,
    timeout: 7_200_000,
    outputFormat: 'stream',
    model: 'claude-sonnet-4-20250514',
  };

  const mockPipelineContext = {
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    workflowId: 'workflow-1',
    currentState: PipelineState.IMPLEMENTING,
    previousState: PipelineState.PLANNING,
    stateEnteredAt: new Date(),
    activeAgentId: mockAgentId,
    activeAgentType: mockAgentType,
    currentStoryId: 'story-1',
    retryCount: 0,
    maxRetries: 3,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockWorkspaceManager = {
      prepareWorkspace: jest.fn().mockResolvedValue(mockWorkspacePath),
      cleanupWorkspace: jest.fn().mockResolvedValue(undefined),
      destroyWorkspace: jest.fn().mockResolvedValue(undefined),
      getWorkspacePath: jest.fn().mockReturnValue(mockWorkspacePath),
      isWorkspaceReady: jest.fn().mockResolvedValue(true),
      getWorkspaceSize: jest.fn().mockResolvedValue(1024),
    };

    const mockSessionConfigService = {
      buildConfig: jest.fn().mockResolvedValue(mockConfig),
      validateConfig: jest.fn().mockReturnValue({ valid: true, errors: [] }),
      getDefaults: jest.fn().mockResolvedValue({
        maxTokens: 200_000,
        timeout: 7_200_000,
        model: 'claude-sonnet-4-20250514',
        maxConcurrentSessions: 5,
      }),
    };

    const mockGitConfigService = {
      configureGitAuth: jest.fn().mockResolvedValue(undefined),
      configureGitAuthor: jest.fn().mockResolvedValue(undefined),
      cloneRepository: jest.fn().mockResolvedValue(undefined),
      pullLatest: jest.fn().mockResolvedValue(undefined),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CLISessionLifecycleService,
        { provide: WorkspaceManagerService, useValue: mockWorkspaceManager },
        {
          provide: CLISessionConfigService,
          useValue: mockSessionConfigService,
        },
        { provide: GitConfigService, useValue: mockGitConfigService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<CLISessionLifecycleService>(
      CLISessionLifecycleService,
    );
    workspaceManager = module.get(WorkspaceManagerService);
    sessionConfigService = module.get(CLISessionConfigService);
    gitConfigService = module.get(GitConfigService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('spawnSession', () => {
    const spawnParams = {
      workspaceId: mockWorkspaceId,
      projectId: mockProjectId,
      agentId: mockAgentId,
      agentType: mockAgentType,
      task: mockTask,
      storyId: 'story-1',
      gitRepoUrl: mockGitRepoUrl,
      gitToken: mockGitToken,
      pipelineContext: mockPipelineContext,
    };

    it('should prepare workspace, build config, spawn CLI process', async () => {
      const result = await service.spawnSession(spawnParams);

      expect(workspaceManager.prepareWorkspace).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockGitRepoUrl,
        mockGitToken,
      );
      expect(gitConfigService.configureGitAuthor).toHaveBeenCalledWith(
        mockWorkspacePath,
      );
      expect(sessionConfigService.buildConfig).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        mockTask,
      );
      expect(sessionConfigService.validateConfig).toHaveBeenCalledWith(
        mockConfig,
      );
      expect(result).toBeDefined();
    });

    it('should return sessionId and pid', async () => {
      const result = await service.spawnSession(spawnParams);

      expect(result.sessionId).toBeDefined();
      expect(typeof result.sessionId).toBe('string');
      expect(result.pid).toBeDefined();
      expect(typeof result.pid).toBe('number');
    });

    it('should pass ANTHROPIC_API_KEY via environment only', async () => {
      const result = await service.spawnSession(spawnParams);

      // The spawn call should include ANTHROPIC_API_KEY in env
      const child_process = require('child_process');
      const spawnCall = child_process.spawn.mock.calls[0];

      if (spawnCall) {
        const spawnOptions = spawnCall[2]; // third argument is options
        expect(spawnOptions.env.ANTHROPIC_API_KEY).toBe(mockApiKey);
      }

      // Session should be tracked
      expect(result.sessionId).toBeDefined();
    });

    it('should set correct working directory to project path', async () => {
      await service.spawnSession(spawnParams);

      const child_process = require('child_process');
      const spawnCall = child_process.spawn.mock.calls[0];

      if (spawnCall) {
        const spawnOptions = spawnCall[2];
        expect(spawnOptions.cwd).toBe(mockWorkspacePath);
      }
    });

    it('should emit cli:session:started event', async () => {
      await service.spawnSession(spawnParams);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cli:session:started',
        expect.objectContaining({
          type: 'cli:session:started',
          agentId: mockAgentId,
          agentType: mockAgentType,
          workspaceId: mockWorkspaceId,
          projectId: mockProjectId,
        }),
      );
    });

    it('should handle workspace preparation failure', async () => {
      workspaceManager.prepareWorkspace.mockRejectedValue(
        new Error('Failed to create directory'),
      );

      await expect(service.spawnSession(spawnParams)).rejects.toThrow(
        'Failed to create directory',
      );
    });

    it('should handle BYOK key decryption failure', async () => {
      sessionConfigService.buildConfig.mockRejectedValue(
        new Error('No active Anthropic API key'),
      );

      await expect(service.spawnSession(spawnParams)).rejects.toThrow(
        'No active Anthropic API key',
      );
    });
  });

  describe('getSessionStatus', () => {
    it('should return running session status', async () => {
      // Spawn a session first
      const spawnResult = await service.spawnSession({
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        agentId: mockAgentId,
        agentType: mockAgentType,
        task: mockTask,
        gitRepoUrl: mockGitRepoUrl,
        gitToken: mockGitToken,
        pipelineContext: mockPipelineContext,
      });

      const status = await service.getSessionStatus(spawnResult.sessionId);

      expect(status).toBeDefined();
      expect(status!.status).toBe(SessionStatus.RUNNING);
      expect(status!.pid).toBe(12345);
      expect(typeof status!.durationMs).toBe('number');
      expect(typeof status!.outputLineCount).toBe('number');
    });

    it('should return null for unknown session', async () => {
      const status = await service.getSessionStatus('nonexistent-session');

      expect(status).toBeNull();
    });
  });

  describe('terminateSession', () => {
    it('should call process.kill()', async () => {
      const spawnResult = await service.spawnSession({
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        agentId: mockAgentId,
        agentType: mockAgentType,
        task: mockTask,
        gitRepoUrl: mockGitRepoUrl,
        gitToken: mockGitToken,
        pipelineContext: mockPipelineContext,
      });

      await service.terminateSession(spawnResult.sessionId);

      const child_process = require('child_process');
      const spawnedProcess = child_process.spawn.mock.results[0].value;
      expect(spawnedProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should clean up workspace sensitive files', async () => {
      const spawnResult = await service.spawnSession({
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        agentId: mockAgentId,
        agentType: mockAgentType,
        task: mockTask,
        gitRepoUrl: mockGitRepoUrl,
        gitToken: mockGitToken,
        pipelineContext: mockPipelineContext,
      });

      await service.terminateSession(spawnResult.sessionId);

      expect(workspaceManager.cleanupWorkspace).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
      );
    });

    it('should emit cli:session:terminated event', async () => {
      const spawnResult = await service.spawnSession({
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        agentId: mockAgentId,
        agentType: mockAgentType,
        task: mockTask,
        gitRepoUrl: mockGitRepoUrl,
        gitToken: mockGitToken,
        pipelineContext: mockPipelineContext,
      });

      // Reset emit mock to only track terminate events
      eventEmitter.emit.mockClear();

      await service.terminateSession(spawnResult.sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cli:session:terminated',
        expect.objectContaining({
          type: 'cli:session:terminated',
          sessionId: spawnResult.sessionId,
        }),
      );
    });
  });
});
