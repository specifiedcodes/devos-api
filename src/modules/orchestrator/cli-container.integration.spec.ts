/**
 * CLI Container Integration Tests
 * Story 11.2: Claude Code CLI Container Setup
 *
 * Tests the full lifecycle of CLI sessions with mocked CLI process
 * and filesystem. Verifies workspace isolation, BYOK key injection,
 * Git setup, and cleanup.
 */

// Must mock TypeORM entities/decorators BEFORE any imports that use them
// Mock @nestjs/typeorm to prevent deep import chain issues
jest.mock('@nestjs/typeorm', () => ({
  TypeOrmModule: {
    forFeature: jest.fn().mockReturnValue({ module: class {} }),
    forRoot: jest.fn().mockReturnValue({ module: class {} }),
  },
  InjectRepository: () => () => {},
  getRepositoryToken: (entity: any) => `${entity?.name || 'Unknown'}Repository`,
}));

jest.mock('typeorm', () => {
  const noop = () => () => {};
  const noopDecorator = () => (target: any, key?: string) => {};
  const classDecorator = () => (target: any) => target;
  return {
    Entity: classDecorator,
    Column: noopDecorator,
    PrimaryGeneratedColumn: noopDecorator,
    PrimaryColumn: noopDecorator,
    CreateDateColumn: noopDecorator,
    UpdateDateColumn: noopDecorator,
    DeleteDateColumn: noopDecorator,
    ManyToOne: noop,
    OneToMany: noop,
    ManyToMany: noop,
    OneToOne: noop,
    JoinColumn: noopDecorator,
    JoinTable: noopDecorator,
    Index: classDecorator,
    Unique: classDecorator,
    BeforeInsert: noopDecorator,
    BeforeUpdate: noopDecorator,
    AfterInsert: noopDecorator,
    AfterUpdate: noopDecorator,
    Repository: class {},
    ObjectType: class {},
    EntityManager: class {},
    SelectQueryBuilder: class {},
    In: jest.fn(),
    Not: jest.fn(),
    IsNull: jest.fn(),
    MoreThan: jest.fn(),
    LessThan: jest.fn(),
    Between: jest.fn(),
    Like: jest.fn(),
    getRepository: jest.fn(),
  };
});

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue([]),
  statSync: jest.fn().mockReturnValue({ size: 1024 }),
  unlinkSync: jest.fn(),
  promises: {
    readdir: jest.fn(),
    stat: jest.fn(),
    rm: jest.fn(),
    unlink: jest.fn(),
    access: jest.fn(),
  },
}));

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn().mockImplementation((cmd: any, opts: any, callback: any) => {
    const cb = typeof opts === 'function' ? opts : callback;
    if (cb) cb(null, '', '');
    return { on: jest.fn() };
  }),
  spawn: jest.fn().mockReturnValue({
    pid: 12345,
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
    kill: jest.fn().mockReturnValue(true),
  }),
}));

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    models: { list: jest.fn().mockResolvedValue({ data: [] }) },
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CLISessionLifecycleService } from './services/cli-session-lifecycle.service';
import { CLISessionConfigService } from './services/cli-session-config.service';
import { CLIKeyBridgeService } from './services/cli-key-bridge.service';
import { WorkspaceManagerService } from './services/workspace-manager.service';
import { GitConfigService } from './services/git-config.service';
import { BYOKKeyService } from '../byok/services/byok-key.service';
import {
  SessionStatus,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MODEL,
} from './interfaces/cli-session-config.interfaces';
import { PipelineState } from './interfaces/pipeline.interfaces';
import * as fs from 'fs';
import * as child_process from 'child_process';

describe('CLI Container Integration Tests', () => {
  let lifecycleService: CLISessionLifecycleService;
  let configService: CLISessionConfigService;
  let keyBridgeService: CLIKeyBridgeService;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockApiKey = 'sk-ant-api03-test-key-for-integration-testing-1234567890';
  const mockWorkspaceId = 'ws-integration-test';
  const mockProjectId = 'proj-integration-test';
  const mockBasePath = '/workspaces';

  const mockPipelineContext = {
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    workflowId: 'workflow-integration',
    currentState: PipelineState.IMPLEMENTING,
    previousState: PipelineState.PLANNING,
    stateEnteredAt: new Date(),
    activeAgentId: 'agent-1',
    activeAgentType: 'dev',
    currentStoryId: 'story-1',
    retryCount: 0,
    maxRetries: 3,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup fs mocks for workspace operations
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
      if (p.includes('.git')) return false;
      return false;
    });

    const mockBYOKKeyService = {
      getActiveKeyForProvider: jest.fn().mockResolvedValue(mockApiKey),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CLI_WORKSPACE_BASE_PATH: mockBasePath,
          CLI_MAX_SESSION_DURATION_MS: DEFAULT_TIMEOUT_MS,
          CLI_MAX_CONCURRENT_SESSIONS: 5,
          CLI_DEFAULT_MODEL: DEFAULT_MODEL,
          GIT_AUTHOR_NAME: 'DevOS Agent',
          GIT_AUTHOR_EMAIL: 'agent@devos.ai',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CLISessionLifecycleService,
        CLISessionConfigService,
        CLIKeyBridgeService,
        WorkspaceManagerService,
        GitConfigService,
        { provide: BYOKKeyService, useValue: mockBYOKKeyService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    lifecycleService = module.get(CLISessionLifecycleService);
    configService = module.get(CLISessionConfigService);
    keyBridgeService = module.get(CLIKeyBridgeService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('Full lifecycle: spawn -> monitor -> terminate', () => {
    it('should successfully spawn, monitor, and terminate a session', async () => {
      const spawnResult = await lifecycleService.spawnSession({
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        agentId: 'agent-1',
        agentType: 'dev',
        task: 'Implement login feature',
        gitRepoUrl: 'https://github.com/test/repo.git',
        gitToken: 'ghp_test-token',
        pipelineContext: mockPipelineContext,
      });

      expect(spawnResult.sessionId).toBeDefined();
      expect(spawnResult.pid).toBeDefined();

      const status = await lifecycleService.getSessionStatus(spawnResult.sessionId);
      expect(status).toBeDefined();
      expect(status!.status).toBe(SessionStatus.RUNNING);

      await lifecycleService.terminateSession(spawnResult.sessionId);

      const postStatus = await lifecycleService.getSessionStatus(spawnResult.sessionId);
      expect(postStatus).toBeNull();
    });
  });

  describe('Workspace isolation: two sessions in separate directories', () => {
    it('should create separate workspaces for different projects', async () => {
      const session1 = await lifecycleService.spawnSession({
        workspaceId: mockWorkspaceId,
        projectId: 'project-A',
        agentId: 'agent-1',
        agentType: 'dev',
        task: 'Task A',
        gitRepoUrl: 'https://github.com/test/repo-a.git',
        pipelineContext: mockPipelineContext,
      });

      const session2 = await lifecycleService.spawnSession({
        workspaceId: mockWorkspaceId,
        projectId: 'project-B',
        agentId: 'agent-2',
        agentType: 'qa',
        task: 'Task B',
        gitRepoUrl: 'https://github.com/test/repo-b.git',
        pipelineContext: { ...mockPipelineContext, projectId: 'project-B' },
      });

      expect(session1.sessionId).not.toBe(session2.sessionId);

      const status1 = await lifecycleService.getSessionStatus(session1.sessionId);
      const status2 = await lifecycleService.getSessionStatus(session2.sessionId);

      expect(status1).toBeDefined();
      expect(status2).toBeDefined();

      await lifecycleService.terminateSession(session1.sessionId);
      await lifecycleService.terminateSession(session2.sessionId);
    });
  });

  describe('BYOK key injection: key available in env, not on disk', () => {
    it('should pass API key via environment variable to spawned process', async () => {
      const result = await lifecycleService.spawnSession({
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        agentId: 'agent-1',
        agentType: 'dev',
        task: 'Test BYOK key injection',
        gitRepoUrl: 'https://github.com/test/repo.git',
        pipelineContext: mockPipelineContext,
      });

      const spawnCall = (child_process.spawn as unknown as jest.Mock).mock.calls[0];
      expect(spawnCall).toBeDefined();
      const spawnOptions = spawnCall[2];
      expect(spawnOptions.env.ANTHROPIC_API_KEY).toBe(mockApiKey);

      expect(fs.mkdirSync).not.toHaveBeenCalledWith(
        expect.stringContaining('ANTHROPIC'),
      );

      await lifecycleService.terminateSession(result.sessionId);
    });
  });

  describe('Git setup: clone and configure author', () => {
    it('should configure Git author after workspace preparation', async () => {
      const result = await lifecycleService.spawnSession({
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        agentId: 'agent-1',
        agentType: 'dev',
        task: 'Test Git setup',
        gitRepoUrl: 'https://github.com/test/repo.git',
        gitToken: 'ghp_test-token',
        pipelineContext: mockPipelineContext,
      });

      const execCalls = (child_process.exec as unknown as jest.Mock).mock.calls;
      expect(execCalls.length).toBeGreaterThan(0);

      const authorCalls = execCalls.filter(
        (call: any[]) =>
          call[0].includes('git config user.name') ||
          call[0].includes('git config user.email'),
      );
      expect(authorCalls.length).toBeGreaterThanOrEqual(2);

      await lifecycleService.terminateSession(result.sessionId);
    });
  });

  describe('Cleanup: sensitive files removed after session end', () => {
    it('should clean up sensitive files on terminate', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: '.env', isFile: () => true, isDirectory: () => false },
        { name: 'credentials.json', isFile: () => true, isDirectory: () => false },
        { name: 'index.ts', isFile: () => true, isDirectory: () => false },
      ]);

      const result = await lifecycleService.spawnSession({
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        agentId: 'agent-1',
        agentType: 'dev',
        task: 'Test cleanup',
        gitRepoUrl: 'https://github.com/test/repo.git',
        pipelineContext: mockPipelineContext,
      });

      (fs.unlinkSync as jest.Mock).mockClear();
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: '.env', isFile: () => true, isDirectory: () => false },
        { name: 'credentials.json', isFile: () => true, isDirectory: () => false },
        { name: 'index.ts', isFile: () => true, isDirectory: () => false },
      ]);

      await lifecycleService.terminateSession(result.sessionId);

      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('Event emission', () => {
    it('should emit started and terminated events', async () => {
      const result = await lifecycleService.spawnSession({
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        agentId: 'agent-1',
        agentType: 'dev',
        task: 'Test events',
        gitRepoUrl: 'https://github.com/test/repo.git',
        pipelineContext: mockPipelineContext,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cli:session:started',
        expect.objectContaining({
          type: 'cli:session:started',
          sessionId: result.sessionId,
        }),
      );

      eventEmitter.emit.mockClear();

      await lifecycleService.terminateSession(result.sessionId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cli:session:terminated',
        expect.objectContaining({
          type: 'cli:session:terminated',
          sessionId: result.sessionId,
        }),
      );
    });
  });

  describe('Config validation', () => {
    it('should validate config before spawning', () => {
      const validConfig = {
        apiKey: mockApiKey,
        projectPath: '/workspaces/ws-1/proj-1',
        task: 'Test task',
        maxTokens: DEFAULT_MAX_TOKENS,
        timeout: DEFAULT_TIMEOUT_MS,
        outputFormat: 'stream' as const,
        model: DEFAULT_MODEL,
      };

      const result = configService.validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject config with missing required fields', () => {
      const invalidConfig = {
        apiKey: '',
        projectPath: '',
        task: '',
        maxTokens: 0,
        timeout: 0,
        outputFormat: 'stream' as const,
      };

      const result = configService.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Key bridge integration', () => {
    it('should retrieve key from BYOK service', async () => {
      const key = await keyBridgeService.getAnthropicKey(mockWorkspaceId);
      expect(key).toBe(mockApiKey);
    });
  });
});
