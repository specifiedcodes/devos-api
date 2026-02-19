/**
 * AgentSandboxService Tests
 *
 * Story 18-3: Agent Sandbox Testing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { AgentSandboxService } from '../agent-sandbox.service';
import { SandboxToolExecutorService } from '../sandbox-tool-executor.service';
import { CustomAgentsService } from '../custom-agents.service';
import {
  AgentSandboxSession,
  SandboxSessionStatus,
  SandboxSampleProject,
} from '../../../database/entities/agent-sandbox-session.entity';
import {
  AgentSandboxToolCall,
  SandboxToolCallStatus,
} from '../../../database/entities/agent-sandbox-tool-call.entity';
import { AgentTestScenario } from '../../../database/entities/agent-test-scenario.entity';
import { AgentDefinition, AgentDefinitionCategory } from '../../../database/entities/agent-definition.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { CreateSandboxSessionDto } from '../dto/create-sandbox-session.dto';

describe('AgentSandboxService', () => {
  let service: AgentSandboxService;
  let sandboxRepo: jest.Mocked<Repository<AgentSandboxSession>>;
  let toolCallRepo: jest.Mocked<Repository<AgentSandboxToolCall>>;
  let scenarioRepo: jest.Mocked<Repository<AgentTestScenario>>;
  let agentDefRepo: jest.Mocked<Repository<AgentDefinition>>;
  let memberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let toolExecutor: jest.Mocked<SandboxToolExecutorService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockDefinitionId = '33333333-3333-3333-3333-333333333333';
  const mockSessionId = '44444444-4444-4444-4444-444444444444';

  const mockMember: Partial<WorkspaceMember> = {
    workspaceId: mockWorkspaceId,
    userId: mockUserId,
    role: WorkspaceRole.DEVELOPER,
  };

  const mockAgentDef: Partial<AgentDefinition> = {
    id: mockDefinitionId,
    workspaceId: mockWorkspaceId,
    name: 'test-agent',
    displayName: 'Test Agent',
    isActive: true,
    definition: {
      role: 'Test role',
      system_prompt: 'Test prompt',
      model_preferences: { preferred: 'claude-sonnet-4-20250514' },
      tools: { allowed: ['github:read_files'], denied: [] },
    },
  };

  const mockSession: Partial<AgentSandboxSession> = {
    id: mockSessionId,
    workspaceId: mockWorkspaceId,
    agentDefinitionId: mockDefinitionId,
    userId: mockUserId,
    sampleProject: SandboxSampleProject.NEXTJS,
    timeoutMinutes: 10,
    maxToolCalls: 50,
    maxTokens: 100000,
    status: SandboxSessionStatus.PENDING,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    tokensInput: 0,
    tokensOutput: 0,
    toolCallsCount: 0,
    estimatedCostCents: 0,
    sandboxConfig: {},
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentSandboxService,
        {
          provide: getRepositoryToken(AgentSandboxSession),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AgentSandboxToolCall),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AgentTestScenario),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AgentDefinition),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: CustomAgentsService,
          useValue: {},
        },
        {
          provide: SandboxToolExecutorService,
          useValue: {
            executeTool: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AgentSandboxService>(AgentSandboxService);
    sandboxRepo = module.get(getRepositoryToken(AgentSandboxSession)) as jest.Mocked<Repository<AgentSandboxSession>>;
    toolCallRepo = module.get(getRepositoryToken(AgentSandboxToolCall)) as jest.Mocked<Repository<AgentSandboxToolCall>>;
    scenarioRepo = module.get(getRepositoryToken(AgentTestScenario)) as jest.Mocked<Repository<AgentTestScenario>>;
    agentDefRepo = module.get(getRepositoryToken(AgentDefinition)) as jest.Mocked<Repository<AgentDefinition>>;
    memberRepo = module.get(getRepositoryToken(WorkspaceMember)) as jest.Mocked<Repository<WorkspaceMember>>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
    toolExecutor = module.get(SandboxToolExecutorService) as jest.Mocked<SandboxToolExecutorService>;
  });

  describe('createSession', () => {
    const dto: CreateSandboxSessionDto = {
      sampleProject: SandboxSampleProject.NEXTJS,
      timeoutMinutes: 10,
    };

    beforeEach(() => {
      agentDefRepo.findOne.mockResolvedValue(mockAgentDef as AgentDefinition);
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      sandboxRepo.findOne.mockResolvedValue(null);
      sandboxRepo.create.mockReturnValue(mockSession as AgentSandboxSession);
      sandboxRepo.save.mockResolvedValue(mockSession as AgentSandboxSession);
    });

    it('should create a new sandbox session', async () => {
      const result = await service.createSession(
        mockWorkspaceId,
        mockDefinitionId,
        mockUserId,
        dto,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(mockSessionId);
      expect(sandboxRepo.save).toHaveBeenCalled();
    });

    it('should emit sandbox:created event', async () => {
      await service.createSession(mockWorkspaceId, mockDefinitionId, mockUserId, dto);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sandbox:created',
        expect.objectContaining({
          sessionId: mockSessionId,
          workspaceId: mockWorkspaceId,
        }),
      );
    });

    it('should throw NotFoundException for non-existent agent definition', async () => {
      agentDefRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createSession(mockWorkspaceId, mockDefinitionId, mockUserId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for inactive agent', async () => {
      agentDefRepo.findOne.mockResolvedValue({
        ...mockAgentDef,
        isActive: false,
      } as AgentDefinition);

      await expect(
        service.createSession(mockWorkspaceId, mockDefinitionId, mockUserId, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException for non-member user', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createSession(mockWorkspaceId, mockDefinitionId, mockUserId, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if running session already exists', async () => {
      sandboxRepo.findOne.mockResolvedValue({
        ...mockSession,
        status: SandboxSessionStatus.RUNNING,
      } as AgentSandboxSession);

      await expect(
        service.createSession(mockWorkspaceId, mockDefinitionId, mockUserId, dto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('startSession', () => {
    beforeEach(() => {
      sandboxRepo.findOne.mockResolvedValue({
        ...mockSession,
        userId: mockUserId,
      } as AgentSandboxSession);
      sandboxRepo.save.mockResolvedValue({
        ...mockSession,
        status: SandboxSessionStatus.RUNNING,
      } as AgentSandboxSession);
    });

    it('should start a pending session', async () => {
      await service.startSession(mockSessionId, mockUserId);

      expect(sandboxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SandboxSessionStatus.RUNNING,
          startedAt: expect.any(Date),
        }),
      );
    });

    it('should emit sandbox:started event', async () => {
      await service.startSession(mockSessionId, mockUserId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sandbox:started',
        expect.objectContaining({
          sessionId: mockSessionId,
        }),
      );
    });

    it('should throw ForbiddenException for non-owner user', async () => {
      await expect(
        service.startSession(mockSessionId, 'other-user-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for non-pending session', async () => {
      sandboxRepo.findOne.mockResolvedValue({
        ...mockSession,
        userId: mockUserId,
        status: SandboxSessionStatus.RUNNING,
      } as AgentSandboxSession);

      await expect(
        service.startSession(mockSessionId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired session', async () => {
      sandboxRepo.findOne.mockResolvedValue({
        ...mockSession,
        userId: mockUserId,
        expiresAt: new Date(Date.now() - 1000), // Already expired
      } as AgentSandboxSession);

      await expect(
        service.startSession(mockSessionId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelSession', () => {
    beforeEach(() => {
      sandboxRepo.findOne.mockResolvedValue({
        ...mockSession,
        userId: mockUserId,
        status: SandboxSessionStatus.RUNNING,
      } as AgentSandboxSession);
      sandboxRepo.save.mockResolvedValue({
        ...mockSession,
        status: SandboxSessionStatus.CANCELLED,
      } as AgentSandboxSession);
    });

    it('should cancel a running session', async () => {
      await service.cancelSession(mockSessionId, mockUserId);

      expect(sandboxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SandboxSessionStatus.CANCELLED,
          completedAt: expect.any(Date),
        }),
      );
    });

    it('should allow workspace admin to cancel any session', async () => {
      const adminUserId = 'admin-user-id';
      memberRepo.findOne.mockResolvedValue({
        workspaceId: mockWorkspaceId,
        userId: adminUserId,
        role: WorkspaceRole.ADMIN,
      } as WorkspaceMember);

      sandboxRepo.findOne.mockResolvedValue({
        ...mockSession,
        userId: mockUserId, // Different user
        status: SandboxSessionStatus.RUNNING,
      } as AgentSandboxSession);

      await service.cancelSession(mockSessionId, adminUserId);

      expect(sandboxRepo.save).toHaveBeenCalled();
    });

    it('should emit sandbox:complete event with cancelled status', async () => {
      await service.cancelSession(mockSessionId, mockUserId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sandbox:complete',
        expect.objectContaining({
          sessionId: mockSessionId,
          status: SandboxSessionStatus.CANCELLED,
        }),
      );
    });
  });

  describe('getSessionStatus', () => {
    it('should return session status', async () => {
      sandboxRepo.findOne.mockResolvedValue(mockSession as AgentSandboxSession);

      const result = await service.getSessionStatus(mockSessionId);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockSessionId);
      expect(result.status).toBe(SandboxSessionStatus.PENDING);
    });

    it('should throw NotFoundException for non-existent session', async () => {
      sandboxRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getSessionStatus(mockSessionId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSessionResults', () => {
    beforeEach(() => {
      sandboxRepo.findOne.mockResolvedValue(mockSession as AgentSandboxSession);
      toolCallRepo.find.mockResolvedValue([]);
    });

    it('should return session results with tool calls', async () => {
      const mockToolCall: Partial<AgentSandboxToolCall> = {
        id: 'tool-call-id',
        sandboxSessionId: mockSessionId,
        toolCategory: 'github',
        toolName: 'read_files',
        toolInput: { paths: ['test.ts'] },
        toolOutput: { files: {} },
        status: SandboxToolCallStatus.SUCCESS,
        durationMs: 100,
        createdAt: new Date(),
      };

      toolCallRepo.find.mockResolvedValue([mockToolCall as AgentSandboxToolCall]);

      const result = await service.getSessionResults(mockSessionId);

      expect(result).toBeDefined();
      expect(result.session.id).toBe(mockSessionId);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.summary).toBeDefined();
    });

    it('should calculate summary metrics correctly', async () => {
      const toolCalls: Partial<AgentSandboxToolCall>[] = [
        { status: SandboxToolCallStatus.SUCCESS },
        { status: SandboxToolCallStatus.SUCCESS },
        { status: SandboxToolCallStatus.DENIED },
        { status: SandboxToolCallStatus.ERROR },
      ].map((s, i) => ({
        id: `tool-call-${i}`,
        sandboxSessionId: mockSessionId,
        toolCategory: 'test',
        toolName: 'test',
        toolInput: {},
        status: s.status,
        durationMs: 100,
        createdAt: new Date(),
      }));

      toolCallRepo.find.mockResolvedValue(toolCalls as AgentSandboxToolCall[]);

      const result = await service.getSessionResults(mockSessionId);

      expect(result.summary.successRate).toBe(0.5);
      expect(result.summary.deniedCount).toBe(1);
      expect(result.summary.errorCount).toBe(1);
    });
  });

  describe('executeToolCall', () => {
    const runningSession: Partial<AgentSandboxSession> = {
      ...mockSession,
      status: SandboxSessionStatus.RUNNING,
      toolCallsCount: 0,
      maxToolCalls: 50,
    };

    beforeEach(() => {
      sandboxRepo.findOne.mockResolvedValue(runningSession as AgentSandboxSession);
      agentDefRepo.findOne.mockResolvedValue(mockAgentDef as AgentDefinition);
      toolCallRepo.create.mockReturnValue({
        id: 'tool-call-id',
        sandboxSessionId: mockSessionId,
        toolCategory: 'github',
        toolName: 'read_files',
        toolInput: {},
        status: SandboxToolCallStatus.PENDING,
      } as AgentSandboxToolCall);
      toolCallRepo.save.mockResolvedValue({} as AgentSandboxToolCall);
      sandboxRepo.save.mockResolvedValue(runningSession as AgentSandboxSession);

      toolExecutor.executeTool.mockResolvedValue({
        success: true,
        status: SandboxToolCallStatus.SUCCESS,
        output: { files: {} },
        durationMs: 100,
      });
    });

    it('should execute tool and return result', async () => {
      const result = await service.executeToolCall(
        mockSessionId,
        'github',
        'read_files',
        { paths: ['test.ts'] },
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(SandboxToolCallStatus.SUCCESS);
    });

    it('should emit tool_call and tool_result events', async () => {
      await service.executeToolCall(mockSessionId, 'github', 'read_files', {});

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sandbox:tool_call',
        expect.objectContaining({
          sessionId: mockSessionId,
          toolCategory: 'github',
          toolName: 'read_files',
        }),
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sandbox:tool_result',
        expect.objectContaining({
          sessionId: mockSessionId,
        }),
      );
    });

    it('should increment tool call count', async () => {
      // Reset the mock
      sandboxRepo.save.mockClear();

      await service.executeToolCall(mockSessionId, 'github', 'read_files', {});

      // Check that save was called with incremented count
      expect(sandboxRepo.save).toHaveBeenCalled();
      const saveCall = sandboxRepo.save.mock.calls[0][0];
      expect(saveCall.toolCallsCount).toBeGreaterThanOrEqual(1);
    });

    it('should deny tool call when limit exceeded', async () => {
      sandboxRepo.findOne.mockResolvedValue({
        ...runningSession,
        toolCallsCount: 50,
      } as AgentSandboxSession);

      const result = await service.executeToolCall(
        mockSessionId,
        'github',
        'read_files',
        {},
      );

      expect(result.status).toBe(SandboxToolCallStatus.DENIED);
      expect(result.denialReason).toContain('limit');
    });

    it('should return error for non-running session', async () => {
      sandboxRepo.findOne.mockResolvedValue({
        ...runningSession,
        status: SandboxSessionStatus.PENDING,
      } as AgentSandboxSession);

      const result = await service.executeToolCall(
        mockSessionId,
        'github',
        'read_files',
        {},
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(SandboxToolCallStatus.ERROR);
    });
  });

  describe('listTestScenarios', () => {
    it('should return custom and built-in scenarios', async () => {
      const mockScenarios: Partial<AgentTestScenario>[] = [
        {
          id: 'scenario-1',
          workspaceId: mockWorkspaceId,
          agentDefinitionId: mockDefinitionId,
          name: 'Custom Scenario',
          isBuiltIn: false,
          sampleInput: {},
        },
        {
          id: 'scenario-2',
          workspaceId: mockWorkspaceId,
          agentDefinitionId: null,
          name: 'Reusable Scenario',
          isBuiltIn: false,
          sampleInput: {},
        },
      ];

      scenarioRepo.find.mockResolvedValue(mockScenarios as AgentTestScenario[]);

      const result = await service.listTestScenarios(
        mockWorkspaceId,
        mockDefinitionId,
      );

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('createTestScenario', () => {
    const createDto = {
      name: 'New Scenario',
      description: 'Test description',
      sampleInput: { key: 'value' },
    };

    beforeEach(() => {
      agentDefRepo.findOne.mockResolvedValue(mockAgentDef as AgentDefinition);
      scenarioRepo.create.mockReturnValue({
        id: 'new-scenario-id',
        ...createDto,
      } as AgentTestScenario);
      scenarioRepo.save.mockResolvedValue({
        id: 'new-scenario-id',
        ...createDto,
      } as AgentTestScenario);
    });

    it('should create a custom test scenario', async () => {
      const result = await service.createTestScenario(
        mockWorkspaceId,
        mockDefinitionId,
        createDto,
        mockUserId,
      );

      expect(result).toBeDefined();
      expect(result.name).toBe(createDto.name);
    });

    it('should throw NotFoundException for non-existent agent', async () => {
      agentDefRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createTestScenario(
          mockWorkspaceId,
          mockDefinitionId,
          createDto,
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
