/**
 * Agent Sandbox Service
 *
 * Story 18-3: Agent Sandbox Testing
 *
 * Service for creating and managing isolated sandbox sessions for testing custom agents.
 * Handles session lifecycle, tool execution, and real-time event streaming.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  AgentSandboxSession,
  SandboxSessionStatus,
  SandboxSampleProject,
} from '../../database/entities/agent-sandbox-session.entity';
import {
  AgentSandboxToolCall,
  SandboxToolCallStatus,
} from '../../database/entities/agent-sandbox-tool-call.entity';
import { AgentTestScenario } from '../../database/entities/agent-test-scenario.entity';
import { AgentDefinition } from '../../database/entities/agent-definition.entity';
import { WorkspaceMember, WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { CustomAgentsService } from './custom-agents.service';
import { SandboxToolExecutorService } from './sandbox-tool-executor.service';
import { CreateSandboxSessionDto } from './dto/create-sandbox-session.dto';
import {
  SandboxSessionResponseDto,
  SandboxSessionStatusDto,
  SandboxSessionResultsDto,
  SandboxToolCallDto,
} from './dto/sandbox-session-response.dto';
import { TestScenarioDto, CreateTestScenarioDto } from './dto/create-test-scenario.dto';
import { BUILT_IN_TEST_SCENARIOS } from './constants/built-in-test-scenarios';
import { getSampleProjectFiles } from './constants/sample-projects';
import { SandboxToolResult } from './sandbox-tool-executor.service';

export interface SandboxSessionStatusResult {
  session: AgentSandboxSession;
  toolCalls: AgentSandboxToolCall[];
}

// Default limits
const DEFAULT_SANDBOX_LIMITS = {
  timeoutMinutes: 10,
  maxToolCalls: 50,
  maxTokens: 100000,
  maxSessionAgeHours: 24,
};

@Injectable()
export class AgentSandboxService {
  private readonly logger = new Logger(AgentSandboxService.name);

  // In-memory store for sandbox file systems (sessionId -> files)
  private readonly sandboxFileSystems = new Map<string, Map<string, string>>();

  constructor(
    @InjectRepository(AgentSandboxSession)
    private readonly sandboxRepo: Repository<AgentSandboxSession>,
    @InjectRepository(AgentSandboxToolCall)
    private readonly toolCallRepo: Repository<AgentSandboxToolCall>,
    @InjectRepository(AgentTestScenario)
    private readonly scenarioRepo: Repository<AgentTestScenario>,
    @InjectRepository(AgentDefinition)
    private readonly agentDefRepo: Repository<AgentDefinition>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly customAgentsService: CustomAgentsService,
    private readonly toolExecutorService: SandboxToolExecutorService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a new sandbox session for testing an agent.
   */
  async createSession(
    workspaceId: string,
    agentDefinitionId: string,
    userId: string,
    dto: CreateSandboxSessionDto,
  ): Promise<SandboxSessionResponseDto> {
    // Validate agent definition exists and belongs to workspace
    const agentDef = await this.agentDefRepo.findOne({
      where: { id: agentDefinitionId, workspaceId },
    });

    if (!agentDef) {
      throw new NotFoundException('Agent definition not found');
    }

    if (!agentDef.isActive) {
      throw new BadRequestException('Cannot create sandbox for inactive agent definition');
    }

    // Validate user is workspace member
    await this.validateMemberRole(workspaceId, userId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
    ]);

    // Check for existing running sessions for this user/agent combo
    const existingSession = await this.sandboxRepo.findOne({
      where: {
        workspaceId,
        agentDefinitionId,
        userId,
        status: SandboxSessionStatus.RUNNING,
      },
    });

    if (existingSession) {
      throw new BadRequestException(
        `A running sandbox session already exists for this agent. Session ID: ${existingSession.id}`,
      );
    }

    // Calculate expiration time
    const timeoutMinutes = dto.timeoutMinutes || DEFAULT_SANDBOX_LIMITS.timeoutMinutes;
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

    // Create session entity
    const session = this.sandboxRepo.create({
      workspaceId,
      agentDefinitionId,
      userId,
      testScenarioId: dto.testScenarioId || null,
      sampleProject: dto.sampleProject || SandboxSampleProject.NEXTJS,
      timeoutMinutes,
      maxToolCalls: dto.maxToolCalls || DEFAULT_SANDBOX_LIMITS.maxToolCalls,
      maxTokens: dto.maxTokens || DEFAULT_SANDBOX_LIMITS.maxTokens,
      status: SandboxSessionStatus.PENDING,
      expiresAt,
      sandboxConfig: dto.sandboxConfig || {},
      testInputs: dto.testInputs || null,
    });

    const saved = await this.sandboxRepo.save(session);

    // Initialize in-memory file system for this session
    await this.initializeSandboxFileSystem(saved.id, saved.sampleProject);

    // Emit session created event
    this.eventEmitter.emit('sandbox:created', {
      sessionId: saved.id,
      workspaceId,
      agentDefinitionId,
      userId,
    });

    return this.toResponseDto(saved);
  }

  /**
   * Start sandbox execution - spawns isolated execution environment.
   */
  async startSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.findSessionOrThrow(sessionId);

    // Validate user owns the session
    if (session.userId !== userId) {
      throw new ForbiddenException('You can only start your own sandbox sessions');
    }

    if (session.status !== SandboxSessionStatus.PENDING) {
      throw new BadRequestException(`Cannot start session with status: ${session.status}`);
    }

    // Check if session has expired
    if (new Date() > session.expiresAt) {
      session.status = SandboxSessionStatus.TIMEOUT;
      await this.sandboxRepo.save(session);
      throw new BadRequestException('Session has expired');
    }

    // Update session status
    session.status = SandboxSessionStatus.RUNNING;
    session.startedAt = new Date();
    await this.sandboxRepo.save(session);

    // Emit started event
    this.eventEmitter.emit('sandbox:started', {
      sessionId: session.id,
      workspaceId: session.workspaceId,
      agentDefinitionId: session.agentDefinitionId,
      agentName: session.agentDefinition?.displayName || 'Unknown Agent',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a test message to the agent in the sandbox.
   */
  async sendTestMessage(
    sessionId: string,
    message: string,
    inputs?: Record<string, unknown>,
  ): Promise<void> {
    const session = await this.findSessionOrThrow(sessionId);

    if (session.status !== SandboxSessionStatus.RUNNING) {
      throw new BadRequestException(`Cannot send message to session with status: ${session.status}`);
    }

    // Check token limit
    if (session.tokensInput + session.tokensOutput >= session.maxTokens) {
      await this.completeSession(session, SandboxSessionStatus.TIMEOUT, 'Token limit exceeded');
      throw new BadRequestException('Token limit exceeded');
    }

    // Emit message event for WebSocket streaming
    this.eventEmitter.emit('sandbox:message', {
      sessionId: session.id,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // In a real implementation, this would call the AI provider
    // For now, we emit the message and let the agent process it
    this.eventEmitter.emit('sandbox:process_message', {
      sessionId: session.id,
      message,
      inputs: inputs || session.testInputs,
    });
  }

  /**
   * Execute a tool call within sandbox constraints.
   * Returns mock/sandboxed results, not real operations.
   */
  async executeToolCall(
    sessionId: string,
    toolCategory: string,
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<SandboxToolResult> {
    const session = await this.findSessionOrThrow(sessionId);

    if (session.status !== SandboxSessionStatus.RUNNING) {
      return {
        success: false,
        status: SandboxToolCallStatus.ERROR,
        output: null,
        errorMessage: `Session is not running (status: ${session.status})`,
        durationMs: 0,
      };
    }

    // Check tool call limit
    if (session.toolCallsCount >= session.maxToolCalls) {
      await this.completeSession(session, SandboxSessionStatus.TIMEOUT, 'Tool call limit exceeded');
      return {
        success: false,
        status: SandboxToolCallStatus.DENIED,
        output: null,
        denialReason: 'Tool call limit exceeded',
        durationMs: 0,
      };
    }

    // Get agent definition for permissions
    const agentDef = await this.agentDefRepo.findOne({
      where: { id: session.agentDefinitionId },
    });

    if (!agentDef) {
      return {
        success: false,
        status: SandboxToolCallStatus.ERROR,
        output: null,
        errorMessage: 'Agent definition not found',
        durationMs: 0,
      };
    }

    // Create pending tool call record
    const toolCall = this.toolCallRepo.create({
      sandboxSessionId: sessionId,
      toolCategory,
      toolName,
      toolInput,
      status: SandboxToolCallStatus.PENDING,
    });

    await this.toolCallRepo.save(toolCall);

    // Emit tool call event
    this.eventEmitter.emit('sandbox:tool_call', {
      sessionId: session.id,
      toolCallId: toolCall.id,
      toolCategory,
      toolName,
      input: toolInput,
      status: 'pending',
      timestamp: new Date().toISOString(),
    });

    // Update status to executing
    toolCall.status = SandboxToolCallStatus.EXECUTING;
    await this.toolCallRepo.save(toolCall);

    const startTime = Date.now();

    // Execute via tool executor service
    const result = await this.toolExecutorService.executeTool(
      sessionId,
      toolCategory,
      toolName,
      toolInput,
      agentDef.definition?.tools || {},
      this.sandboxFileSystems.get(sessionId),
    );

    const durationMs = Date.now() - startTime;

    // Update tool call record
    toolCall.status = result.status;
    toolCall.toolOutput = result.output;
    toolCall.denialReason = result.denialReason || null;
    toolCall.errorMessage = result.errorMessage || null;
    toolCall.durationMs = durationMs;
    await this.toolCallRepo.save(toolCall);

    // Update session tool call count
    session.toolCallsCount += 1;
    await this.sandboxRepo.save(session);

    // Emit tool result event
    this.eventEmitter.emit('sandbox:tool_result', {
      sessionId: session.id,
      toolCallId: toolCall.id,
      output: result.output,
      status: result.status,
      denialReason: result.denialReason,
      errorMessage: result.errorMessage,
      durationMs,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Get real-time session status and metrics.
   */
  async getSessionStatus(sessionId: string): Promise<SandboxSessionStatusDto> {
    const session = await this.findSessionOrThrow(sessionId);

    const dto = new SandboxSessionStatusDto();
    this.mapSessionToDto(session, dto);
    dto.testOutputs = session.testOutputs;
    dto.sandboxConfig = session.sandboxConfig;

    return dto;
  }

  /**
   * Cancel a running sandbox session.
   */
  async cancelSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.findSessionOrThrow(sessionId);

    // Validate user owns the session or is workspace admin
    if (session.userId !== userId) {
      const member = await this.memberRepo.findOne({
        where: { workspaceId: session.workspaceId, userId },
      });
      if (!member || (member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN)) {
        throw new ForbiddenException('You can only cancel your own sessions');
      }
    }

    if (session.status !== SandboxSessionStatus.RUNNING && session.status !== SandboxSessionStatus.PENDING) {
      throw new BadRequestException(`Cannot cancel session with status: ${session.status}`);
    }

    await this.completeSession(session, SandboxSessionStatus.CANCELLED, 'Cancelled by user');
  }

  /**
   * Get sandbox session results summary.
   */
  async getSessionResults(sessionId: string): Promise<SandboxSessionResultsDto> {
    const session = await this.findSessionOrThrow(sessionId);

    // Get all tool calls for the session
    const toolCalls = await this.toolCallRepo.find({
      where: { sandboxSessionId: sessionId },
      order: { createdAt: 'ASC' },
    });

    const sessionDto = new SandboxSessionStatusDto();
    this.mapSessionToDto(session, sessionDto);
    sessionDto.testOutputs = session.testOutputs;
    sessionDto.sandboxConfig = session.sandboxConfig;

    // Calculate summary
    const successCount = toolCalls.filter((tc) => tc.status === SandboxToolCallStatus.SUCCESS).length;
    const deniedCount = toolCalls.filter((tc) => tc.status === SandboxToolCallStatus.DENIED).length;
    const errorCount = toolCalls.filter((tc) => tc.status === SandboxToolCallStatus.ERROR).length;

    const durationMs = session.completedAt && session.startedAt
      ? session.completedAt.getTime() - session.startedAt.getTime()
      : session.startedAt
        ? Date.now() - session.startedAt.getTime()
        : 0;

    return {
      session: sessionDto,
      toolCalls: toolCalls.map((tc) => this.mapToolCallToDto(tc)),
      testOutputs: session.testOutputs,
      summary: {
        durationMs,
        successRate: toolCalls.length > 0 ? successCount / toolCalls.length : 0,
        deniedCount,
        errorCount,
      },
    };
  }

  /**
   * List test scenarios for an agent.
   */
  async listTestScenarios(
    workspaceId: string,
    agentDefinitionId: string,
  ): Promise<TestScenarioDto[]> {
    // Get custom scenarios for this agent
    const customScenarios = await this.scenarioRepo.find({
      where: [
        { workspaceId, agentDefinitionId },
        { workspaceId, agentDefinitionId: null as any }, // Reusable scenarios
      ],
      order: { name: 'ASC' },
    });

    // Get built-in scenarios
    const builtInScenarios = await this.scenarioRepo.find({
      where: { workspaceId, isBuiltIn: true },
    });

    // If no built-in scenarios exist, they need to be seeded
    if (builtInScenarios.length === 0) {
      await this.seedBuiltInScenarios(workspaceId);
      // Re-fetch after seeding
      const seededScenarios = await this.scenarioRepo.find({
        where: { workspaceId, isBuiltIn: true },
      });
      customScenarios.push(...seededScenarios);
    } else {
      customScenarios.push(...builtInScenarios);
    }

    return customScenarios.map((s) => this.mapScenarioToDto(s));
  }

  /**
   * Create a custom test scenario.
   */
  async createTestScenario(
    workspaceId: string,
    agentDefinitionId: string,
    dto: CreateTestScenarioDto,
    userId: string,
  ): Promise<TestScenarioDto> {
    // Validate agent definition exists
    const agentDef = await this.agentDefRepo.findOne({
      where: { id: agentDefinitionId, workspaceId },
    });

    if (!agentDef) {
      throw new NotFoundException('Agent definition not found');
    }

    const scenario = this.scenarioRepo.create({
      workspaceId,
      agentDefinitionId,
      name: dto.name,
      description: dto.description || null,
      category: dto.category || null,
      isBuiltIn: false,
      sampleInput: dto.sampleInput,
      expectedBehavior: dto.expectedBehavior || null,
      setupScript: dto.setupScript || null,
      validationScript: dto.validationScript || null,
      createdBy: userId,
    });

    const saved = await this.scenarioRepo.save(scenario);
    return this.mapScenarioToDto(saved);
  }

  /**
   * Clean up expired sandbox sessions (cron job).
   */
  @Cron('*/5 * * * *')
  async cleanupExpiredSessions(): Promise<void> {
    this.logger.log('Running expired sandbox sessions cleanup...');

    // Find sessions that are still running but have expired (expiresAt < now)
    const expiredSessions = await this.sandboxRepo.find({
      where: {
        status: SandboxSessionStatus.RUNNING,
        expiresAt: LessThan(new Date()),
      },
    });

    for (const session of expiredSessions) {
      try {
        await this.completeSession(session, SandboxSessionStatus.TIMEOUT, 'Session expired');
        this.logger.debug(`Cleaned up expired session: ${session.id}`);
      } catch (error) {
        this.logger.error(`Failed to cleanup session ${session.id}: ${error}`);
      }
    }

    // Clean up old completed sessions (older than 24 hours)
    const oldSessionCutoff = new Date(Date.now() - DEFAULT_SANDBOX_LIMITS.maxSessionAgeHours * 60 * 60 * 1000);
    const oldSessions = await this.sandboxRepo
      .createQueryBuilder('session')
      .where('session.status IN (:...statuses)', {
        statuses: [
          SandboxSessionStatus.COMPLETED,
          SandboxSessionStatus.FAILED,
          SandboxSessionStatus.TIMEOUT,
          SandboxSessionStatus.CANCELLED,
        ],
      })
      .andWhere('session.completedAt < :cutoff', { cutoff: oldSessionCutoff })
      .getMany();

    for (const session of oldSessions) {
      // Clean up in-memory file system
      this.sandboxFileSystems.delete(session.id);
    }

    if (oldSessions.length > 0) {
      await this.sandboxRepo.remove(oldSessions);
      this.logger.debug(`Removed ${oldSessions.length} old sessions`);
    }
  }

  /**
   * Get file from sandbox file system.
   */
  getSandboxFile(sessionId: string, filePath: string): string | null {
    const fs = this.sandboxFileSystems.get(sessionId);
    if (!fs) return null;
    return fs.get(filePath) || null;
  }

  /**
   * Set file in sandbox file system.
   */
  setSandboxFile(sessionId: string, filePath: string, content: string): void {
    let fs = this.sandboxFileSystems.get(sessionId);
    if (!fs) {
      fs = new Map();
      this.sandboxFileSystems.set(sessionId, fs);
    }
    fs.set(filePath, content);

    // Emit file change event
    this.eventEmitter.emit('sandbox:file_change', {
      sessionId,
      filePath,
      changeType: 'modify',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * List files in sandbox file system.
   */
  listSandboxFiles(sessionId: string): string[] {
    const fs = this.sandboxFileSystems.get(sessionId);
    if (!fs) return [];
    return Array.from(fs.keys());
  }

  // ---- Private Helpers ----

  private async findSessionOrThrow(sessionId: string): Promise<AgentSandboxSession> {
    const session = await this.sandboxRepo.findOne({
      where: { id: sessionId },
      relations: ['agentDefinition'],
    });

    if (!session) {
      throw new NotFoundException('Sandbox session not found');
    }

    return session;
  }

  private async validateMemberRole(
    workspaceId: string,
    userId: string,
    allowedRoles: WorkspaceRole[],
  ): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId },
    });

    if (!member || !allowedRoles.includes(member.role)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action in this workspace',
      );
    }
  }

  private async completeSession(
    session: AgentSandboxSession,
    status: SandboxSessionStatus,
    errorMessage?: string,
  ): Promise<void> {
    session.status = status;
    session.completedAt = new Date();
    if (errorMessage) {
      session.errorMessage = errorMessage;
    }
    await this.sandboxRepo.save(session);

    // Emit completion event
    const durationMs = session.completedAt.getTime() - (session.startedAt?.getTime() || session.createdAt.getTime());

    this.eventEmitter.emit('sandbox:complete', {
      sessionId: session.id,
      status,
      summary: {
        durationMs,
        tokensInput: session.tokensInput,
        tokensOutput: session.tokensOutput,
        toolCallsCount: session.toolCallsCount,
        estimatedCostCents: session.estimatedCostCents,
      },
      timestamp: new Date().toISOString(),
    });

    // Clean up file system after completion
    this.sandboxFileSystems.delete(session.id);
  }

  private async initializeSandboxFileSystem(
    sessionId: string,
    sampleProject: SandboxSampleProject,
  ): Promise<void> {
    const fs = new Map<string, string>();
    const files = getSampleProjectFiles(sampleProject);

    for (const file of files) {
      fs.set(file.path, file.content);
    }

    this.sandboxFileSystems.set(sessionId, fs);
  }

  private async seedBuiltInScenarios(workspaceId: string): Promise<void> {
    const scenarios = BUILT_IN_TEST_SCENARIOS.map((s) =>
      this.scenarioRepo.create({
        workspaceId,
        name: s.name,
        description: s.description,
        category: s.category,
        isBuiltIn: true,
        sampleInput: s.sampleInput,
        expectedBehavior: s.expectedBehavior,
        setupScript: s.setupScript,
        validationScript: s.validationScript,
        createdBy: 'system',
      }),
    );

    await this.scenarioRepo.save(scenarios);
  }

  private toResponseDto(session: AgentSandboxSession): SandboxSessionResponseDto {
    const dto = new SandboxSessionResponseDto();
    this.mapSessionToDto(session, dto);
    return dto;
  }

  private mapSessionToDto(
    session: AgentSandboxSession,
    dto: SandboxSessionResponseDto | SandboxSessionStatusDto,
  ): void {
    dto.id = session.id;
    dto.workspaceId = session.workspaceId;
    dto.agentDefinitionId = session.agentDefinitionId;
    dto.userId = session.userId;
    dto.testScenarioId = session.testScenarioId;
    dto.sampleProject = session.sampleProject;
    dto.timeoutMinutes = session.timeoutMinutes;
    dto.maxToolCalls = session.maxToolCalls;
    dto.maxTokens = session.maxTokens;
    dto.status = session.status;
    dto.startedAt = session.startedAt;
    dto.completedAt = session.completedAt;
    dto.expiresAt = session.expiresAt;
    dto.tokensInput = session.tokensInput;
    dto.tokensOutput = session.tokensOutput;
    dto.toolCallsCount = session.toolCallsCount;
    dto.estimatedCostCents = session.estimatedCostCents;
    dto.errorMessage = session.errorMessage;
    dto.testInputs = session.testInputs;
    dto.createdAt = session.createdAt;
  }

  private mapToolCallToDto(toolCall: AgentSandboxToolCall): SandboxToolCallDto {
    const dto = new SandboxToolCallDto();
    dto.id = toolCall.id;
    dto.toolCategory = toolCall.toolCategory;
    dto.toolName = toolCall.toolName;
    dto.toolInput = toolCall.toolInput;
    dto.toolOutput = toolCall.toolOutput;
    dto.status = toolCall.status;
    dto.denialReason = toolCall.denialReason;
    dto.errorMessage = toolCall.errorMessage;
    dto.durationMs = toolCall.durationMs;
    dto.createdAt = toolCall.createdAt;
    return dto;
  }

  private mapScenarioToDto(scenario: AgentTestScenario): TestScenarioDto {
    const dto = new TestScenarioDto();
    dto.id = scenario.id;
    dto.workspaceId = scenario.workspaceId;
    dto.agentDefinitionId = scenario.agentDefinitionId;
    dto.name = scenario.name;
    dto.description = scenario.description;
    dto.category = scenario.category;
    dto.isBuiltIn = scenario.isBuiltIn;
    dto.sampleInput = scenario.sampleInput;
    dto.expectedBehavior = scenario.expectedBehavior;
    dto.setupScript = scenario.setupScript;
    dto.validationScript = scenario.validationScript;
    dto.createdBy = scenario.createdBy;
    dto.createdAt = scenario.createdAt;
    dto.updatedAt = scenario.updatedAt;
    return dto;
  }
}
