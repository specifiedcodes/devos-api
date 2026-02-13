import { Test, TestingModule } from '@nestjs/testing';
import { DevAgentService, DevAgentTask } from './dev-agent.service';
import { AgentsService } from '../agents.service';
import { ClaudeApiService } from '../services/claude-api.service';
import {
  Agent,
  AgentType,
  AgentStatus,
} from '../../../database/entities/agent.entity';
import { ClaudeApiResponse } from '../interfaces/claude-api.interfaces';

describe('DevAgentService', () => {
  let service: DevAgentService;
  let mockAgentsService: any;
  let mockClaudeApiService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockAgentId = '33333333-3333-3333-3333-333333333333';

  const mockAgent: Partial<Agent> = {
    id: mockAgentId,
    workspaceId: mockWorkspaceId,
    type: AgentType.DEV,
    status: AgentStatus.RUNNING,
    name: 'Test Dev Agent',
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
        DevAgentService,
        { provide: AgentsService, useValue: mockAgentsService },
        { provide: ClaudeApiService, useValue: mockClaudeApiService },
      ],
    }).compile();

    service = module.get<DevAgentService>(DevAgentService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeTask - routing', () => {
    const implementStoryResponse = buildMockClaudeResponse(
      JSON.stringify({
        plan: 'Implement the auth module',
        filesGenerated: ['src/auth/auth.service.ts'],
        codeBlocks: [
          {
            filename: 'src/auth/auth.service.ts',
            language: 'typescript',
            content: 'export class AuthService {}',
          },
        ],
        testsGenerated: true,
        summary: 'Auth module implemented',
      }),
    );

    beforeEach(() => {
      mockClaudeApiService.sendMessage.mockResolvedValue(implementStoryResponse);
    });

    it('should route implement-story to implementStory handler', async () => {
      const task: DevAgentTask = {
        type: 'implement-story',
        storyId: '5-3',
        description: 'Implement auth module',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('implemented');
    });

    it('should route fix-bug to fixBug handler', async () => {
      const fixBugResponse = buildMockClaudeResponse(
        JSON.stringify({
          rootCause: 'Missing null check',
          fix: 'Added null check',
          filesModified: ['src/auth.ts'],
          codeChanges: [],
          testsAdded: true,
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(fixBugResponse);

      const task: DevAgentTask = {
        type: 'fix-bug',
        description: 'Fix null pointer',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('fixed');
    });

    it('should route write-tests to writeTests handler', async () => {
      const writeTestsResponse = buildMockClaudeResponse(
        JSON.stringify({
          testFiles: [
            {
              filename: 'src/auth.spec.ts',
              language: 'typescript',
              content: 'describe("auth", () => {})',
              testCount: 3,
            },
          ],
          totalTests: 3,
          coverageEstimate: 'high',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(writeTestsResponse);

      const task: DevAgentTask = {
        type: 'write-tests',
        description: 'Write tests for auth',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('tests_written');
    });

    it('should route refactor to refactor handler', async () => {
      const refactorResponse = buildMockClaudeResponse(
        JSON.stringify({
          improvements: ['Extracted helper function'],
          filesModified: ['src/utils.ts'],
          codeChanges: [],
          qualityMetrics: {
            complexityReduction: 'Reduced cyclomatic complexity by 3',
            maintainabilityImprovement: 'Improved readability',
          },
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(refactorResponse);

      const task: DevAgentTask = {
        type: 'refactor',
        description: 'Refactor utils module',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('refactored');
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
      const task: DevAgentTask = {
        type: 'implement-story',
        storyId: '5-3',
        description: 'Implement auth',
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockAgentsService.updateAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        expect.objectContaining({
          status: AgentStatus.RUNNING,
          currentTask: 'Implement auth',
        }),
      );
    });

    it('should call markCompleted on success', async () => {
      const task: DevAgentTask = {
        type: 'implement-story',
        storyId: '5-3',
        description: 'Implement auth',
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

      const task: DevAgentTask = {
        type: 'implement-story',
        storyId: '5-3',
        description: 'Implement auth',
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

  describe('implementStory', () => {
    it('should call ClaudeApiService.sendMessage with implement-story prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          plan: 'Build auth',
          filesGenerated: ['auth.ts'],
          codeBlocks: [],
          testsGenerated: false,
          summary: 'Done',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'implement-story',
        storyId: '5-3',
        description: 'Implement auth module',
        files: ['src/auth.ts'],
        requirements: ['Use JWT'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          systemPrompt: expect.stringContaining('Dev Agent'),
          userPrompt: expect.stringContaining('Implement the following user story'),
        }),
      );
    });

    it('should return structured result with filesGenerated, codeBlocks, summary, and tokensUsed', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          plan: 'Build auth module with JWT',
          filesGenerated: ['src/auth.service.ts', 'src/auth.guard.ts'],
          codeBlocks: [
            {
              filename: 'src/auth.service.ts',
              language: 'typescript',
              content: 'export class AuthService {}',
            },
          ],
          testsGenerated: true,
          summary: 'Auth module with JWT implemented',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'implement-story',
        storyId: '5-3',
        description: 'Implement auth',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual({
        status: 'implemented',
        storyId: '5-3',
        plan: 'Build auth module with JWT',
        filesGenerated: ['src/auth.service.ts', 'src/auth.guard.ts'],
        codeBlocks: [
          {
            filename: 'src/auth.service.ts',
            language: 'typescript',
            content: 'export class AuthService {}',
          },
        ],
        testsGenerated: true,
        summary: 'Auth module with JWT implemented',
        tokensUsed: { input: 100, output: 200 },
      });
    });

    it('should include token usage in result', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          plan: 'Plan',
          filesGenerated: [],
          codeBlocks: [],
          testsGenerated: false,
          summary: 'Done',
        }),
      );
      response.inputTokens = 500;
      response.outputTokens = 1000;
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'implement-story',
        storyId: '5-3',
        description: 'Implement',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.tokensUsed).toEqual({ input: 500, output: 1000 });
    });

    it('should update heartbeat during execution', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          plan: 'Plan',
          filesGenerated: [],
          codeBlocks: [],
          testsGenerated: false,
          summary: 'Done',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'implement-story',
        storyId: '5-3',
        description: 'Implement auth',
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockAgentsService.updateHeartbeat).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
    });
  });

  describe('fixBug', () => {
    it('should call Claude API with bug context prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          rootCause: 'Null reference',
          fix: 'Added guard clause',
          filesModified: ['src/service.ts'],
          codeChanges: [],
          testsAdded: false,
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'fix-bug',
        description: 'Null pointer in service',
        files: ['src/service.ts'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('Analyze and fix the following bug'),
        }),
      );
    });

    it('should return structured result with root cause and fix', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          rootCause: 'Missing null check on user object',
          fix: 'Added early return when user is null',
          filesModified: ['src/user.service.ts'],
          codeChanges: [
            {
              filename: 'src/user.service.ts',
              language: 'typescript',
              content: 'if (!user) return null;',
            },
          ],
          testsAdded: true,
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'fix-bug',
        description: 'Null pointer in user service',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'fixed',
          rootCause: 'Missing null check on user object',
          fix: 'Added early return when user is null',
          filesModified: ['src/user.service.ts'],
          tokensUsed: { input: 100, output: 200 },
        }),
      );
    });
  });

  describe('writeTests', () => {
    it('should call Claude API with test generation prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          testFiles: [],
          totalTests: 0,
          coverageEstimate: 'low',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'write-tests',
        description: 'Write tests for auth module',
        files: ['src/auth.ts'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('Write comprehensive tests'),
        }),
      );
    });

    it('should return structured result with test files', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          testFiles: [
            {
              filename: 'src/auth.spec.ts',
              language: 'typescript',
              content: 'describe("auth", () => { it("works", () => {}) })',
              testCount: 5,
            },
          ],
          totalTests: 5,
          coverageEstimate: 'high',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'write-tests',
        description: 'Write tests for auth',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'tests_written',
          totalTests: 5,
          coverageEstimate: 'high',
          tokensUsed: { input: 100, output: 200 },
        }),
      );
    });
  });

  describe('refactor', () => {
    it('should call Claude API with refactoring prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          improvements: [],
          filesModified: [],
          codeChanges: [],
          qualityMetrics: {
            complexityReduction: 'None',
            maintainabilityImprovement: 'None',
          },
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'refactor',
        description: 'Refactor utils',
        files: ['src/utils.ts'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('Refactor the following code'),
        }),
      );
    });

    it('should return structured result with improvements', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          improvements: ['Extracted helper', 'Renamed variables'],
          filesModified: ['src/utils.ts'],
          codeChanges: [
            {
              filename: 'src/utils.ts',
              language: 'typescript',
              content: 'export function helper() {}',
            },
          ],
          qualityMetrics: {
            complexityReduction: 'Reduced by 40%',
            maintainabilityImprovement: 'Better naming',
          },
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'refactor',
        description: 'Refactor utils',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'refactored',
          improvements: ['Extracted helper', 'Renamed variables'],
          filesModified: ['src/utils.ts'],
          tokensUsed: { input: 100, output: 200 },
        }),
      );
    });
  });

  describe('analyzeCode', () => {
    it('should call Claude API and return analysis result', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          issues: [{ file: 'src/a.ts', line: 10, severity: 'high', description: 'Bug' }],
          suggestions: [{ file: 'src/a.ts', description: 'Use const' }],
          metrics: { complexity: 'medium', maintainability: 'high' },
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const result = await service.analyzeCode(mockAgent as Agent, ['src/a.ts']);

      expect(result.issues).toHaveLength(1);
      expect(result.suggestions).toHaveLength(1);
      expect(result.tokensUsed).toEqual({ input: 100, output: 200 });
    });
  });

  describe('generateCode', () => {
    it('should call Claude API and return generated code string', async () => {
      const response = buildMockClaudeResponse('export class MyService {}');
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const result = await service.generateCode(
        mockAgent as Agent,
        'Create a service class',
      );

      expect(result).toBe('export class MyService {}');
    });
  });

  describe('JSON parsing', () => {
    it('should handle response with markdown code fences', async () => {
      const response = buildMockClaudeResponse(
        '```json\n{"plan": "Test", "filesGenerated": [], "codeBlocks": [], "testsGenerated": false, "summary": "Done"}\n```',
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'implement-story',
        storyId: '1',
        description: 'Test',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('implemented');
      expect((result as any).plan).toBe('Test');
    });

    it('should handle non-JSON response gracefully', async () => {
      const response = buildMockClaudeResponse('This is not valid JSON');
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: DevAgentTask = {
        type: 'implement-story',
        storyId: '1',
        description: 'Test',
      };

      // Should not throw, but return defaults
      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('implemented');
    });
  });
});
