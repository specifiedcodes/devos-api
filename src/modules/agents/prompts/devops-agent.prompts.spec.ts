import {
  DEVOPS_AGENT_SYSTEM_PROMPT,
  buildDeployPrompt,
  buildSetupInfrastructurePrompt,
  buildMonitorHealthPrompt,
  buildRollbackPrompt,
} from './devops-agent.prompts';
import { DevOpsAgentTask } from '../interfaces/devops-agent.interfaces';

describe('DevOps Agent Prompts', () => {
  describe('DEVOPS_AGENT_SYSTEM_PROMPT', () => {
    it('should contain DevOps Agent identity', () => {
      expect(DEVOPS_AGENT_SYSTEM_PROMPT).toContain('DevOps Agent');
    });

    it('should mention zero-downtime deployments', () => {
      expect(DEVOPS_AGENT_SYSTEM_PROMPT).toContain('zero-downtime deployments');
    });

    it('should mention JSON output requirement', () => {
      expect(DEVOPS_AGENT_SYSTEM_PROMPT).toContain('valid JSON');
    });

    it('should mention not including markdown code fences', () => {
      expect(DEVOPS_AGENT_SYSTEM_PROMPT).toContain('Do NOT include markdown code fences');
    });

    it('should mention smoke tests', () => {
      expect(DEVOPS_AGENT_SYSTEM_PROMPT).toContain('smoke tests');
    });

    it('should mention rollback plans', () => {
      expect(DEVOPS_AGENT_SYSTEM_PROMPT).toContain('rollback');
    });

    it('should mention incident reports and root cause analysis', () => {
      expect(DEVOPS_AGENT_SYSTEM_PROMPT).toContain('incident reports');
      expect(DEVOPS_AGENT_SYSTEM_PROMPT).toContain('root cause analysis');
    });

    it('should mention security misconfigurations', () => {
      expect(DEVOPS_AGENT_SYSTEM_PROMPT).toContain('security misconfigurations');
    });
  });

  describe('buildDeployPrompt', () => {
    it('should include environment and services in prompt', () => {
      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy to staging',
        environment: 'staging',
        services: ['api', 'worker', 'scheduler'],
      };

      const prompt = buildDeployPrompt(task);

      expect(prompt).toContain('staging');
      expect(prompt).toContain('api');
      expect(prompt).toContain('worker');
      expect(prompt).toContain('scheduler');
    });

    it('should include deployment configuration in prompt', () => {
      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy with config',
        config: { replicas: 3, healthCheckPath: '/health' },
      };

      const prompt = buildDeployPrompt(task);

      expect(prompt).toContain('replicas');
      expect(prompt).toContain('healthCheckPath');
    });

    it('should include project ID in prompt', () => {
      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy project',
        projectId: 'proj-123',
      };

      const prompt = buildDeployPrompt(task);

      expect(prompt).toContain('proj-123');
    });

    it('should include JSON schema instructions', () => {
      const task: DevOpsAgentTask = {
        type: 'deploy',
        description: 'Deploy',
      };

      const prompt = buildDeployPrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });
  });

  describe('buildSetupInfrastructurePrompt', () => {
    it('should include config and requirements in prompt', () => {
      const task: DevOpsAgentTask = {
        type: 'setup-infrastructure',
        description: 'Setup production infrastructure',
        config: { database: 'postgres', cache: 'redis', storage: '100GB' },
        services: ['api', 'database', 'cache'],
      };

      const prompt = buildSetupInfrastructurePrompt(task);

      expect(prompt).toContain('postgres');
      expect(prompt).toContain('redis');
      expect(prompt).toContain('api');
      expect(prompt).toContain('database');
    });

    it('should include environment in prompt', () => {
      const task: DevOpsAgentTask = {
        type: 'setup-infrastructure',
        description: 'Setup staging',
        environment: 'staging',
      };

      const prompt = buildSetupInfrastructurePrompt(task);

      expect(prompt).toContain('staging');
    });

    it('should include JSON schema instructions', () => {
      const task: DevOpsAgentTask = {
        type: 'setup-infrastructure',
        description: 'Setup',
      };

      const prompt = buildSetupInfrastructurePrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });
  });

  describe('buildMonitorHealthPrompt', () => {
    it('should include deployment URL and services in prompt', () => {
      const task: DevOpsAgentTask = {
        type: 'monitor-health',
        description: 'Monitor production',
        deploymentUrl: 'https://prod.example.com',
        services: ['api', 'worker', 'database'],
      };

      const prompt = buildMonitorHealthPrompt(task);

      expect(prompt).toContain('https://prod.example.com');
      expect(prompt).toContain('api');
      expect(prompt).toContain('worker');
      expect(prompt).toContain('database');
    });

    it('should include environment in prompt', () => {
      const task: DevOpsAgentTask = {
        type: 'monitor-health',
        description: 'Monitor staging',
        environment: 'staging',
      };

      const prompt = buildMonitorHealthPrompt(task);

      expect(prompt).toContain('staging');
    });

    it('should include monitoring configuration in prompt', () => {
      const task: DevOpsAgentTask = {
        type: 'monitor-health',
        description: 'Monitor with config',
        config: { responseTimeThreshold: 500, errorRateThreshold: 0.05 },
      };

      const prompt = buildMonitorHealthPrompt(task);

      expect(prompt).toContain('responseTimeThreshold');
      expect(prompt).toContain('errorRateThreshold');
    });

    it('should include JSON schema instructions', () => {
      const task: DevOpsAgentTask = {
        type: 'monitor-health',
        description: 'Monitor',
      };

      const prompt = buildMonitorHealthPrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });
  });

  describe('buildRollbackPrompt', () => {
    it('should include previous deployment ID and environment in prompt', () => {
      const task: DevOpsAgentTask = {
        type: 'rollback',
        description: 'Rollback failed deployment',
        environment: 'production',
        previousDeploymentId: 'deploy-005',
      };

      const prompt = buildRollbackPrompt(task);

      expect(prompt).toContain('deploy-005');
      expect(prompt).toContain('production');
    });

    it('should include rollback context in prompt', () => {
      const task: DevOpsAgentTask = {
        type: 'rollback',
        description: 'Rollback',
        config: { reason: 'Memory leak detected', severity: 'critical' },
      };

      const prompt = buildRollbackPrompt(task);

      expect(prompt).toContain('Memory leak detected');
      expect(prompt).toContain('critical');
    });

    it('should include JSON schema instructions', () => {
      const task: DevOpsAgentTask = {
        type: 'rollback',
        description: 'Rollback',
      };

      const prompt = buildRollbackPrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });
  });

  describe('All prompts include JSON schema instructions', () => {
    const baseTask: DevOpsAgentTask = {
      type: 'deploy',
      description: 'Test task',
    };

    it('buildDeployPrompt includes JSON schema', () => {
      const prompt = buildDeployPrompt(baseTask);
      expect(prompt).toContain('JSON object');
    });

    it('buildSetupInfrastructurePrompt includes JSON schema', () => {
      const prompt = buildSetupInfrastructurePrompt({ ...baseTask, type: 'setup-infrastructure' });
      expect(prompt).toContain('JSON object');
    });

    it('buildMonitorHealthPrompt includes JSON schema', () => {
      const prompt = buildMonitorHealthPrompt({ ...baseTask, type: 'monitor-health' });
      expect(prompt).toContain('JSON object');
    });

    it('buildRollbackPrompt includes JSON schema', () => {
      const prompt = buildRollbackPrompt({ ...baseTask, type: 'rollback' });
      expect(prompt).toContain('JSON object');
    });
  });
});
