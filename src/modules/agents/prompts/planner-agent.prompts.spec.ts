import {
  PLANNER_AGENT_SYSTEM_PROMPT,
  buildCreatePlanPrompt,
  buildBreakdownEpicPrompt,
  buildGeneratePrdPrompt,
  buildGenerateArchitecturePrompt,
} from './planner-agent.prompts';
import { PlannerAgentTask } from '../interfaces/planner-agent.interfaces';

describe('Planner Agent Prompts', () => {
  describe('PLANNER_AGENT_SYSTEM_PROMPT', () => {
    it('should contain Planner Agent identity', () => {
      expect(PLANNER_AGENT_SYSTEM_PROMPT).toContain('Planner Agent');
    });

    it('should mention BMAD methodology', () => {
      expect(PLANNER_AGENT_SYSTEM_PROMPT).toContain('BMAD');
    });

    it('should mention JSON output requirement', () => {
      expect(PLANNER_AGENT_SYSTEM_PROMPT).toContain('valid JSON');
    });

    it('should mention not including markdown code fences', () => {
      expect(PLANNER_AGENT_SYSTEM_PROMPT).toContain('Do NOT include markdown code fences');
    });

    it('should mention risk assessment', () => {
      expect(PLANNER_AGENT_SYSTEM_PROMPT).toContain('risk assessment');
    });

    it('should mention acceptance criteria', () => {
      expect(PLANNER_AGENT_SYSTEM_PROMPT).toContain('acceptance criteria');
    });
  });

  describe('buildCreatePlanPrompt', () => {
    it('should include project description in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Plan the authentication system',
        projectDescription: 'A JWT-based auth system',
      };

      const prompt = buildCreatePlanPrompt(task);

      expect(prompt).toContain('A JWT-based auth system');
    });

    it('should include goals in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Plan auth',
        goals: ['Secure login', 'Token refresh'],
      };

      const prompt = buildCreatePlanPrompt(task);

      expect(prompt).toContain('Secure login');
      expect(prompt).toContain('Token refresh');
    });

    it('should include constraints in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Plan auth',
        constraints: ['Must use JWT', 'No session cookies'],
      };

      const prompt = buildCreatePlanPrompt(task);

      expect(prompt).toContain('Must use JWT');
      expect(prompt).toContain('No session cookies');
    });

    it('should include tech stack in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Plan auth',
        techStack: ['NestJS', 'PostgreSQL'],
      };

      const prompt = buildCreatePlanPrompt(task);

      expect(prompt).toContain('NestJS');
      expect(prompt).toContain('PostgreSQL');
    });

    it('should include JSON schema instructions', () => {
      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Plan',
      };

      const prompt = buildCreatePlanPrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });

    it('should fall back to description when projectDescription is not provided', () => {
      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Fallback description',
      };

      const prompt = buildCreatePlanPrompt(task);

      expect(prompt).toContain('Fallback description');
    });
  });

  describe('buildBreakdownEpicPrompt', () => {
    it('should include epic description in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'breakdown-epic',
        description: 'Break down epic',
        epicId: 'epic-5',
        epicDescription: 'Autonomous AI Agent Orchestration',
      };

      const prompt = buildBreakdownEpicPrompt(task);

      expect(prompt).toContain('Autonomous AI Agent Orchestration');
    });

    it('should include epic ID in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'breakdown-epic',
        description: 'Break down',
        epicId: 'epic-5',
        epicDescription: 'AI Agents',
      };

      const prompt = buildBreakdownEpicPrompt(task);

      expect(prompt).toContain('epic-5');
    });

    it('should include goals in prompt when provided', () => {
      const task: PlannerAgentTask = {
        type: 'breakdown-epic',
        description: 'Break down epic',
        goals: ['Automate development', 'AI-driven planning'],
      };

      const prompt = buildBreakdownEpicPrompt(task);

      expect(prompt).toContain('Automate development');
      expect(prompt).toContain('AI-driven planning');
    });

    it('should include JSON schema instructions', () => {
      const task: PlannerAgentTask = {
        type: 'breakdown-epic',
        description: 'Break down',
      };

      const prompt = buildBreakdownEpicPrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });
  });

  describe('buildGeneratePrdPrompt', () => {
    it('should include project description in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'generate-prd',
        description: 'Generate PRD',
        projectDescription: 'DevOS - AI development platform',
      };

      const prompt = buildGeneratePrdPrompt(task);

      expect(prompt).toContain('DevOS - AI development platform');
    });

    it('should include constraints in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'generate-prd',
        description: 'Generate PRD',
        constraints: ['Multi-tenant architecture', 'BYOK model'],
      };

      const prompt = buildGeneratePrdPrompt(task);

      expect(prompt).toContain('Multi-tenant architecture');
      expect(prompt).toContain('BYOK model');
    });

    it('should include goals in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'generate-prd',
        description: 'Generate PRD',
        goals: ['Fast onboarding', 'Cost transparency'],
      };

      const prompt = buildGeneratePrdPrompt(task);

      expect(prompt).toContain('Fast onboarding');
      expect(prompt).toContain('Cost transparency');
    });

    it('should include JSON schema instructions', () => {
      const task: PlannerAgentTask = {
        type: 'generate-prd',
        description: 'Generate PRD',
      };

      const prompt = buildGeneratePrdPrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });
  });

  describe('buildGenerateArchitecturePrompt', () => {
    it('should include tech stack in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'generate-architecture',
        description: 'Generate architecture',
        techStack: ['NestJS', 'PostgreSQL', 'Redis', 'BullMQ'],
      };

      const prompt = buildGenerateArchitecturePrompt(task);

      expect(prompt).toContain('NestJS');
      expect(prompt).toContain('PostgreSQL');
      expect(prompt).toContain('Redis');
      expect(prompt).toContain('BullMQ');
    });

    it('should include project description in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'generate-architecture',
        description: 'Generate architecture',
        projectDescription: 'AI-powered development platform',
      };

      const prompt = buildGenerateArchitecturePrompt(task);

      expect(prompt).toContain('AI-powered development platform');
    });

    it('should include constraints in prompt', () => {
      const task: PlannerAgentTask = {
        type: 'generate-architecture',
        description: 'Generate architecture',
        constraints: ['Must support 1000 concurrent users'],
      };

      const prompt = buildGenerateArchitecturePrompt(task);

      expect(prompt).toContain('Must support 1000 concurrent users');
    });

    it('should include JSON schema instructions', () => {
      const task: PlannerAgentTask = {
        type: 'generate-architecture',
        description: 'Generate architecture',
      };

      const prompt = buildGenerateArchitecturePrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });
  });
});
