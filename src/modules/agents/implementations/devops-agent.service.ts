import { Injectable, Logger } from '@nestjs/common';
import { AgentsService } from '../agents.service';
import { Agent, AgentStatus } from '../../../database/entities/agent.entity';
import { ClaudeApiService } from '../services/claude-api.service';
import { parseJsonResponse } from '../services/parse-json-response.util';
import {
  DevOpsAgentTask,
  DevOpsAgentResult,
  DeployResult,
  SetupInfrastructureResult,
  MonitorHealthResult,
  RollbackResult,
} from '../interfaces/devops-agent.interfaces';
import {
  DEVOPS_AGENT_SYSTEM_PROMPT,
  buildDeployPrompt,
  buildSetupInfrastructurePrompt,
  buildMonitorHealthPrompt,
  buildRollbackPrompt,
} from '../prompts/devops-agent.prompts';

/**
 * DevOpsAgentService
 * Story 5.6: DevOps Agent Implementation
 *
 * Autonomous DevOps agent that manages deployments, infrastructure setup,
 * health monitoring, and rollback operations using the Claude API.
 */
@Injectable()
export class DevOpsAgentService {
  private readonly logger = new Logger(DevOpsAgentService.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly claudeApiService: ClaudeApiService,
  ) {}

  /**
   * Execute a DevOps task
   */
  async executeTask(agent: Agent, task: DevOpsAgentTask): Promise<DevOpsAgentResult> {
    this.logger.log(`DevOps agent ${agent.id} executing task: ${task.type}`);

    await this.agentsService.updateAgent(agent.id, agent.workspaceId, {
      status: AgentStatus.RUNNING,
      currentTask: task.description,
      startedAt: new Date(),
    });

    try {
      let result: DevOpsAgentResult;

      switch (task.type) {
        case 'deploy':
          result = await this.deploy(agent, task);
          break;
        case 'setup-infrastructure':
          result = await this.setupInfrastructure(agent, task);
          break;
        case 'monitor-health':
          result = await this.monitorHealth(agent, task);
          break;
        case 'rollback':
          result = await this.rollback(agent, task);
          break;
        default:
          throw new Error(`Unknown task type: ${(task as any).type}`);
      }

      await this.agentsService.markCompleted(agent.id, agent.workspaceId);

      return result;
    } catch (error: any) {
      try {
        await this.agentsService.markFailed(agent.id, agent.workspaceId, error.message);
      } catch (markFailedError: any) {
        this.logger.error(
          `Failed to mark agent ${agent.id} as failed: ${markFailedError.message}. Original error: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Execute deployment using Claude API
   */
  private async deploy(agent: Agent, task: DevOpsAgentTask): Promise<DeployResult> {
    this.logger.log(`Deploying to ${task.environment || 'N/A'}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildDeployPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: DEVOPS_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.steps) {
      this.logger.warn('Claude response missing expected "steps" key for deploy task');
    }

    return {
      status: 'deployment_completed',
      environment: parsed.environment || task.environment || 'N/A',
      deploymentId: parsed.deploymentId || 'N/A',
      steps: parsed.steps || [],
      deploymentUrl: parsed.deploymentUrl || task.deploymentUrl || '',
      smokeTestsPassed: parsed.smokeTestsPassed ?? false,
      rollbackAvailable: parsed.rollbackAvailable ?? false,
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Setup infrastructure using Claude API
   */
  private async setupInfrastructure(agent: Agent, task: DevOpsAgentTask): Promise<SetupInfrastructureResult> {
    this.logger.log(`Setting up infrastructure: ${task.description}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildSetupInfrastructurePrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: DEVOPS_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.resources) {
      this.logger.warn('Claude response missing expected "resources" key for setup-infrastructure task');
    }

    return {
      status: 'infrastructure_configured',
      description: parsed.description || task.description,
      resources: parsed.resources || [],
      networkConfig: parsed.networkConfig || { vpc: '', subnets: [], securityGroups: [] },
      scalingPolicy: parsed.scalingPolicy || { minInstances: 1, maxInstances: 1, targetCpuUtilization: 70 },
      recommendations: parsed.recommendations || [],
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Monitor health using Claude API
   */
  private async monitorHealth(agent: Agent, task: DevOpsAgentTask): Promise<MonitorHealthResult> {
    this.logger.log(`Monitoring health: ${task.description}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildMonitorHealthPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: DEVOPS_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.services) {
      this.logger.warn('Claude response missing expected "services" key for monitor-health task');
    }

    return {
      status: 'health_checked',
      description: parsed.description || task.description,
      overallHealth: parsed.overallHealth || 'unhealthy',
      services: parsed.services || [],
      metrics: parsed.metrics || { uptime: '0%', avgResponseTime: '0ms', errorRate: 0, cpuUsage: 0, memoryUsage: 0 },
      alerts: parsed.alerts || [],
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Execute rollback using Claude API
   */
  private async rollback(agent: Agent, task: DevOpsAgentTask): Promise<RollbackResult> {
    this.logger.log(`Rolling back deployment: ${task.previousDeploymentId || 'N/A'}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildRollbackPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: DEVOPS_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.rollbackSteps) {
      this.logger.warn('Claude response missing expected "rollbackSteps" key for rollback task');
    }

    return {
      status: 'rollback_completed',
      environment: parsed.environment || task.environment || 'N/A',
      previousDeploymentId: parsed.previousDeploymentId || task.previousDeploymentId || 'N/A',
      rollbackSteps: parsed.rollbackSteps || [],
      verificationPassed: parsed.verificationPassed ?? false,
      incidentReport: parsed.incidentReport || {
        cause: 'Unable to determine - response parsing incomplete',
        impact: 'Unable to determine - response parsing incomplete',
        resolution: 'Unable to determine - response parsing incomplete',
        preventionMeasures: [],
      },
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }
}
