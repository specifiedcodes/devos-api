import { Injectable, Logger } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { Agent, AgentType, AgentStatus } from '../../database/entities/agent.entity';
import { DevAgentService } from './implementations/dev-agent.service';
import { PlannerAgentService } from './implementations/planner-agent.service';
import { QAAgentService } from './implementations/qa-agent.service';
import { DevOpsAgentService } from './implementations/devops-agent.service';
import { ContextRecoveryService } from './context-recovery.service';
import { ImplementStoryResult, FixBugResult } from './interfaces/claude-api.interfaces';
import { RunTestsResult } from './interfaces/qa-agent.interfaces';
import { DeployResult } from './interfaces/devops-agent.interfaces';
import {
  WorkflowPhase,
  WorkflowState,
  OrchestratorTask,
  OrchestratorResult,
} from './interfaces/orchestrator.interfaces';
import { v4 as uuidv4 } from 'uuid';

/**
 * OrchestratorService
 * Story 5.8: Super Orchestrator Coordination
 *
 * Coordinates multiple specialized agents (Planner, Dev, QA, DevOps)
 * through complete BMAD workflow phases with state tracking,
 * retry logic, event emission, and context recovery.
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly workflows: Map<string, WorkflowState> = new Map();
  private static readonly MAX_WORKFLOW_HISTORY = 1000;

  constructor(
    private readonly agentsService: AgentsService,
    private readonly devAgent: DevAgentService,
    private readonly plannerAgent: PlannerAgentService,
    private readonly qaAgent: QAAgentService,
    private readonly devopsAgent: DevOpsAgentService,
    private readonly contextRecoveryService: ContextRecoveryService,
  ) {}

  // ===== Workflow State Management =====

  /**
   * Create a new workflow state for a task
   */
  createWorkflowState(task: OrchestratorTask): WorkflowState {
    const now = new Date();
    const state: WorkflowState = {
      id: uuidv4(),
      taskId: task.id,
      workspaceId: task.workspaceId,
      phase: WorkflowPhase.PLANNING,
      startedAt: now,
      updatedAt: now,
      agents: {},
      agentHistory: [],
      phaseResults: {},
      retryCount: 0,
      maxRetries: task.config?.maxRetries ?? 2,
      autonomyMode: task.autonomyMode || 'full',
      approvalGates: task.approvalGates || [],
    };

    this.workflows.set(state.id, state);
    this.pruneCompletedWorkflows();
    return state;
  }

  /**
   * Remove oldest completed/failed workflows when Map exceeds max size.
   * Prevents unbounded memory growth for in-memory workflow state.
   */
  private pruneCompletedWorkflows(): void {
    if (this.workflows.size <= OrchestratorService.MAX_WORKFLOW_HISTORY) {
      return;
    }

    const terminalWorkflows: Array<{ id: string; completedAt: Date }> = [];
    for (const [id, wf] of this.workflows.entries()) {
      if (
        (wf.phase === WorkflowPhase.COMPLETED || wf.phase === WorkflowPhase.FAILED) &&
        wf.completedAt
      ) {
        terminalWorkflows.push({ id, completedAt: wf.completedAt });
      }
    }

    // Sort by completedAt ascending (oldest first) and remove excess
    terminalWorkflows.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    const toRemove = this.workflows.size - OrchestratorService.MAX_WORKFLOW_HISTORY;
    for (let i = 0; i < Math.min(toRemove, terminalWorkflows.length); i++) {
      this.workflows.delete(terminalWorkflows[i].id);
    }
  }

  /**
   * Transition workflow to a new phase, updating timestamps
   */
  updateWorkflowPhase(workflowId: string, phase: WorkflowPhase): void {
    const state = this.workflows.get(workflowId);
    if (!state) {
      this.logger.error(`Workflow ${workflowId} not found for phase update to ${phase} -- this indicates a bug`);
      return;
    }

    state.phase = phase;
    state.updatedAt = new Date();

    if (phase === WorkflowPhase.COMPLETED || phase === WorkflowPhase.FAILED) {
      state.completedAt = new Date();
    }

    this.workflows.set(workflowId, state);
  }

  /**
   * Get current workflow state by ID
   */
  getWorkflowStatus(workflowId: string): WorkflowState | null {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * Get all active workflows for a workspace
   */
  getActiveWorkflows(workspaceId: string): WorkflowState[] {
    const active: WorkflowState[] = [];
    for (const state of this.workflows.values()) {
      if (
        state.workspaceId === workspaceId &&
        state.phase !== WorkflowPhase.COMPLETED &&
        state.phase !== WorkflowPhase.FAILED
      ) {
        active.push(state);
      }
    }
    return active;
  }

  /**
   * Cancel a running workflow, terminating active agents
   */
  async cancelWorkflow(workflowId: string): Promise<{ cancelled: boolean }> {
    const state = this.workflows.get(workflowId);
    if (!state) {
      return { cancelled: false };
    }

    // Terminate any active agents
    for (const [agentType, agentId] of Object.entries(state.agents)) {
      try {
        await this.agentsService.terminateAgent(agentId, state.workspaceId, 'system');
        this.logger.log(`Terminated ${agentType} agent ${agentId} for workflow ${workflowId}`);
      } catch (error: any) {
        this.logger.warn(`Failed to terminate agent ${agentId}: ${error.message}`);
      }
    }

    state.phase = WorkflowPhase.FAILED;
    state.error = 'Workflow cancelled';
    state.completedAt = new Date();
    state.updatedAt = new Date();
    this.workflows.set(workflowId, state);

    this.emitEvent('workflow.failed', workflowId, { reason: 'cancelled' });

    return { cancelled: true };
  }

  // ===== Event Emission =====

  /**
   * Emit a structured workflow event via Logger
   */
  private emitEvent(
    type: string,
    workflowId: string,
    data?: Record<string, any>,
  ): void {
    this.logger.log(
      `[Workflow ${workflowId}] ${type}: ${JSON.stringify(data || {})}`,
    );
  }

  // ===== Context Recovery Helpers =====

  /**
   * Save agent context at phase boundary.
   * Graceful: if save fails, log warning and continue.
   */
  private async saveAgentContext(
    agentId: string,
    context: Record<string, any>,
  ): Promise<void> {
    try {
      await this.contextRecoveryService.saveContext(agentId, context);
    } catch (error: any) {
      this.logger.warn(
        `Failed to save context for agent ${agentId}: ${error.message}`,
      );
    }
  }

  /**
   * Recover agent context when retrying after failure.
   * Returns null if no context found or recovery fails.
   */
  private async recoverAgentContext(
    agentId: string,
  ): Promise<Record<string, any> | null> {
    try {
      return await this.contextRecoveryService.recoverContext(agentId);
    } catch (error: any) {
      this.logger.warn(
        `Failed to recover context for agent ${agentId}: ${error.message}`,
      );
      return null;
    }
  }

  // ===== Main Task Router =====

  /**
   * Execute a complex task by coordinating multiple agents
   */
  async executeTask(task: OrchestratorTask): Promise<OrchestratorResult> {
    this.logger.log(`Orchestrator executing task: ${task.type}`);

    try {
      switch (task.type) {
        case 'implement-feature':
          return await this.implementFeature(task);
        case 'fix-bug':
          return await this.fixBug(task);
        case 'deploy':
          return await this.deploy(task);
        case 'full-lifecycle':
          return await this.fullLifecycle(task);
        case 'custom':
          return await this.customTask(task);
        default:
          throw new Error(`Unknown task type: ${(task as any).type}`);
      }
    } catch (error: any) {
      this.logger.error(`Orchestrator task failed: ${error.message}`);
      throw error;
    }
  }

  // ===== Implement Feature Workflow (Planner -> Dev -> QA) =====

  /**
   * Implement a feature using planner -> dev -> qa workflow
   * with full state tracking, retries, events, and context recovery.
   */
  private async implementFeature(task: OrchestratorTask): Promise<OrchestratorResult> {
    const workflowState = this.createWorkflowState(task);
    this.emitEvent('workflow.started', workflowState.id, { type: 'implement-feature' });

    try {
      // ---- Planning Phase ----
      this.updateWorkflowPhase(workflowState.id, WorkflowPhase.PLANNING);
      this.emitEvent('workflow.phase.started', workflowState.id, { phase: WorkflowPhase.PLANNING });

      const planner = await this.agentsService.createAgent({
        name: `Planner for ${task.description}`,
        type: AgentType.PLANNER,
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        createdBy: task.userId,
        config: { task: task.description },
      });
      this.recordAgent(workflowState, 'planner', planner.id, WorkflowPhase.PLANNING);
      this.emitEvent('workflow.agent.spawned', workflowState.id, {
        agentType: 'planner',
        agentId: planner.id,
      });

      const plan = await this.plannerAgent.executeTask(planner, {
        type: 'create-plan',
        description: task.description,
        projectDescription: task.description,
      });
      workflowState.phaseResults.planning = plan;
      this.emitEvent('workflow.agent.completed', workflowState.id, {
        agentType: 'planner',
        agentId: planner.id,
      });
      this.emitEvent('workflow.phase.completed', workflowState.id, { phase: WorkflowPhase.PLANNING });

      // Save planner context
      await this.saveAgentContext(planner.id, {
        phase: WorkflowPhase.PLANNING,
        result: plan,
        workflowId: workflowState.id,
      });

      // ---- Implementation + QA with retry loop ----
      let qaPass = false;

      while (!qaPass && workflowState.retryCount <= workflowState.maxRetries) {
        // ---- Implementation Phase ----
        this.updateWorkflowPhase(workflowState.id, WorkflowPhase.IMPLEMENTATION);
        this.emitEvent('workflow.phase.started', workflowState.id, {
          phase: WorkflowPhase.IMPLEMENTATION,
        });

        // Recover context if retrying
        let devConfig: Record<string, any> = { plan };
        if (workflowState.retryCount > 0) {
          const lastDevAgentId = workflowState.agents.dev;
          if (lastDevAgentId) {
            const recovered = await this.recoverAgentContext(lastDevAgentId);
            if (recovered) {
              devConfig = { ...devConfig, recoveredContext: recovered };
            }
          }
          // Include QA feedback for retries
          const qaFeedback = workflowState.phaseResults.qa;
          if (qaFeedback) {
            devConfig.qaFeedback = qaFeedback;
          }
        }

        const dev = await this.agentsService.createAgent({
          name: `Dev for ${task.description}`,
          type: AgentType.DEV,
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          createdBy: task.userId,
          config: devConfig,
        });
        this.recordAgent(workflowState, 'dev', dev.id, WorkflowPhase.IMPLEMENTATION);
        this.emitEvent('workflow.agent.spawned', workflowState.id, {
          agentType: 'dev',
          agentId: dev.id,
        });

        const implementation = (await this.devAgent.executeTask(dev, {
          type: 'implement-story',
          storyId: task.id,
          description: task.description,
        })) as ImplementStoryResult;
        workflowState.phaseResults.implementation = implementation;
        this.emitEvent('workflow.agent.completed', workflowState.id, {
          agentType: 'dev',
          agentId: dev.id,
        });
        this.emitEvent('workflow.phase.completed', workflowState.id, {
          phase: WorkflowPhase.IMPLEMENTATION,
        });

        // Save dev context
        await this.saveAgentContext(dev.id, {
          phase: WorkflowPhase.IMPLEMENTATION,
          result: implementation,
          workflowId: workflowState.id,
        });

        // ---- QA Phase ----
        this.updateWorkflowPhase(workflowState.id, WorkflowPhase.QA);
        this.emitEvent('workflow.phase.started', workflowState.id, {
          phase: WorkflowPhase.QA,
        });

        const qa = await this.agentsService.createAgent({
          name: `QA for ${task.description}`,
          type: AgentType.QA,
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          createdBy: task.userId,
          config: { implementation },
        });
        this.recordAgent(workflowState, 'qa', qa.id, WorkflowPhase.QA);
        this.emitEvent('workflow.agent.spawned', workflowState.id, {
          agentType: 'qa',
          agentId: qa.id,
        });

        const testResults = (await this.qaAgent.executeTask(qa, {
          type: 'run-tests',
          storyId: task.id,
          description: `Run tests for: ${task.description}`,
          files: implementation.filesGenerated || [],
        })) as RunTestsResult;
        workflowState.phaseResults.qa = testResults;
        this.emitEvent('workflow.agent.completed', workflowState.id, {
          agentType: 'qa',
          agentId: qa.id,
        });

        // Check QA result
        if (testResults.failed === 0) {
          qaPass = true;
          this.emitEvent('workflow.phase.completed', workflowState.id, {
            phase: WorkflowPhase.QA,
          });
        } else {
          this.emitEvent('workflow.phase.failed', workflowState.id, {
            phase: WorkflowPhase.QA,
            failed: testResults.failed,
          });

          workflowState.retryCount++;

          if (workflowState.retryCount > workflowState.maxRetries) {
            // Max retries exceeded
            workflowState.error = `QA failed after ${workflowState.maxRetries} retries. Failed tests: ${testResults.failed}`;
            this.updateWorkflowPhase(workflowState.id, WorkflowPhase.FAILED);
            this.emitEvent('workflow.failed', workflowState.id, {
              error: workflowState.error,
            });

            return {
              status: 'failed',
              workflowState,
              phaseResults: workflowState.phaseResults,
              agents: workflowState.agents,
            };
          }
        }
      }

      // Success
      this.updateWorkflowPhase(workflowState.id, WorkflowPhase.COMPLETED);
      this.emitEvent('workflow.completed', workflowState.id, {
        type: 'implement-feature',
      });

      return {
        status: 'completed',
        workflowState,
        phaseResults: workflowState.phaseResults,
        agents: workflowState.agents,
      };
    } catch (error: any) {
      workflowState.error = error.message;
      this.updateWorkflowPhase(workflowState.id, WorkflowPhase.FAILED);
      this.emitEvent('workflow.failed', workflowState.id, {
        error: error.message,
      });

      return {
        status: 'failed',
        workflowState,
        phaseResults: workflowState.phaseResults,
        agents: workflowState.agents,
      };
    }
  }

  // ===== Fix Bug Workflow (Dev -> QA) =====

  /**
   * Fix a bug using dev -> qa workflow
   * with state tracking, QA retry, and context recovery.
   */
  private async fixBug(task: OrchestratorTask): Promise<OrchestratorResult> {
    const workflowState = this.createWorkflowState(task);
    this.emitEvent('workflow.started', workflowState.id, { type: 'fix-bug' });

    try {
      let qaPass = false;

      while (!qaPass && workflowState.retryCount <= workflowState.maxRetries) {
        // ---- Implementation Phase (Dev Fix) ----
        this.updateWorkflowPhase(workflowState.id, WorkflowPhase.IMPLEMENTATION);
        this.emitEvent('workflow.phase.started', workflowState.id, {
          phase: WorkflowPhase.IMPLEMENTATION,
        });

        let devConfig: Record<string, any> = {};
        if (workflowState.retryCount > 0) {
          // Include QA feedback for retries
          const qaFeedback = workflowState.phaseResults.qa;
          if (qaFeedback) {
            devConfig.qaFeedback = qaFeedback;
          }
          // Try to recover context from previous dev attempt
          const lastDevAgentId = workflowState.agents.dev;
          if (lastDevAgentId) {
            const recovered = await this.recoverAgentContext(lastDevAgentId);
            if (recovered) {
              devConfig.recoveredContext = recovered;
            }
          }
        }

        const dev = await this.agentsService.createAgent({
          name: `Dev fix for ${task.description}`,
          type: AgentType.DEV,
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          createdBy: task.userId,
          config: Object.keys(devConfig).length > 0 ? devConfig : undefined,
        });
        this.recordAgent(workflowState, 'dev', dev.id, WorkflowPhase.IMPLEMENTATION);
        this.emitEvent('workflow.agent.spawned', workflowState.id, {
          agentType: 'dev',
          agentId: dev.id,
        });

        const fix = (await this.devAgent.executeTask(dev, {
          type: 'fix-bug',
          description: task.description,
        })) as FixBugResult;
        workflowState.phaseResults.implementation = fix;
        this.emitEvent('workflow.agent.completed', workflowState.id, {
          agentType: 'dev',
          agentId: dev.id,
        });
        this.emitEvent('workflow.phase.completed', workflowState.id, {
          phase: WorkflowPhase.IMPLEMENTATION,
        });

        // Save dev context
        await this.saveAgentContext(dev.id, {
          phase: WorkflowPhase.IMPLEMENTATION,
          result: fix,
          workflowId: workflowState.id,
        });

        // ---- QA Phase ----
        this.updateWorkflowPhase(workflowState.id, WorkflowPhase.QA);
        this.emitEvent('workflow.phase.started', workflowState.id, {
          phase: WorkflowPhase.QA,
        });

        const qa = await this.agentsService.createAgent({
          name: `QA verify for ${task.description}`,
          type: AgentType.QA,
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          createdBy: task.userId,
          config: { fix },
        });
        this.recordAgent(workflowState, 'qa', qa.id, WorkflowPhase.QA);
        this.emitEvent('workflow.agent.spawned', workflowState.id, {
          agentType: 'qa',
          agentId: qa.id,
        });

        const verification = (await this.qaAgent.executeTask(qa, {
          type: 'run-tests',
          description: `Verify fix for: ${task.description}`,
          files: fix.filesModified || [],
        })) as RunTestsResult;
        workflowState.phaseResults.qa = verification;
        this.emitEvent('workflow.agent.completed', workflowState.id, {
          agentType: 'qa',
          agentId: qa.id,
        });

        // Check QA result
        if (verification.failed === 0) {
          qaPass = true;
          this.emitEvent('workflow.phase.completed', workflowState.id, {
            phase: WorkflowPhase.QA,
          });
        } else {
          this.emitEvent('workflow.phase.failed', workflowState.id, {
            phase: WorkflowPhase.QA,
            failed: verification.failed,
          });

          workflowState.retryCount++;

          if (workflowState.retryCount > workflowState.maxRetries) {
            workflowState.error = `QA verification failed after ${workflowState.maxRetries} retries. Failed tests: ${verification.failed}`;
            this.updateWorkflowPhase(workflowState.id, WorkflowPhase.FAILED);
            this.emitEvent('workflow.failed', workflowState.id, {
              error: workflowState.error,
            });

            return {
              status: 'failed',
              workflowState,
              phaseResults: workflowState.phaseResults,
              agents: workflowState.agents,
            };
          }
        }
      }

      // Success
      this.updateWorkflowPhase(workflowState.id, WorkflowPhase.COMPLETED);
      this.emitEvent('workflow.completed', workflowState.id, {
        type: 'fix-bug',
      });

      return {
        status: 'completed',
        workflowState,
        phaseResults: workflowState.phaseResults,
        agents: workflowState.agents,
      };
    } catch (error: any) {
      workflowState.error = error.message;
      this.updateWorkflowPhase(workflowState.id, WorkflowPhase.FAILED);
      this.emitEvent('workflow.failed', workflowState.id, {
        error: error.message,
      });

      return {
        status: 'failed',
        workflowState,
        phaseResults: workflowState.phaseResults,
        agents: workflowState.agents,
      };
    }
  }

  // ===== Deploy Workflow (DevOps) =====

  /**
   * Deploy using devops agent with auto-rollback on smoke test failure.
   */
  private async deploy(task: OrchestratorTask): Promise<OrchestratorResult> {
    const workflowState = this.createWorkflowState(task);
    this.emitEvent('workflow.started', workflowState.id, { type: 'deploy' });

    try {
      // ---- Deployment Phase ----
      this.updateWorkflowPhase(workflowState.id, WorkflowPhase.DEPLOYMENT);
      this.emitEvent('workflow.phase.started', workflowState.id, {
        phase: WorkflowPhase.DEPLOYMENT,
      });

      const devops = await this.agentsService.createAgent({
        name: `Deploy ${task.description}`,
        type: AgentType.DEVOPS,
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        createdBy: task.userId,
        config: task.config,
      });
      this.recordAgent(workflowState, 'devops', devops.id, WorkflowPhase.DEPLOYMENT);
      this.emitEvent('workflow.agent.spawned', workflowState.id, {
        agentType: 'devops',
        agentId: devops.id,
      });

      const deployment = (await this.devopsAgent.executeTask(devops, {
        type: 'deploy',
        description: task.description,
        environment: task.config?.environment || 'production',
        config: task.config,
      })) as DeployResult;
      workflowState.phaseResults.deployment = deployment;
      this.emitEvent('workflow.agent.completed', workflowState.id, {
        agentType: 'devops',
        agentId: devops.id,
      });

      // Save devops agent context at phase boundary
      await this.saveAgentContext(devops.id, {
        phase: WorkflowPhase.DEPLOYMENT,
        result: deployment,
        workflowId: workflowState.id,
      });

      // Check smoke tests
      if (deployment.smokeTestsPassed) {
        this.emitEvent('workflow.phase.completed', workflowState.id, {
          phase: WorkflowPhase.DEPLOYMENT,
        });
        this.updateWorkflowPhase(workflowState.id, WorkflowPhase.COMPLETED);
        this.emitEvent('workflow.completed', workflowState.id, {
          type: 'deploy',
        });

        return {
          status: 'completed',
          workflowState,
          phaseResults: workflowState.phaseResults,
          agents: workflowState.agents,
        };
      } else {
        // Smoke tests failed -- auto-rollback
        this.logger.warn(
          `Smoke tests failed for workflow ${workflowState.id}, initiating rollback`,
        );

        const rollback = await this.devopsAgent.executeTask(devops, {
          type: 'rollback',
          description: `Rollback deployment for: ${task.description}`,
          environment: task.config?.environment || 'production',
          previousDeploymentId: deployment.deploymentId,
        });
        workflowState.phaseResults.rollback = rollback;

        this.emitEvent('workflow.phase.failed', workflowState.id, {
          phase: WorkflowPhase.DEPLOYMENT,
          reason: 'Smoke tests failed, rollback executed',
        });

        workflowState.error = 'Deployment smoke tests failed, rollback executed';
        this.updateWorkflowPhase(workflowState.id, WorkflowPhase.FAILED);
        this.emitEvent('workflow.failed', workflowState.id, {
          error: workflowState.error,
        });

        return {
          status: 'failed',
          workflowState,
          phaseResults: workflowState.phaseResults,
          agents: workflowState.agents,
        };
      }
    } catch (error: any) {
      workflowState.error = error.message;
      this.updateWorkflowPhase(workflowState.id, WorkflowPhase.FAILED);
      this.emitEvent('workflow.failed', workflowState.id, {
        error: error.message,
      });

      return {
        status: 'failed',
        workflowState,
        phaseResults: workflowState.phaseResults,
        agents: workflowState.agents,
      };
    }
  }

  // ===== Full Lifecycle Workflow (Planner -> Dev -> QA -> DevOps) =====

  /**
   * End-to-end feature delivery: Planning -> Implementation -> QA -> Deployment.
   * Each phase passes results to the next as context.
   * Semi-autonomous mode: logs approval gates but proceeds (actual pause is future).
   */
  private async fullLifecycle(task: OrchestratorTask): Promise<OrchestratorResult> {
    const workflowState = this.createWorkflowState(task);
    this.emitEvent('workflow.started', workflowState.id, { type: 'full-lifecycle' });

    try {
      // ---- Planning Phase ----
      if (this.isApprovalGatePhase(workflowState, WorkflowPhase.PLANNING)) {
        this.logger.log(
          `[Workflow ${workflowState.id}] Approval gate: planning phase requires approval (proceeding in current implementation)`,
        );
      }

      this.updateWorkflowPhase(workflowState.id, WorkflowPhase.PLANNING);
      this.emitEvent('workflow.phase.started', workflowState.id, { phase: WorkflowPhase.PLANNING });

      const planner = await this.agentsService.createAgent({
        name: `Planner for ${task.description}`,
        type: AgentType.PLANNER,
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        createdBy: task.userId,
        config: { task: task.description },
      });
      this.recordAgent(workflowState, 'planner', planner.id, WorkflowPhase.PLANNING);
      this.emitEvent('workflow.agent.spawned', workflowState.id, {
        agentType: 'planner',
        agentId: planner.id,
      });

      const plan = await this.plannerAgent.executeTask(planner, {
        type: 'create-plan',
        description: task.description,
        projectDescription: task.description,
      });
      workflowState.phaseResults.planning = plan;
      this.emitEvent('workflow.agent.completed', workflowState.id, {
        agentType: 'planner',
        agentId: planner.id,
      });
      this.emitEvent('workflow.phase.completed', workflowState.id, { phase: WorkflowPhase.PLANNING });

      await this.saveAgentContext(planner.id, {
        phase: WorkflowPhase.PLANNING,
        result: plan,
        workflowId: workflowState.id,
      });

      // ---- Implementation + QA with retry loop ----
      if (this.isApprovalGatePhase(workflowState, WorkflowPhase.IMPLEMENTATION)) {
        this.logger.log(
          `[Workflow ${workflowState.id}] Approval gate: implementation phase requires approval (proceeding in current implementation)`,
        );
      }

      let qaPass = false;

      while (!qaPass && workflowState.retryCount <= workflowState.maxRetries) {
        // ---- Implementation Phase ----
        this.updateWorkflowPhase(workflowState.id, WorkflowPhase.IMPLEMENTATION);
        this.emitEvent('workflow.phase.started', workflowState.id, {
          phase: WorkflowPhase.IMPLEMENTATION,
        });

        let devConfig: Record<string, any> = { plan };
        if (workflowState.retryCount > 0) {
          const lastDevAgentId = workflowState.agents.dev;
          if (lastDevAgentId) {
            const recovered = await this.recoverAgentContext(lastDevAgentId);
            if (recovered) {
              devConfig = { ...devConfig, recoveredContext: recovered };
            }
          }
          const qaFeedback = workflowState.phaseResults.qa;
          if (qaFeedback) {
            devConfig.qaFeedback = qaFeedback;
          }
        }

        const dev = await this.agentsService.createAgent({
          name: `Dev for ${task.description}`,
          type: AgentType.DEV,
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          createdBy: task.userId,
          config: devConfig,
        });
        this.recordAgent(workflowState, 'dev', dev.id, WorkflowPhase.IMPLEMENTATION);
        this.emitEvent('workflow.agent.spawned', workflowState.id, {
          agentType: 'dev',
          agentId: dev.id,
        });

        const implementation = (await this.devAgent.executeTask(dev, {
          type: 'implement-story',
          storyId: task.id,
          description: task.description,
        })) as ImplementStoryResult;
        workflowState.phaseResults.implementation = implementation;
        this.emitEvent('workflow.agent.completed', workflowState.id, {
          agentType: 'dev',
          agentId: dev.id,
        });
        this.emitEvent('workflow.phase.completed', workflowState.id, {
          phase: WorkflowPhase.IMPLEMENTATION,
        });

        await this.saveAgentContext(dev.id, {
          phase: WorkflowPhase.IMPLEMENTATION,
          result: implementation,
          workflowId: workflowState.id,
        });

        // ---- QA Phase ----
        if (this.isApprovalGatePhase(workflowState, WorkflowPhase.QA)) {
          this.logger.log(
            `[Workflow ${workflowState.id}] Approval gate: qa phase requires approval (proceeding in current implementation)`,
          );
        }

        this.updateWorkflowPhase(workflowState.id, WorkflowPhase.QA);
        this.emitEvent('workflow.phase.started', workflowState.id, {
          phase: WorkflowPhase.QA,
        });

        const qa = await this.agentsService.createAgent({
          name: `QA for ${task.description}`,
          type: AgentType.QA,
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          createdBy: task.userId,
          config: { implementation },
        });
        this.recordAgent(workflowState, 'qa', qa.id, WorkflowPhase.QA);
        this.emitEvent('workflow.agent.spawned', workflowState.id, {
          agentType: 'qa',
          agentId: qa.id,
        });

        const testResults = (await this.qaAgent.executeTask(qa, {
          type: 'run-tests',
          storyId: task.id,
          description: `Run tests for: ${task.description}`,
          files: implementation.filesGenerated || [],
        })) as RunTestsResult;
        workflowState.phaseResults.qa = testResults;
        this.emitEvent('workflow.agent.completed', workflowState.id, {
          agentType: 'qa',
          agentId: qa.id,
        });

        if (testResults.failed === 0) {
          qaPass = true;
          this.emitEvent('workflow.phase.completed', workflowState.id, {
            phase: WorkflowPhase.QA,
          });
        } else {
          this.emitEvent('workflow.phase.failed', workflowState.id, {
            phase: WorkflowPhase.QA,
            failed: testResults.failed,
          });

          workflowState.retryCount++;

          if (workflowState.retryCount > workflowState.maxRetries) {
            workflowState.error = `QA failed after ${workflowState.maxRetries} retries. Failed tests: ${testResults.failed}`;
            this.updateWorkflowPhase(workflowState.id, WorkflowPhase.FAILED);
            this.emitEvent('workflow.failed', workflowState.id, {
              error: workflowState.error,
            });

            return {
              status: 'failed',
              workflowState,
              phaseResults: workflowState.phaseResults,
              agents: workflowState.agents,
            };
          }
        }
      }

      // ---- Deployment Phase ----
      if (this.isApprovalGatePhase(workflowState, WorkflowPhase.DEPLOYMENT)) {
        this.logger.log(
          `[Workflow ${workflowState.id}] Approval gate: deployment phase requires approval (proceeding in current implementation)`,
        );
      }

      this.updateWorkflowPhase(workflowState.id, WorkflowPhase.DEPLOYMENT);
      this.emitEvent('workflow.phase.started', workflowState.id, {
        phase: WorkflowPhase.DEPLOYMENT,
      });

      const devops = await this.agentsService.createAgent({
        name: `Deploy ${task.description}`,
        type: AgentType.DEVOPS,
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        createdBy: task.userId,
        config: {
          ...task.config,
          implementationResult: workflowState.phaseResults.implementation,
          qaResult: workflowState.phaseResults.qa,
        },
      });
      this.recordAgent(workflowState, 'devops', devops.id, WorkflowPhase.DEPLOYMENT);
      this.emitEvent('workflow.agent.spawned', workflowState.id, {
        agentType: 'devops',
        agentId: devops.id,
      });

      const deployment = (await this.devopsAgent.executeTask(devops, {
        type: 'deploy',
        description: task.description,
        environment: task.config?.environment || 'production',
        config: task.config,
      })) as DeployResult;
      workflowState.phaseResults.deployment = deployment;
      this.emitEvent('workflow.agent.completed', workflowState.id, {
        agentType: 'devops',
        agentId: devops.id,
      });

      // Save devops agent context at phase boundary
      await this.saveAgentContext(devops.id, {
        phase: WorkflowPhase.DEPLOYMENT,
        result: deployment,
        workflowId: workflowState.id,
      });

      if (deployment.smokeTestsPassed) {
        this.emitEvent('workflow.phase.completed', workflowState.id, {
          phase: WorkflowPhase.DEPLOYMENT,
        });
        this.updateWorkflowPhase(workflowState.id, WorkflowPhase.COMPLETED);
        this.emitEvent('workflow.completed', workflowState.id, {
          type: 'full-lifecycle',
        });

        return {
          status: 'completed',
          workflowState,
          phaseResults: workflowState.phaseResults,
          agents: workflowState.agents,
        };
      } else {
        // Smoke tests failed -- rollback
        const rollback = await this.devopsAgent.executeTask(devops, {
          type: 'rollback',
          description: `Rollback deployment for: ${task.description}`,
          environment: task.config?.environment || 'production',
          previousDeploymentId: deployment.deploymentId,
        });
        workflowState.phaseResults.rollback = rollback;

        this.emitEvent('workflow.phase.failed', workflowState.id, {
          phase: WorkflowPhase.DEPLOYMENT,
          reason: 'Smoke tests failed, rollback executed',
        });

        workflowState.error = 'Deployment smoke tests failed, rollback executed';
        this.updateWorkflowPhase(workflowState.id, WorkflowPhase.FAILED);
        this.emitEvent('workflow.failed', workflowState.id, {
          error: workflowState.error,
        });

        return {
          status: 'failed',
          workflowState,
          phaseResults: workflowState.phaseResults,
          agents: workflowState.agents,
        };
      }
    } catch (error: any) {
      workflowState.error = error.message;
      this.updateWorkflowPhase(workflowState.id, WorkflowPhase.FAILED);
      this.emitEvent('workflow.failed', workflowState.id, {
        error: error.message,
      });

      return {
        status: 'failed',
        workflowState,
        phaseResults: workflowState.phaseResults,
        agents: workflowState.agents,
      };
    }
  }

  // ===== Custom Task =====

  /**
   * Execute custom task (placeholder)
   */
  private async customTask(task: OrchestratorTask): Promise<OrchestratorResult> {
    const workflowState = this.createWorkflowState(task);
    this.emitEvent('workflow.started', workflowState.id, { type: 'custom' });

    this.updateWorkflowPhase(workflowState.id, WorkflowPhase.COMPLETED);
    this.emitEvent('workflow.completed', workflowState.id, { type: 'custom' });

    return {
      status: 'completed',
      workflowState,
      phaseResults: {},
      agents: {},
    };
  }

  // ===== Monitor Agents =====

  /**
   * Monitor all active agents in a workspace
   */
  async monitorAgents(workspaceId: string): Promise<{
    active: Agent[];
    completed: Agent[];
    failed: Agent[];
  }> {
    const { agents } = await this.agentsService.listAgents(workspaceId, { limit: 1000 });

    return {
      active: agents.filter((a) => a.status === AgentStatus.RUNNING),
      completed: agents.filter((a) => a.status === AgentStatus.COMPLETED),
      failed: agents.filter((a) => a.status === AgentStatus.FAILED),
    };
  }

  // ===== Private Helpers =====

  /**
   * Check if a phase requires approval in semi-autonomous mode
   */
  private isApprovalGatePhase(
    workflowState: WorkflowState,
    phase: WorkflowPhase,
  ): boolean {
    return (
      workflowState.autonomyMode === 'semi' &&
      workflowState.approvalGates.includes(phase)
    );
  }

  /**
   * Record an agent in the workflow state, tracking both current and historical assignments.
   * Maintains audit trail of all agents spawned during a workflow (important for retries).
   */
  private recordAgent(
    workflowState: WorkflowState,
    agentType: string,
    agentId: string,
    phase: WorkflowPhase,
  ): void {
    workflowState.agents[agentType] = agentId;
    workflowState.agentHistory.push({ agentType, agentId, phase });
  }
}
