import { Test, TestingModule } from '@nestjs/testing';
import { DevOpsAgentService } from './devops-agent.service';
import { AgentsService } from '../agents.service';
import { ClaudeApiService } from '../services/claude-api.service';
import {
  Agent,
  AgentType,
  AgentStatus,
} from '../../../database/entities/agent.entity';
import { ClaudeApiResponse } from '../interfaces/claude-api.interfaces';
import {
  DevOpsAgentTask,
  DeployResult,
  SetupInfrastructureResult,
  MonitorHealthResult,
  RollbackResult,
} from '../interfaces/devops-agent.interfaces';

describe('DevOpsAgentService', () => {
  let service: DevOpsAgentService;
  let mockAgentsService: any;
  let mockClaudeApiService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockAgentId = '55555555-5555-5555-5555-555555555555';

  const mockAgent: Partial<Agent> = {
    id: mockAgentId,
    workspaceId: mockWorkspaceId,
    type: AgentType.DEVOPS,
    status: AgentStatus.RUNNING,
    name: 'Test DevOps Agent',
  };

  const buildMockClaudeResponse = (content: string): ClaudeApiResponse => ({
    content,
    model: 'claude-sonnet-4-20250514',
    inputTokens: 100,
    outputTokens: 200,
    stopReason: 'end_turn',
  });

  beforeEach(async () => {
    mockAgentsService = {
      updateAgent: jest.fn().mockResolvedValue(mockAgent),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      updateHeartbeat: jest.fn().mockResolvedValue(undefined),
    };

    mockClaudeApiService = {
      sendMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevOpsAgentService,
        { provide: AgentsService, useValue: mockAgentsService },
        { provide: ClaudeApiService, useValue: mockClaudeApiService },
      ],
    }).compile();

    service = module.get<DevOpsAgentService>(DevOpsAgentService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeTask - routing', () => {
    const deployResponse = buildMockClaudeResponse(
      JSON.stringify({
        environment: 'staging',
        deploymentId: 'deploy-001',
        steps: [
          {
            name: 'Build image',
            status: 'success',
            duration: '30s',
            output: 'Image built successfully',
          },
        ],
        deploymentUrl: 'https://staging.example.com',
        smokeTestsPassed: true,
        rollbackAvailable: true,
        summary: 'Deployment completed successfully',
      }),
    );

    beforeEach(() => {
      mockClaudeApiService.sendMessage.mockResolvedValue(deployResponse);
    });

    it('should route deploy to deploy handler', async () => {
      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy to staging',
        environment: 'staging',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('deployment_completed');
    });

    it('should route setup-infrastructure to setupInfrastructure handler', async () => {
      const infraResponse = buildMockClaudeResponse(
        JSON.stringify({
          description: 'Infrastructure setup',
          resources: [
            {
              type: 'compute',
              name: 'web-server',
              configuration: { cpu: 2, memory: '4GB' },
              estimatedCost: '$50/month',
            },
          ],
          networkConfig: {
            vpc: 'vpc-001',
            subnets: ['subnet-1'],
            securityGroups: ['sg-1'],
          },
          scalingPolicy: {
            minInstances: 1,
            maxInstances: 4,
            targetCpuUtilization: 70,
          },
          recommendations: ['Enable auto-scaling'],
          summary: 'Infrastructure configured',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(infraResponse);

      const task: DevOpsAgentTask = {
        type: 'setup-infrastructure',
        description: 'Setup staging infrastructure',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('infrastructure_configured');
    });

    it('should route monitor-health to monitorHealth handler', async () => {
      const healthResponse = buildMockClaudeResponse(
        JSON.stringify({
          description: 'Health check',
          overallHealth: 'healthy',
          services: [
            {
              name: 'api',
              status: 'healthy',
              responseTime: '50ms',
              errorRate: 0.01,
              details: 'Operating normally',
            },
          ],
          metrics: {
            uptime: '99.9%',
            avgResponseTime: '50ms',
            errorRate: 0.01,
            cpuUsage: 45,
            memoryUsage: 60,
          },
          alerts: [],
          summary: 'All services healthy',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(healthResponse);

      const task: DevOpsAgentTask = {
        type: 'monitor-health',
        description: 'Check system health',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('health_checked');
    });

    it('should route rollback to rollback handler', async () => {
      const rollbackResponse = buildMockClaudeResponse(
        JSON.stringify({
          environment: 'production',
          previousDeploymentId: 'deploy-000',
          rollbackSteps: [
            {
              name: 'Revert deployment',
              status: 'success',
              duration: '15s',
              output: 'Reverted to deploy-000',
            },
          ],
          verificationPassed: true,
          incidentReport: {
            cause: 'Memory leak in new code',
            impact: 'Degraded response times',
            resolution: 'Rolled back to previous version',
            preventionMeasures: ['Add memory profiling'],
          },
          summary: 'Rollback completed successfully',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(rollbackResponse);

      const task: DevOpsAgentTask = {
        type: 'rollback',
        description: 'Rollback failed deployment',
        previousDeploymentId: 'deploy-000',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('rollback_completed');
    });

    it('should throw error for unknown task type', async () => {
      const task = {
        type: 'unknown-type' as any,
        description: 'Unknown',
      };

      await expect(
        service.executeTask(mockAgent as Agent, task),
      ).rejects.toThrow('Unknown task type: unknown-type');
    });

    it('should update agent status to RUNNING at start', async () => {
      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy to staging',
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockAgentsService.updateAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        expect.objectContaining({
          status: AgentStatus.RUNNING,
          currentTask: 'Deploy to staging',
        }),
      );
    });

    it('should call markCompleted on success', async () => {
      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy to staging',
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockAgentsService.markCompleted).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
    });

    it('should call markFailed on error with error message', async () => {
      mockClaudeApiService.sendMessage.mockRejectedValue(
        new Error('API call failed'),
      );

      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy to staging',
      };

      await expect(
        service.executeTask(mockAgent as Agent, task),
      ).rejects.toThrow('API call failed');

      expect(mockAgentsService.markFailed).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        'API call failed',
      );
    });

    it('should still throw original error when markFailed itself throws', async () => {
      mockClaudeApiService.sendMessage.mockRejectedValue(
        new Error('API call failed'),
      );
      mockAgentsService.markFailed.mockRejectedValue(
        new Error('Database connection lost'),
      );

      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy to staging',
      };

      await expect(
        service.executeTask(mockAgent as Agent, task),
      ).rejects.toThrow('API call failed');

      expect(mockAgentsService.markFailed).toHaveBeenCalled();
    });
  });

  describe('deploy', () => {
    it('should call ClaudeApiService.sendMessage with DevOps system prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          environment: 'staging',
          deploymentId: 'deploy-001',
          steps: [],
          deploymentUrl: 'https://staging.example.com',
          smokeTestsPassed: true,
          rollbackAvailable: true,
          summary: 'Done',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy to staging',
        environment: 'staging',
        services: ['api', 'worker'],
        config: { replicas: 2 },
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          systemPrompt: expect.stringContaining('DevOps Agent'),
          userPrompt: expect.stringContaining('deployment'),
          maxTokens: 8192,
        }),
      );
    });

    it('should return structured result with deployment steps and smoke tests', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          environment: 'production',
          deploymentId: 'deploy-002',
          steps: [
            {
              name: 'Build image',
              status: 'success',
              duration: '30s',
              output: 'Image built',
            },
            {
              name: 'Run smoke tests',
              status: 'success',
              duration: '15s',
              output: 'All passed',
            },
          ],
          deploymentUrl: 'https://prod.example.com',
          smokeTestsPassed: true,
          rollbackAvailable: true,
          summary: 'Deployed to production',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy to production',
        environment: 'production',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual({
        status: 'deployment_completed',
        environment: 'production',
        deploymentId: 'deploy-002',
        steps: expect.arrayContaining([
          expect.objectContaining({ name: 'Build image', status: 'success' }),
          expect.objectContaining({ name: 'Run smoke tests', status: 'success' }),
        ]),
        deploymentUrl: 'https://prod.example.com',
        smokeTestsPassed: true,
        rollbackAvailable: true,
        summary: 'Deployed to production',
        tokensUsed: { input: 100, output: 200 },
      });
    });

    it('should include token usage in result', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          environment: 'staging',
          deploymentId: 'deploy-001',
          steps: [],
          deploymentUrl: '',
          smokeTestsPassed: true,
          rollbackAvailable: true,
          summary: 'Done',
        }),
      );
      response.inputTokens = 500;
      response.outputTokens = 1000;
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.tokensUsed).toEqual({ input: 500, output: 1000 });
    });

    it('should update heartbeat during execution', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          environment: 'staging',
          deploymentId: 'deploy-001',
          steps: [],
          deploymentUrl: '',
          smokeTestsPassed: true,
          rollbackAvailable: true,
          summary: 'Done',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy',
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockAgentsService.updateHeartbeat).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
    });
  });

  describe('setupInfrastructure', () => {
    it('should call Claude API with infrastructure prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          description: 'Infra setup',
          resources: [],
          networkConfig: { vpc: '', subnets: [], securityGroups: [] },
          scalingPolicy: { minInstances: 1, maxInstances: 1, targetCpuUtilization: 70 },
          recommendations: [],
          summary: 'Done',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'setup-infrastructure',
        description: 'Setup staging infra',
        config: { database: 'postgres', cache: 'redis' },
        services: ['api', 'worker'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('infrastructure'),
          maxTokens: 8192,
        }),
      );
    });

    it('should return structured result with resources and scaling', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          description: 'Production infrastructure',
          resources: [
            {
              type: 'compute',
              name: 'web-server',
              configuration: { cpu: 4, memory: '8GB' },
              estimatedCost: '$100/month',
            },
            {
              type: 'database',
              name: 'primary-db',
              configuration: { engine: 'postgres', storage: '100GB' },
              estimatedCost: '$75/month',
            },
          ],
          networkConfig: {
            vpc: 'vpc-prod-001',
            subnets: ['subnet-public-1', 'subnet-private-1'],
            securityGroups: ['sg-web', 'sg-db'],
          },
          scalingPolicy: {
            minInstances: 2,
            maxInstances: 8,
            targetCpuUtilization: 65,
          },
          recommendations: ['Enable WAF', 'Add read replicas'],
          summary: 'Production infrastructure configured',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'setup-infrastructure',
        description: 'Setup production',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'infrastructure_configured',
          tokensUsed: { input: 100, output: 200 },
        }),
      );
      expect((result as SetupInfrastructureResult).resources).toHaveLength(2);
      expect((result as SetupInfrastructureResult).scalingPolicy.maxInstances).toBe(8);
      expect((result as SetupInfrastructureResult).networkConfig.securityGroups).toHaveLength(2);
    });
  });

  describe('monitorHealth', () => {
    it('should call Claude API with health monitoring prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          description: 'Health check',
          overallHealth: 'healthy',
          services: [],
          metrics: { uptime: '99.9%', avgResponseTime: '50ms', errorRate: 0, cpuUsage: 30, memoryUsage: 40 },
          alerts: [],
          summary: 'Healthy',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'monitor-health',
        description: 'Check health of staging',
        deploymentUrl: 'https://staging.example.com',
        services: ['api', 'database'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('health'),
          maxTokens: 8192,
        }),
      );
    });

    it('should return structured result with services and metrics', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          description: 'System health report',
          overallHealth: 'degraded',
          services: [
            {
              name: 'api',
              status: 'healthy',
              responseTime: '50ms',
              errorRate: 0.01,
              details: 'Normal',
            },
            {
              name: 'database',
              status: 'degraded',
              responseTime: '500ms',
              errorRate: 0.05,
              details: 'High latency',
            },
          ],
          metrics: {
            uptime: '99.5%',
            avgResponseTime: '275ms',
            errorRate: 0.03,
            cpuUsage: 78,
            memoryUsage: 85,
          },
          alerts: [
            {
              severity: 'warning',
              message: 'Database response time elevated',
              recommendation: 'Scale up database',
            },
          ],
          summary: 'System degraded due to database issues',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'monitor-health',
        description: 'Health check',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'health_checked',
          tokensUsed: { input: 100, output: 200 },
        }),
      );
      expect((result as MonitorHealthResult).services).toHaveLength(2);
      expect((result as MonitorHealthResult).overallHealth).toBe('degraded');
      expect((result as MonitorHealthResult).alerts).toHaveLength(1);
      expect((result as MonitorHealthResult).metrics.cpuUsage).toBe(78);
    });
  });

  describe('rollback', () => {
    it('should call Claude API with rollback prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          environment: 'production',
          previousDeploymentId: 'deploy-000',
          rollbackSteps: [],
          verificationPassed: true,
          incidentReport: {
            cause: 'Bug',
            impact: 'Downtime',
            resolution: 'Rolled back',
            preventionMeasures: ['Add tests'],
          },
          summary: 'Rolled back',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'rollback',
        description: 'Rollback failed deploy',
        environment: 'production',
        previousDeploymentId: 'deploy-000',
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('rollback'),
          maxTokens: 8192,
        }),
      );
    });

    it('should return structured result with incident report', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          environment: 'production',
          previousDeploymentId: 'deploy-005',
          rollbackSteps: [
            {
              name: 'Stop current deployment',
              status: 'success',
              duration: '5s',
              output: 'Stopped',
            },
            {
              name: 'Restore previous version',
              status: 'success',
              duration: '20s',
              output: 'Restored deploy-005',
            },
            {
              name: 'Verify rollback',
              status: 'success',
              duration: '10s',
              output: 'Verification passed',
            },
          ],
          verificationPassed: true,
          incidentReport: {
            cause: 'Memory leak in auth module',
            impact: '2 minutes of elevated error rates',
            resolution: 'Rolled back to deploy-005',
            preventionMeasures: [
              'Add memory profiling to CI',
              'Implement canary deployments',
            ],
          },
          summary: 'Rollback to deploy-005 completed successfully',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'rollback',
        description: 'Rollback production',
        previousDeploymentId: 'deploy-005',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'rollback_completed',
          tokensUsed: { input: 100, output: 200 },
        }),
      );
      expect((result as RollbackResult).rollbackSteps).toHaveLength(3);
      expect((result as RollbackResult).verificationPassed).toBe(true);
      expect((result as RollbackResult).incidentReport.cause).toContain('Memory leak');
      expect((result as RollbackResult).incidentReport.preventionMeasures).toHaveLength(2);
    });
  });

  describe('JSON parsing', () => {
    it('should handle response with markdown code fences', async () => {
      const response = buildMockClaudeResponse(
        '```json\n{"environment": "staging", "deploymentId": "d-001", "steps": [], "deploymentUrl": "", "smokeTestsPassed": true, "rollbackAvailable": true, "summary": "Done"}\n```',
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('deployment_completed');
    });

    it('should handle non-JSON response gracefully for deploy', async () => {
      const response = buildMockClaudeResponse('This is not valid JSON');
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy',
      };

      // Should not throw, but return safe defaults
      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('deployment_completed');
      // Fail-safe defaults: smoke tests not passed, rollback not confirmed available
      expect((result as DeployResult).smokeTestsPassed).toBe(false);
      expect((result as DeployResult).rollbackAvailable).toBe(false);
    });

    it('should handle markdown fences for setup-infrastructure', async () => {
      const response = buildMockClaudeResponse(
        '```json\n{"description": "Infra", "resources": [], "networkConfig": {"vpc": "v1", "subnets": [], "securityGroups": []}, "scalingPolicy": {"minInstances": 1, "maxInstances": 2, "targetCpuUtilization": 70}, "recommendations": [], "summary": "Done"}\n```',
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'setup-infrastructure',
        description: 'Setup',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('infrastructure_configured');
    });

    it('should handle non-JSON response for monitor-health gracefully', async () => {
      const response = buildMockClaudeResponse('Some non-JSON text here');
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'monitor-health',
        description: 'Monitor',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('health_checked');
      // When parsing fails, overallHealth should default to 'unhealthy' (safe default)
      expect((result as MonitorHealthResult).overallHealth).toBe('unhealthy');
    });

    it('should handle non-JSON response for rollback gracefully', async () => {
      const response = buildMockClaudeResponse('Not JSON');
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevOpsAgentTask = {
        type: 'rollback',
        description: 'Rollback',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('rollback_completed');
    });
  });
});
