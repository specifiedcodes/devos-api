import { Test, TestingModule } from '@nestjs/testing';
import { PlannerAgentService } from './planner-agent.service';
import { AgentsService } from '../agents.service';
import { ClaudeApiService } from '../services/claude-api.service';
import {
  Agent,
  AgentType,
  AgentStatus,
} from '../../../database/entities/agent.entity';
import { ClaudeApiResponse } from '../interfaces/claude-api.interfaces';
import {
  PlannerAgentTask,
  CreatePlanResult,
  BreakdownEpicResult,
  GeneratePrdResult,
  GenerateArchitectureResult,
} from '../interfaces/planner-agent.interfaces';

describe('PlannerAgentService', () => {
  let service: PlannerAgentService;
  let mockAgentsService: any;
  let mockClaudeApiService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockAgentId = '33333333-3333-3333-3333-333333333333';

  const mockAgent: Partial<Agent> = {
    id: mockAgentId,
    workspaceId: mockWorkspaceId,
    type: AgentType.PLANNER,
    status: AgentStatus.RUNNING,
    name: 'Test Planner Agent',
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
        PlannerAgentService,
        { provide: AgentsService, useValue: mockAgentsService },
        { provide: ClaudeApiService, useValue: mockClaudeApiService },
      ],
    }).compile();

    service = module.get<PlannerAgentService>(PlannerAgentService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeTask - routing', () => {
    const createPlanResponse = buildMockClaudeResponse(
      JSON.stringify({
        plan: {
          summary: 'Build the project in 3 phases',
          phases: [
            {
              name: 'Phase 1',
              description: 'Foundation setup',
              estimatedEffort: 'medium',
              dependencies: [],
            },
          ],
          milestones: [{ name: 'MVP', criteria: 'Core features working' }],
        },
        risks: [
          {
            description: 'Scope creep',
            severity: 'medium',
            mitigation: 'Strict sprint planning',
          },
        ],
        estimatedEffort: 'large',
        summary: 'Implementation plan created',
      }),
    );

    beforeEach(() => {
      mockClaudeApiService.sendMessage.mockResolvedValue(createPlanResponse);
    });

    it('should route create-plan to createPlan handler', async () => {
      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Create plan for auth module',
        projectDescription: 'Authentication system',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('plan_created');
    });

    it('should route breakdown-epic to breakdownEpic handler', async () => {
      const breakdownResponse = buildMockClaudeResponse(
        JSON.stringify({
          stories: [
            {
              title: 'User Registration',
              description: 'As a user, I want to register',
              acceptanceCriteria: ['Given a registration form...'],
              estimatedEffort: 'medium',
              priority: 'high',
              dependencies: [],
            },
          ],
          totalStories: 1,
          summary: 'Epic broken down into 1 story',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(breakdownResponse);

      const task: PlannerAgentTask = {
        type: 'breakdown-epic',
        description: 'Break down auth epic',
        epicId: 'epic-1',
        epicDescription: 'User Authentication',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('epic_broken_down');
    });

    it('should route generate-prd to generatePrd handler', async () => {
      const prdResponse = buildMockClaudeResponse(
        JSON.stringify({
          prd: {
            overview: 'Project overview',
            problemStatement: 'Users need auth',
            goals: ['Secure authentication'],
            userPersonas: [
              { name: 'Developer', description: 'A developer', needs: ['API access'] },
            ],
            functionalRequirements: [
              { id: 'FR-001', title: 'Login', description: 'User login', priority: 'must-have' },
            ],
            nonFunctionalRequirements: ['99.9% uptime'],
            successMetrics: ['User adoption rate > 80%'],
          },
          summary: 'PRD generated',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(prdResponse);

      const task: PlannerAgentTask = {
        type: 'generate-prd',
        description: 'Generate PRD for auth',
        projectDescription: 'Authentication system',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('prd_generated');
    });

    it('should route generate-architecture to generateArchitecture handler', async () => {
      const archResponse = buildMockClaudeResponse(
        JSON.stringify({
          architecture: {
            overview: 'Microservices architecture',
            techStack: [
              { category: 'Backend', technology: 'NestJS', rationale: 'Modular framework' },
            ],
            components: [
              { name: 'Auth Service', responsibility: 'Authentication', interfaces: ['/api/auth'] },
            ],
            dataModel: 'PostgreSQL with user and session tables',
            deploymentStrategy: 'Docker containers on Kubernetes',
          },
          summary: 'Architecture generated',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(archResponse);

      const task: PlannerAgentTask = {
        type: 'generate-architecture',
        description: 'Generate architecture for project',
        techStack: ['NestJS', 'PostgreSQL'],
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('architecture_generated');
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
      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Create plan',
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockAgentsService.updateAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        expect.objectContaining({
          status: AgentStatus.RUNNING,
          currentTask: 'Create plan',
        }),
      );
    });

    it('should call markCompleted on success', async () => {
      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Create plan',
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

      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Create plan',
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
  });

  describe('createPlan', () => {
    it('should call ClaudeApiService.sendMessage with planner system prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          plan: { summary: 'Plan', phases: [], milestones: [] },
          risks: [],
          estimatedEffort: 'medium',
          summary: 'Done',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Create implementation plan',
        projectDescription: 'Auth system',
        goals: ['Secure login'],
        constraints: ['Must use JWT'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          systemPrompt: expect.stringContaining('Planner Agent'),
          userPrompt: expect.stringContaining('Create a comprehensive implementation plan'),
        }),
      );
    });

    it('should return structured result with plan phases and milestones', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          plan: {
            summary: 'Build auth in 2 phases',
            phases: [
              {
                name: 'Phase 1: Foundation',
                description: 'Setup project structure',
                estimatedEffort: 'small',
                dependencies: [],
              },
              {
                name: 'Phase 2: Implementation',
                description: 'Implement auth logic',
                estimatedEffort: 'large',
                dependencies: ['Phase 1: Foundation'],
              },
            ],
            milestones: [
              { name: 'MVP Ready', criteria: 'Login and registration working' },
            ],
          },
          risks: [
            {
              description: 'Token expiry edge cases',
              severity: 'low',
              mitigation: 'Comprehensive test suite',
            },
          ],
          estimatedEffort: 'large',
          summary: 'Two-phase plan for auth module',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Plan auth',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual({
        status: 'plan_created',
        description: 'Plan auth',
        plan: {
          summary: 'Build auth in 2 phases',
          phases: expect.arrayContaining([
            expect.objectContaining({ name: 'Phase 1: Foundation' }),
            expect.objectContaining({ name: 'Phase 2: Implementation' }),
          ]),
          milestones: [{ name: 'MVP Ready', criteria: 'Login and registration working' }],
        },
        risks: [
          expect.objectContaining({ severity: 'low' }),
        ],
        estimatedEffort: 'large',
        summary: 'Two-phase plan for auth module',
        tokensUsed: { input: 100, output: 200 },
      });
    });

    it('should include token usage in result', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          plan: { summary: '', phases: [], milestones: [] },
          risks: [],
          estimatedEffort: '',
          summary: 'Done',
        }),
      );
      response.inputTokens = 500;
      response.outputTokens = 1000;
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Plan',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.tokensUsed).toEqual({ input: 500, output: 1000 });
    });

    it('should update heartbeat during execution', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          plan: { summary: '', phases: [], milestones: [] },
          risks: [],
          estimatedEffort: '',
          summary: 'Done',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Plan auth',
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockAgentsService.updateHeartbeat).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
    });
  });

  describe('breakdownEpic', () => {
    it('should call Claude API with epic breakdown prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          stories: [],
          totalStories: 0,
          summary: 'No stories',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'breakdown-epic',
        description: 'Break down epic',
        epicId: 'epic-5',
        epicDescription: 'AI Agent Orchestration',
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('Break down the following epic'),
        }),
      );
    });

    it('should return structured result with stories array', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          stories: [
            {
              title: 'Setup Task Queue',
              description: 'As a developer, I want a task queue',
              acceptanceCriteria: ['Queue processes jobs'],
              estimatedEffort: 'medium',
              priority: 'high',
              dependencies: [],
            },
            {
              title: 'Agent Entity',
              description: 'As a user, I want agent lifecycle management',
              acceptanceCriteria: ['Agent CRUD works'],
              estimatedEffort: 'medium',
              priority: 'high',
              dependencies: ['Setup Task Queue'],
            },
          ],
          totalStories: 2,
          summary: 'Epic broken down into 2 stories',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'breakdown-epic',
        description: 'Break down AI agent epic',
        epicId: 'epic-5',
        epicDescription: 'AI Agent Orchestration',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'epic_broken_down',
          epicId: 'epic-5',
          epicDescription: 'AI Agent Orchestration',
          totalStories: 2,
          tokensUsed: { input: 100, output: 200 },
        }),
      );
      expect((result as BreakdownEpicResult).stories).toHaveLength(2);
    });
  });

  describe('generatePrd', () => {
    it('should call Claude API with PRD generation prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          prd: {
            overview: '',
            problemStatement: '',
            goals: [],
            userPersonas: [],
            functionalRequirements: [],
            nonFunctionalRequirements: [],
            successMetrics: [],
          },
          summary: 'PRD generated',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'generate-prd',
        description: 'Generate PRD',
        projectDescription: 'DevOS platform',
        constraints: ['Must be multi-tenant'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('Generate a Product Requirements Document'),
        }),
      );
    });

    it('should return structured result with requirements', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          prd: {
            overview: 'AI-powered development platform',
            problemStatement: 'Development is slow',
            goals: ['Automate planning', 'Automate coding'],
            userPersonas: [
              { name: 'Developer', description: 'Writes code', needs: ['Fast iteration'] },
            ],
            functionalRequirements: [
              {
                id: 'FR-001',
                title: 'Agent Management',
                description: 'CRUD for agents',
                priority: 'must-have',
              },
            ],
            nonFunctionalRequirements: ['Response time < 200ms'],
            successMetrics: ['50% reduction in planning time'],
          },
          summary: 'PRD for DevOS',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'generate-prd',
        description: 'Generate PRD for DevOS',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'prd_generated',
          description: 'Generate PRD for DevOS',
          tokensUsed: { input: 100, output: 200 },
        }),
      );
      expect((result as GeneratePrdResult).prd.functionalRequirements).toHaveLength(1);
      expect((result as GeneratePrdResult).prd.userPersonas).toHaveLength(1);
    });
  });

  describe('generateArchitecture', () => {
    it('should call Claude API with architecture prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          architecture: {
            overview: '',
            techStack: [],
            components: [],
            dataModel: '',
            deploymentStrategy: '',
          },
          summary: 'Architecture generated',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'generate-architecture',
        description: 'Generate architecture',
        techStack: ['NestJS', 'PostgreSQL', 'Redis'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('Generate a high-level technical architecture'),
        }),
      );
    });

    it('should return structured result with components', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          architecture: {
            overview: 'Monorepo with NestJS backend',
            techStack: [
              { category: 'Backend', technology: 'NestJS', rationale: 'Modular and typed' },
              { category: 'Database', technology: 'PostgreSQL', rationale: 'Reliable RDBMS' },
            ],
            components: [
              {
                name: 'Agent Module',
                responsibility: 'Manage agent lifecycle',
                interfaces: ['POST /agents', 'GET /agents/:id'],
              },
            ],
            dataModel: 'Normalized relational schema',
            deploymentStrategy: 'Docker with K8s',
          },
          summary: 'Architecture for DevOS',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'generate-architecture',
        description: 'Generate architecture for DevOS',
        techStack: ['NestJS', 'PostgreSQL'],
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'architecture_generated',
          description: 'Generate architecture for DevOS',
          tokensUsed: { input: 100, output: 200 },
        }),
      );
      expect((result as GenerateArchitectureResult).architecture.techStack).toHaveLength(2);
      expect((result as GenerateArchitectureResult).architecture.components).toHaveLength(1);
    });
  });

  describe('JSON parsing', () => {
    it('should handle response with markdown code fences', async () => {
      const response = buildMockClaudeResponse(
        '```json\n{"plan": {"summary": "Test", "phases": [], "milestones": []}, "risks": [], "estimatedEffort": "small", "summary": "Done"}\n```',
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Test',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('plan_created');
      expect((result as CreatePlanResult).plan.summary).toBe('Test');
    });

    it('should handle non-JSON response gracefully', async () => {
      const response = buildMockClaudeResponse('This is not valid JSON');
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'create-plan',
        description: 'Test',
      };

      // Should not throw, but return defaults
      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('plan_created');
    });

    it('should handle markdown fences for breakdown-epic', async () => {
      const response = buildMockClaudeResponse(
        '```json\n{"stories": [{"title": "Story 1", "description": "Desc", "acceptanceCriteria": [], "estimatedEffort": "small", "priority": "high", "dependencies": []}], "totalStories": 1, "summary": "Done"}\n```',
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'breakdown-epic',
        description: 'Break down',
        epicId: 'e-1',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('epic_broken_down');
      expect((result as BreakdownEpicResult).stories).toHaveLength(1);
    });

    it('should handle non-JSON response for generate-prd gracefully', async () => {
      const response = buildMockClaudeResponse('Some non-JSON text here');
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'generate-prd',
        description: 'Generate PRD',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('prd_generated');
    });

    it('should handle non-JSON response for generate-architecture gracefully', async () => {
      const response = buildMockClaudeResponse('Not JSON');
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: PlannerAgentTask = {
        type: 'generate-architecture',
        description: 'Generate architecture',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('architecture_generated');
    });
  });
});
