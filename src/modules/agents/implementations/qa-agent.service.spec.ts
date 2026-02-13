import { Test, TestingModule } from '@nestjs/testing';
import { QAAgentService } from './qa-agent.service';
import { AgentsService } from '../agents.service';
import { ClaudeApiService } from '../services/claude-api.service';
import {
  Agent,
  AgentType,
  AgentStatus,
} from '../../../database/entities/agent.entity';
import { ClaudeApiResponse } from '../interfaces/claude-api.interfaces';
import {
  QAAgentTask,
  RunTestsResult,
  CodeReviewResult,
  SecurityAuditResult,
  CoverageAnalysisResult,
} from '../interfaces/qa-agent.interfaces';

describe('QAAgentService', () => {
  let service: QAAgentService;
  let mockAgentsService: any;
  let mockClaudeApiService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockAgentId = '44444444-4444-4444-4444-444444444444';

  const mockAgent: Partial<Agent> = {
    id: mockAgentId,
    workspaceId: mockWorkspaceId,
    type: AgentType.QA,
    status: AgentStatus.RUNNING,
    name: 'Test QA Agent',
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
        QAAgentService,
        { provide: AgentsService, useValue: mockAgentsService },
        { provide: ClaudeApiService, useValue: mockClaudeApiService },
      ],
    }).compile();

    service = module.get<QAAgentService>(QAAgentService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeTask - routing', () => {
    const runTestsResponse = buildMockClaudeResponse(
      JSON.stringify({
        testResults: [
          {
            file: 'src/auth.ts',
            testName: 'should authenticate',
            status: 'pass',
            message: 'All assertions passed',
          },
        ],
        passed: 1,
        failed: 0,
        skipped: 0,
        coverageEstimate: 85,
        recommendations: ['Add edge case tests'],
        summary: 'All tests passed',
      }),
    );

    beforeEach(() => {
      mockClaudeApiService.sendMessage.mockResolvedValue(runTestsResponse);
    });

    it('should route run-tests to runTests handler', async () => {
      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests for auth module',
        storyId: 'story-1',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('tests_completed');
    });

    it('should route code-review to codeReview handler', async () => {
      const codeReviewResponse = buildMockClaudeResponse(
        JSON.stringify({
          issues: [
            {
              file: 'src/auth.ts',
              line: 10,
              severity: 'medium',
              category: 'style',
              description: 'Missing error handling',
              suggestion: 'Add try-catch block',
            },
          ],
          approved: true,
          decision: 'PASS',
          summary: 'Code review completed',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(codeReviewResponse);

      const task: QAAgentTask = {
        type: 'code-review',
        description: 'Review PR',
        pullRequestId: 'PR-42',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('review_completed');
    });

    it('should route security-audit to securityAudit handler', async () => {
      const securityResponse = buildMockClaudeResponse(
        JSON.stringify({
          vulnerabilities: [],
          hardcodedSecrets: false,
          dependencyIssues: [],
          overallRisk: 'low',
          recommendations: ['Enable CORS restrictions'],
          summary: 'No critical vulnerabilities found',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(securityResponse);

      const task: QAAgentTask = {
        type: 'security-audit',
        description: 'Audit codebase',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('audit_completed');
    });

    it('should route coverage-analysis to coverageAnalysis handler', async () => {
      const coverageResponse = buildMockClaudeResponse(
        JSON.stringify({
          coverageGaps: [
            {
              file: 'src/auth.ts',
              untestedPaths: ['error handling branch'],
              suggestedTests: ['Test authentication failure'],
              priority: 'high',
            },
          ],
          overallCoverage: 72,
          meetsCoverageThreshold: false,
          additionalTestsNeeded: 3,
          summary: 'Coverage below threshold',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(coverageResponse);

      const task: QAAgentTask = {
        type: 'coverage-analysis',
        description: 'Analyze coverage',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('coverage_analyzed');
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
      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests',
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockAgentsService.updateAgent).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        expect.objectContaining({
          status: AgentStatus.RUNNING,
          currentTask: 'Run tests',
        }),
      );
    });

    it('should call markCompleted on success', async () => {
      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests',
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

      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests',
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

      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests',
      };

      await expect(
        service.executeTask(mockAgent as Agent, task),
      ).rejects.toThrow('API call failed');

      expect(mockAgentsService.markFailed).toHaveBeenCalled();
    });
  });

  describe('runTests', () => {
    it('should call ClaudeApiService.sendMessage with QA system prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          testResults: [],
          passed: 0,
          failed: 0,
          skipped: 0,
          coverageEstimate: 0,
          recommendations: [],
          summary: 'Done',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests for auth',
        storyId: 'story-1',
        files: ['src/auth.ts'],
        acceptanceCriteria: ['Users can login'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          systemPrompt: expect.stringContaining('QA Agent'),
          userPrompt: expect.stringContaining('test'),
        }),
      );
    });

    it('should return structured result with test results and coverage', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          testResults: [
            {
              file: 'src/auth.ts',
              testName: 'should login user',
              status: 'pass',
              message: 'Passed',
            },
            {
              file: 'src/auth.ts',
              testName: 'should reject invalid password',
              status: 'fail',
              message: 'Assertion failed',
            },
          ],
          passed: 1,
          failed: 1,
          skipped: 0,
          coverageEstimate: 75,
          recommendations: ['Add edge case tests'],
          summary: '1 test passed, 1 failed',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests',
        storyId: 'story-1',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual({
        status: 'tests_completed',
        storyId: 'story-1',
        testResults: expect.arrayContaining([
          expect.objectContaining({ testName: 'should login user', status: 'pass' }),
          expect.objectContaining({ testName: 'should reject invalid password', status: 'fail' }),
        ]),
        passed: 1,
        failed: 1,
        skipped: 0,
        coverageEstimate: 75,
        recommendations: ['Add edge case tests'],
        summary: '1 test passed, 1 failed',
        tokensUsed: { input: 100, output: 200 },
      });
    });

    it('should include token usage in result', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          testResults: [],
          passed: 0,
          failed: 0,
          skipped: 0,
          coverageEstimate: 0,
          recommendations: [],
          summary: 'Done',
        }),
      );
      response.inputTokens = 500;
      response.outputTokens = 1000;
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.tokensUsed).toEqual({ input: 500, output: 1000 });
    });

    it('should update heartbeat during execution', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          testResults: [],
          passed: 0,
          failed: 0,
          skipped: 0,
          coverageEstimate: 0,
          recommendations: [],
          summary: 'Done',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests',
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockAgentsService.updateHeartbeat).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
    });
  });

  describe('codeReview', () => {
    it('should call Claude API with code review prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          issues: [],
          approved: true,
          decision: 'PASS',
          summary: 'No issues',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'code-review',
        description: 'Review code',
        pullRequestId: 'PR-42',
        files: ['src/service.ts'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('code review'),
        }),
      );
    });

    it('should return structured result with issues and decision', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          issues: [
            {
              file: 'src/auth.ts',
              line: 25,
              severity: 'high',
              category: 'bug',
              description: 'Null pointer dereference',
              suggestion: 'Add null check',
            },
          ],
          approved: false,
          decision: 'FAIL',
          summary: 'Critical bug found',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'code-review',
        description: 'Review PR',
        pullRequestId: 'PR-42',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'review_completed',
          pullRequestId: 'PR-42',
          tokensUsed: { input: 100, output: 200 },
        }),
      );
      expect((result as CodeReviewResult).issues).toHaveLength(1);
      expect((result as CodeReviewResult).decision).toBe('FAIL');
      expect((result as CodeReviewResult).approved).toBe(false);
    });
  });

  describe('securityAudit', () => {
    it('should call Claude API with security audit prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          vulnerabilities: [],
          hardcodedSecrets: false,
          dependencyIssues: [],
          overallRisk: 'low',
          recommendations: [],
          summary: 'Clean',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'security-audit',
        description: 'Audit codebase',
        codebase: 'NestJS backend',
        files: ['src/auth.ts'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('security audit'),
        }),
      );
    });

    it('should return structured result with vulnerabilities', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          vulnerabilities: [
            {
              file: 'src/db.ts',
              line: 15,
              severity: 'critical',
              type: 'SQL Injection',
              description: 'User input not sanitized',
              remediation: 'Use parameterized queries',
            },
          ],
          hardcodedSecrets: true,
          dependencyIssues: ['lodash has known vulnerability'],
          overallRisk: 'critical',
          recommendations: ['Sanitize all inputs', 'Update dependencies'],
          summary: 'Critical vulnerabilities found',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'security-audit',
        description: 'Audit codebase',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'audit_completed',
          tokensUsed: { input: 100, output: 200 },
        }),
      );
      expect((result as SecurityAuditResult).vulnerabilities).toHaveLength(1);
      expect((result as SecurityAuditResult).hardcodedSecrets).toBe(true);
      expect((result as SecurityAuditResult).overallRisk).toBe('critical');
    });
  });

  describe('coverageAnalysis', () => {
    it('should call Claude API with coverage analysis prompt', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          coverageGaps: [],
          overallCoverage: 90,
          meetsCoverageThreshold: true,
          additionalTestsNeeded: 0,
          summary: 'Good coverage',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'coverage-analysis',
        description: 'Analyze coverage',
        files: ['src/auth.ts'],
      };

      await service.executeTask(mockAgent as Agent, task);

      expect(mockClaudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('coverage'),
        }),
      );
    });

    it('should return structured result with coverage gaps', async () => {
      const response = buildMockClaudeResponse(
        JSON.stringify({
          coverageGaps: [
            {
              file: 'src/auth.ts',
              untestedPaths: ['error handling', 'edge case'],
              suggestedTests: ['Test timeout', 'Test invalid input'],
              priority: 'high',
            },
          ],
          overallCoverage: 65,
          meetsCoverageThreshold: false,
          additionalTestsNeeded: 5,
          summary: 'Coverage below threshold',
        }),
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'coverage-analysis',
        description: 'Analyze coverage for auth',
      };

      const result = await service.executeTask(mockAgent as Agent, task);

      expect(result).toEqual(
        expect.objectContaining({
          status: 'coverage_analyzed',
          description: 'Analyze coverage for auth',
          tokensUsed: { input: 100, output: 200 },
        }),
      );
      expect((result as CoverageAnalysisResult).coverageGaps).toHaveLength(1);
      expect((result as CoverageAnalysisResult).meetsCoverageThreshold).toBe(false);
      expect((result as CoverageAnalysisResult).additionalTestsNeeded).toBe(5);
    });
  });

  describe('JSON parsing', () => {
    it('should handle response with markdown code fences', async () => {
      const response = buildMockClaudeResponse(
        '```json\n{"testResults": [], "passed": 0, "failed": 0, "skipped": 0, "coverageEstimate": 0, "recommendations": [], "summary": "Done"}\n```',
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Test',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('tests_completed');
    });

    it('should handle non-JSON response gracefully for run-tests', async () => {
      const response = buildMockClaudeResponse('This is not valid JSON');
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Test',
      };

      // Should not throw, but return defaults
      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('tests_completed');
    });

    it('should handle markdown fences for code-review', async () => {
      const response = buildMockClaudeResponse(
        '```json\n{"issues": [], "approved": true, "decision": "PASS", "summary": "All good"}\n```',
      );
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'code-review',
        description: 'Review',
        pullRequestId: 'PR-1',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('review_completed');
      expect((result as CodeReviewResult).approved).toBe(true);
    });

    it('should handle non-JSON response for security-audit gracefully', async () => {
      const response = buildMockClaudeResponse('Some non-JSON text here');
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'security-audit',
        description: 'Audit',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('audit_completed');
    });

    it('should handle non-JSON response for coverage-analysis gracefully', async () => {
      const response = buildMockClaudeResponse('Not JSON');
      mockClaudeApiService.sendMessage.mockResolvedValue(response);

      const task: QAAgentTask = {
        type: 'coverage-analysis',
        description: 'Analyze',
      };

      const result = await service.executeTask(mockAgent as Agent, task);
      expect(result.status).toBe('coverage_analyzed');
    });
  });
});
