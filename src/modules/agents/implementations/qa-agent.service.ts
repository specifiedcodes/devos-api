import { Injectable, Logger } from '@nestjs/common';
import { AgentsService } from '../agents.service';
import { Agent, AgentStatus } from '../../../database/entities/agent.entity';
import { ClaudeApiService } from '../services/claude-api.service';
import { parseJsonResponse } from '../services/parse-json-response.util';
import {
  QAAgentTask,
  QAAgentResult,
  RunTestsResult,
  CodeReviewResult,
  SecurityAuditResult,
  CoverageAnalysisResult,
} from '../interfaces/qa-agent.interfaces';
import {
  QA_AGENT_SYSTEM_PROMPT,
  buildRunTestsPrompt,
  buildCodeReviewPrompt,
  buildSecurityAuditPrompt,
  buildCoverageAnalysisPrompt,
} from '../prompts/qa-agent.prompts';

/**
 * QAAgentService
 * Story 5.5: QA Agent Implementation
 *
 * Autonomous QA agent that performs test analysis, code reviews,
 * security audits, and coverage analysis using the Claude API.
 */
@Injectable()
export class QAAgentService {
  private readonly logger = new Logger(QAAgentService.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly claudeApiService: ClaudeApiService,
  ) {}

  /**
   * Execute a QA task
   */
  async executeTask(agent: Agent, task: QAAgentTask): Promise<QAAgentResult> {
    this.logger.log(`QA agent ${agent.id} executing task: ${task.type}`);

    await this.agentsService.updateAgent(agent.id, agent.workspaceId, {
      status: AgentStatus.RUNNING,
      currentTask: task.description,
      startedAt: new Date(),
    });

    try {
      let result: QAAgentResult;

      switch (task.type) {
        case 'run-tests':
          result = await this.runTests(agent, task);
          break;
        case 'code-review':
          result = await this.codeReview(agent, task);
          break;
        case 'security-audit':
          result = await this.securityAudit(agent, task);
          break;
        case 'coverage-analysis':
          result = await this.coverageAnalysis(agent, task);
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
   * Run test analysis using Claude API
   */
  private async runTests(agent: Agent, task: QAAgentTask): Promise<RunTestsResult> {
    this.logger.log(`Running test analysis for story ${task.storyId || 'N/A'}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildRunTestsPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: QA_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.testResults) {
      this.logger.warn('Claude response missing expected "testResults" key for run-tests task');
    }

    return {
      status: 'tests_completed',
      storyId: task.storyId || 'N/A',
      testResults: parsed.testResults || [],
      passed: parsed.passed || 0,
      failed: parsed.failed || 0,
      skipped: parsed.skipped || 0,
      coverageEstimate: parsed.coverageEstimate || 0,
      recommendations: parsed.recommendations || [],
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Perform code review using Claude API
   */
  private async codeReview(agent: Agent, task: QAAgentTask): Promise<CodeReviewResult> {
    this.logger.log(`Reviewing PR ${task.pullRequestId || 'N/A'}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildCodeReviewPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: QA_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.issues) {
      this.logger.warn('Claude response missing expected "issues" key for code-review task');
    }

    return {
      status: 'review_completed',
      pullRequestId: task.pullRequestId || 'N/A',
      issues: parsed.issues || [],
      approved: parsed.approved ?? false,
      decision: parsed.decision || 'NEEDS_INFO',
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Perform security audit using Claude API
   */
  private async securityAudit(agent: Agent, task: QAAgentTask): Promise<SecurityAuditResult> {
    this.logger.log(`Security audit: ${task.description}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildSecurityAuditPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: QA_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.vulnerabilities) {
      this.logger.warn('Claude response missing expected "vulnerabilities" key for security-audit task');
    }

    return {
      status: 'audit_completed',
      vulnerabilities: parsed.vulnerabilities || [],
      hardcodedSecrets: parsed.hardcodedSecrets ?? false,
      dependencyIssues: parsed.dependencyIssues || [],
      overallRisk: parsed.overallRisk || 'low',
      recommendations: parsed.recommendations || [],
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }

  /**
   * Perform coverage analysis using Claude API
   */
  private async coverageAnalysis(agent: Agent, task: QAAgentTask): Promise<CoverageAnalysisResult> {
    this.logger.log(`Coverage analysis: ${task.description}`);

    await this.agentsService.updateHeartbeat(agent.id, agent.workspaceId);

    const userPrompt = buildCoverageAnalysisPrompt(task);

    const response = await this.claudeApiService.sendMessage({
      workspaceId: agent.workspaceId,
      systemPrompt: QA_AGENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 8192,
    });

    const parsed = parseJsonResponse(response);

    if (!parsed.coverageGaps) {
      this.logger.warn('Claude response missing expected "coverageGaps" key for coverage-analysis task');
    }

    return {
      status: 'coverage_analyzed',
      description: task.description,
      coverageGaps: parsed.coverageGaps || [],
      overallCoverage: parsed.overallCoverage || 0,
      meetsCoverageThreshold: parsed.meetsCoverageThreshold ?? false,
      additionalTestsNeeded: parsed.additionalTestsNeeded || 0,
      summary: parsed.summary || '',
      tokensUsed: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
    };
  }
}
