import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent, AgentType, AgentStatus } from '../../database/entities/agent.entity';
import { AgentQueueService } from '../agent-queue/services/agent-queue.service';
import { AgentJobType } from '../agent-queue/entities/agent-job.entity';

export interface CreateAgentParams {
  name: string;
  type: AgentType;
  workspaceId: string;
  projectId?: string;
  createdBy: string;
  config?: Record<string, any>;
}

export interface UpdateAgentParams {
  status?: AgentStatus;
  currentTask?: string;
  context?: Record<string, any>;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Valid state transitions for the agent lifecycle state machine
 */
const VALID_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  [AgentStatus.CREATED]: [AgentStatus.INITIALIZING],
  [AgentStatus.INITIALIZING]: [AgentStatus.RUNNING, AgentStatus.FAILED],
  [AgentStatus.RUNNING]: [
    AgentStatus.PAUSED,
    AgentStatus.COMPLETED,
    AgentStatus.FAILED,
    AgentStatus.TERMINATED,
  ],
  [AgentStatus.PAUSED]: [AgentStatus.RUNNING, AgentStatus.TERMINATED],
  [AgentStatus.COMPLETED]: [],
  [AgentStatus.FAILED]: [],
  [AgentStatus.TERMINATED]: [],
};

/**
 * AgentsService
 * Story 5.2: Agent Entity & Lifecycle Management
 *
 * Manages autonomous agent lifecycle
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
    private readonly agentQueueService: AgentQueueService,
  ) {}

  /**
   * Validate a state transition is allowed by the lifecycle state machine
   */
  private validateTransition(
    currentStatus: AgentStatus,
    newStatus: AgentStatus,
  ): void {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid state transition: cannot transition from '${currentStatus}' to '${newStatus}'`,
      );
    }
  }

  /**
   * Create a new agent and spawn it
   */
  async createAgent(dto: CreateAgentParams): Promise<Agent> {
    const agent = this.agentRepository.create({
      name: dto.name,
      type: dto.type,
      workspaceId: dto.workspaceId,
      projectId: dto.projectId || null,
      createdBy: dto.createdBy,
      config: dto.config || null,
      status: AgentStatus.CREATED,
    });

    await this.agentRepository.save(agent);

    // Queue spawn job
    await this.agentQueueService.addJob({
      workspaceId: dto.workspaceId,
      userId: dto.createdBy,
      jobType: AgentJobType.SPAWN_AGENT,
      data: {
        agentId: agent.id,
        agentType: agent.type,
        config: agent.config,
      },
    });

    this.logger.log(`Agent ${agent.id} (${agent.type}) created and queued for spawn`);

    return agent;
  }

  /**
   * Get agent by ID (with workspace isolation)
   */
  async getAgent(agentId: string, workspaceId: string): Promise<Agent> {
    const agent = await this.agentRepository.findOne({
      where: { id: agentId, workspaceId },
    });

    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }

    return agent;
  }

  /**
   * List agents for workspace
   */
  async listAgents(
    workspaceId: string,
    options?: {
      projectId?: string;
      status?: AgentStatus;
      type?: AgentType;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ agents: Agent[]; total: number }> {
    const queryBuilder = this.agentRepository
      .createQueryBuilder('agent')
      .where('agent.workspaceId = :workspaceId', { workspaceId });

    if (options?.projectId) {
      queryBuilder.andWhere('agent.projectId = :projectId', { projectId: options.projectId });
    }

    if (options?.status) {
      queryBuilder.andWhere('agent.status = :status', { status: options.status });
    }

    if (options?.type) {
      queryBuilder.andWhere('agent.type = :type', { type: options.type });
    }

    queryBuilder.orderBy('agent.createdAt', 'DESC');

    // Always apply a limit to prevent unbounded queries
    // Default to 20 if not specified by caller
    queryBuilder.limit(options?.limit || 20);

    if (options?.offset) {
      queryBuilder.offset(options.offset);
    }

    const [agents, total] = await queryBuilder.getManyAndCount();

    return { agents, total };
  }

  /**
   * Update agent
   */
  async updateAgent(agentId: string, workspaceId: string, dto: UpdateAgentParams): Promise<Agent> {
    const agent = await this.getAgent(agentId, workspaceId);

    // Validate state transition if status change is requested
    if (dto.status && dto.status !== agent.status) {
      this.validateTransition(agent.status, dto.status);
    }

    Object.assign(agent, dto);
    await this.agentRepository.save(agent);

    const updatedFields = Object.keys(dto).filter(
      (key) => dto[key as keyof UpdateAgentParams] !== undefined,
    );
    this.logger.log(`Agent ${agentId} updated fields: [${updatedFields.join(', ')}]`);

    return agent;
  }

  /**
   * Update heartbeat (called periodically by running agents)
   */
  async updateHeartbeat(agentId: string, workspaceId: string): Promise<void> {
    const result = await this.agentRepository.update(
      { id: agentId, workspaceId },
      { lastHeartbeat: new Date() },
    );

    if (result.affected === 0) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }
  }

  /**
   * Pause agent
   */
  async pauseAgent(agentId: string, workspaceId: string, userId: string): Promise<Agent> {
    const agent = await this.getAgent(agentId, workspaceId);

    if (agent.status !== AgentStatus.RUNNING) {
      throw new BadRequestException(
        `Cannot pause agent: agent must be in 'running' status (current status: '${agent.status}')`,
      );
    }

    agent.status = AgentStatus.PAUSED;
    await this.agentRepository.save(agent);

    this.logger.log(`Agent ${agentId} paused by user ${userId}`);

    return agent;
  }

  /**
   * Resume agent
   */
  async resumeAgent(agentId: string, workspaceId: string, userId: string): Promise<Agent> {
    const agent = await this.getAgent(agentId, workspaceId);

    if (agent.status !== AgentStatus.PAUSED) {
      throw new BadRequestException(
        `Cannot resume agent: agent must be in 'paused' status (current status: '${agent.status}')`,
      );
    }

    agent.status = AgentStatus.RUNNING;
    await this.agentRepository.save(agent);

    this.logger.log(`Agent ${agentId} resumed by user ${userId}`);

    return agent;
  }

  /**
   * Terminate agent
   */
  async terminateAgent(agentId: string, workspaceId: string, userId: string): Promise<Agent> {
    const agent = await this.getAgent(agentId, workspaceId);

    if (
      [AgentStatus.COMPLETED, AgentStatus.FAILED, AgentStatus.TERMINATED].includes(agent.status)
    ) {
      throw new BadRequestException(
        `Cannot terminate agent: agent is already in terminal state '${agent.status}'`,
      );
    }

    // Queue termination job
    await this.agentQueueService.addJob({
      workspaceId,
      userId,
      jobType: AgentJobType.TERMINATE_AGENT,
      data: {
        agentId: agent.id,
      },
    });

    agent.status = AgentStatus.TERMINATED;
    agent.completedAt = new Date();
    await this.agentRepository.save(agent);

    this.logger.log(`Agent ${agentId} terminated by user ${userId}`);

    return agent;
  }

  /**
   * Mark agent as failed
   */
  async markFailed(agentId: string, workspaceId: string, error: string): Promise<void> {
    const agent = await this.getAgent(agentId, workspaceId);
    this.validateTransition(agent.status, AgentStatus.FAILED);

    await this.agentRepository.update(
      { id: agentId, workspaceId },
      {
        status: AgentStatus.FAILED,
        errorMessage: error,
        completedAt: new Date(),
      },
    );

    this.logger.error(`Agent ${agentId} marked as failed: ${error}`);
  }

  /**
   * Mark agent as completed
   */
  async markCompleted(agentId: string, workspaceId: string): Promise<void> {
    const agent = await this.getAgent(agentId, workspaceId);
    this.validateTransition(agent.status, AgentStatus.COMPLETED);

    await this.agentRepository.update(
      { id: agentId, workspaceId },
      {
        status: AgentStatus.COMPLETED,
        completedAt: new Date(),
      },
    );

    this.logger.log(`Agent ${agentId} marked as completed`);
  }
}
