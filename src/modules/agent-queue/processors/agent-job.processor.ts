import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { Job } from 'bull';
import { AgentQueueService } from '../services/agent-queue.service';
import { AgentJobStatus, AgentJobType } from '../entities/agent-job.entity';
import { AgentsService } from '../../agents/agents.service';
import { DevAgentService } from '../../agents/implementations/dev-agent.service';
import { PlannerAgentService } from '../../agents/implementations/planner-agent.service';
import { QAAgentService } from '../../agents/implementations/qa-agent.service';
import { DevOpsAgentService } from '../../agents/implementations/devops-agent.service';
import { ContextRecoveryService } from '../../agents/context-recovery.service';
import { AgentStatus } from '../../../database/entities/agent.entity';
import { PipelineStateMachineService } from '../../orchestrator/services/pipeline-state-machine.service';

/**
 * AgentJobProcessor
 * Story 5.1: BullMQ Task Queue Setup
 * Story 5.3: Dev Agent Implementation - execute-task routing
 * Story 11.1: Pipeline state machine callback integration
 *
 * Processes agent queue jobs
 */
@Processor('agent-tasks')
export class AgentJobProcessor {
  private readonly logger = new Logger(AgentJobProcessor.name);

  constructor(
    private readonly agentQueueService: AgentQueueService,
    @Inject(forwardRef(() => AgentsService))
    private readonly agentsService: AgentsService,
    @Inject(forwardRef(() => DevAgentService))
    private readonly devAgentService: DevAgentService,
    @Inject(forwardRef(() => PlannerAgentService))
    private readonly plannerAgentService: PlannerAgentService,
    @Inject(forwardRef(() => QAAgentService))
    private readonly qaAgentService: QAAgentService,
    @Inject(forwardRef(() => DevOpsAgentService))
    private readonly devOpsAgentService: DevOpsAgentService,
    @Inject(forwardRef(() => ContextRecoveryService))
    private readonly contextRecoveryService: ContextRecoveryService,
    @Optional()
    @Inject(forwardRef(() => PipelineStateMachineService))
    private readonly pipelineStateMachine?: PipelineStateMachineService,
  ) {}

  @Process({ concurrency: 10 })
  async process(job: Job): Promise<any> {
    const { agentJobId, jobType, data } = job.data;

    this.logger.log(`Processing job ${agentJobId}: ${jobType}`);

    // Update status to processing
    await this.agentQueueService.updateJobStatus(agentJobId, AgentJobStatus.PROCESSING, {
      startedAt: new Date(),
    });

    try {
      let result: any;

      // Route to appropriate handler based on job type
      switch (jobType) {
        case AgentJobType.SPAWN_AGENT:
          result = await this.handleSpawnAgent(data);
          break;

        case AgentJobType.EXECUTE_TASK:
          result = await this.handleExecuteTask(data);
          break;

        case AgentJobType.RECOVER_CONTEXT:
          result = await this.handleRecoverContext(data);
          break;

        case AgentJobType.TERMINATE_AGENT:
          result = await this.handleTerminateAgent(data);
          break;

        default:
          throw new Error(`Unknown job type: ${jobType}`);
      }

      // Update status to completed
      await this.agentQueueService.updateJobStatus(agentJobId, AgentJobStatus.COMPLETED, {
        result,
        completedAt: new Date(),
      });

      // Story 11.1: Notify pipeline state machine on completion for pipeline jobs
      if (data?.pipelineProjectId && this.pipelineStateMachine) {
        try {
          await this.pipelineStateMachine.onPhaseComplete(
            data.pipelineProjectId,
            data.phase,
            result,
          );
        } catch (pipelineError) {
          this.logger.error(
            `Pipeline callback failed for project ${data.pipelineProjectId}:`,
            pipelineError,
          );
        }
      }

      this.logger.log(`Job ${agentJobId} completed successfully`);

      return result;
    } catch (error) {
      this.logger.error(`Job ${agentJobId} failed:`, error);

      // Sync attempts counter with BullMQ's attemptsMade to avoid counter drift
      // BullMQ tracks attemptsMade independently; we sync rather than increment
      await this.agentQueueService.updateJobAttempts(
        agentJobId,
        job.attemptsMade + 1,
      );

      throw error;
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    const { agentJobId, data } = job.data;

    this.logger.error(`Job ${agentJobId} failed after ${job.attemptsMade} attempts:`, error);

    // Check if max attempts reached
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      await this.agentQueueService.updateJobStatus(agentJobId, AgentJobStatus.FAILED, {
        errorMessage: error.message,
        completedAt: new Date(),
      });

      // Story 11.1: Notify pipeline state machine on final failure for pipeline jobs
      if (data?.pipelineProjectId && this.pipelineStateMachine) {
        try {
          await this.pipelineStateMachine.onPhaseFailed(
            data.pipelineProjectId,
            data.phase,
            error.message,
          );
        } catch (pipelineError) {
          this.logger.error(
            `Pipeline failure callback failed for project ${data.pipelineProjectId}:`,
            pipelineError,
          );
        }
      }
    } else {
      await this.agentQueueService.updateJobStatus(agentJobId, AgentJobStatus.RETRYING, {
        errorMessage: error.message,
      });
    }
  }

  /**
   * Handler for spawn-agent jobs
   * Story 5.2: Agent Entity & Lifecycle Management
   */
  private async handleSpawnAgent(data: any): Promise<any> {
    const { agentId, workspaceId } = data;
    this.logger.log(`Spawn agent job for agent ${agentId}`);

    if (agentId && workspaceId) {
      try {
        // Transition: CREATED -> INITIALIZING -> RUNNING
        await this.agentsService.updateAgent(agentId, workspaceId, {
          status: AgentStatus.INITIALIZING,
        });
        await this.agentsService.updateAgent(agentId, workspaceId, {
          status: AgentStatus.RUNNING,
          startedAt: new Date(),
        });

        return {
          status: 'agent_spawned',
          agentId,
          message: 'Agent spawned and running',
        };
      } catch (error: any) {
        this.logger.error(`Failed to spawn agent ${agentId}: ${error.message}`);
        throw error;
      }
    }

    return { status: 'agent_spawned', agentId: agentId || 'unknown', message: 'Agent spawn processed' };
  }

  /**
   * Handler for execute-task jobs
   * Story 5.3: Dev Agent Implementation - routes to correct agent service
   */
  private async handleExecuteTask(data: any): Promise<any> {
    const { agentId, agentType, workspaceId, taskData } = data;

    this.logger.log(
      `Execute task job for agent ${agentId} (type: ${agentType})`,
    );

    if (!agentId || !workspaceId) {
      throw new Error('Missing agentId or workspaceId in execute-task job data');
    }

    // Load agent entity
    const agent = await this.agentsService.getAgent(agentId, workspaceId);

    // Route to the correct agent implementation based on agent type
    switch (agentType) {
      case 'dev':
        this.logger.log(`Routing execute-task to DevAgentService for agent ${agentId}`);
        return this.devAgentService.executeTask(agent, taskData);

      case 'planner':
        this.logger.log(`Routing execute-task to PlannerAgentService for agent ${agentId}`);
        return this.plannerAgentService.executeTask(agent, taskData);

      case 'qa':
        this.logger.log(`Routing execute-task to QAAgentService for agent ${agentId}`);
        return this.qaAgentService.executeTask(agent, taskData);

      case 'devops':
        this.logger.log(`Routing execute-task to DevOpsAgentService for agent ${agentId}`);
        return this.devOpsAgentService.executeTask(agent, taskData);

      default:
        this.logger.warn(`No implementation for agent type: ${agentType}`);
        throw new Error(`Unsupported agent type for task execution: ${agentType}`);
    }
  }

  /**
   * Handler for recover-context jobs
   * Story 5.7: Three-tier Context Recovery System
   */
  private async handleRecoverContext(data: any): Promise<any> {
    const { agentId, workspaceId } = data;
    this.logger.log(`Recover context job for agent ${agentId}`);

    try {
      const context = await this.contextRecoveryService.recoverContext(agentId);

      if (context) {
        // Update agent's context field with recovered data
        await this.agentsService.updateAgent(agentId, workspaceId, {
          context,
        });

        return {
          status: 'context_recovered',
          agentId,
          message: 'Context recovered successfully',
        };
      }

      this.logger.warn(`No context found for agent ${agentId}`);
      return {
        status: 'context_recovery_failed',
        agentId,
        message: 'No context found across any tier',
      };
    } catch (error: any) {
      this.logger.error(
        `Context recovery failed for agent ${agentId}: ${error.message}`,
      );
      return {
        status: 'context_recovery_failed',
        agentId,
        message: error.message,
      };
    }
  }

  /**
   * Handler for terminate-agent jobs
   * Story 5.2: Agent Entity & Lifecycle Management
   */
  private async handleTerminateAgent(data: any): Promise<any> {
    this.logger.log('Terminate agent job - placeholder implementation');
    // TODO: Implement in Story 5.2
    return { status: 'agent_terminated', message: 'Story 5.2 implementation pending' };
  }
}
