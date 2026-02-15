/**
 * HandoffContextAssembler Service
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Assembles handoff context between agents in the BMAD pipeline.
 * Each method extracts relevant data from the completing agent's result
 * and maps it to the format expected by the next agent.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  PlannerToDevHandoff,
  DevToQAHandoff,
  QAToDevOpsHandoff,
  QAToDevRejectionHandoff,
  DevOpsCompletionHandoff,
} from '../interfaces/handoff.interfaces';

@Injectable()
export class HandoffContextAssemblerService {
  private readonly logger = new Logger(HandoffContextAssemblerService.name);

  /**
   * Assemble handoff context from a Planner Agent result.
   * Extracts story details and planning documents for Dev Agent.
   */
  assemblePlannerToDevContext(
    result: Record<string, any>,
    metadata: Record<string, any>,
  ): PlannerToDevHandoff {
    this.logger.debug('Assembling Planner -> Dev handoff context');

    // Extract acceptance criteria from planner result stories or metadata
    const storiesCreated = result.storiesCreated || [];
    const matchingStory = storiesCreated.find(
      (s: any) => s.storyId === metadata.storyId,
    );

    const acceptanceCriteria =
      matchingStory?.acceptanceCriteria ||
      metadata.acceptanceCriteria ||
      [];

    // Extract planning document paths
    const documentsGenerated = result.documentsGenerated || [];
    const planningDocuments = documentsGenerated.map(
      (doc: any) => doc.filePath,
    );

    // Extract epicId from matching story or metadata
    const epicId = matchingStory?.epicId || metadata.epicId || null;

    return {
      storyId: metadata.storyId || '',
      storyTitle: metadata.storyTitle || matchingStory?.title || '',
      storyDescription: metadata.storyDescription || '',
      acceptanceCriteria,
      techStack: metadata.techStack || '',
      codeStylePreferences: metadata.codeStylePreferences || '',
      testingStrategy: metadata.testingStrategy || '',
      epicId,
      planningDocuments,
      gitRepoUrl: metadata.gitRepoUrl || '',
      githubToken: metadata.githubToken || '',
      repoOwner: metadata.repoOwner || '',
      repoName: metadata.repoName || '',
    };
  }

  /**
   * Assemble handoff context from a Dev Agent result.
   * Extracts branch, PR, and test info for QA Agent.
   */
  assembleDevToQAContext(
    result: Record<string, any>,
    metadata: Record<string, any>,
  ): DevToQAHandoff {
    this.logger.debug('Assembling Dev -> QA handoff context');

    return {
      storyId: metadata.storyId || '',
      storyTitle: metadata.storyTitle || '',
      storyDescription: metadata.storyDescription || '',
      acceptanceCriteria: metadata.acceptanceCriteria || [],
      techStack: metadata.techStack || '',
      testingStrategy: metadata.testingStrategy || '',
      branch: result.branch || '',
      prUrl: result.prUrl || '',
      prNumber: result.prNumber || 0,
      devTestResults: result.testResults || null,
      filesCreated: result.filesCreated || [],
      filesModified: result.filesModified || [],
      commitHash: result.commitHash || null,
      gitRepoUrl: metadata.gitRepoUrl || '',
      githubToken: metadata.githubToken || '',
      repoOwner: metadata.repoOwner || '',
      repoName: metadata.repoName || '',
    };
  }

  /**
   * Assemble handoff context from a QA Agent result (PASS).
   * Extracts verdict, PR info, and report for DevOps Agent.
   */
  assembleQAToDevOpsContext(
    result: Record<string, any>,
    metadata: Record<string, any>,
  ): QAToDevOpsHandoff {
    this.logger.debug('Assembling QA -> DevOps handoff context');

    const qaReport = result.qaReport || {};

    return {
      storyId: metadata.storyId || '',
      storyTitle: metadata.storyTitle || '',
      storyDescription: metadata.storyDescription || '',
      prUrl: metadata.prUrl || '',
      prNumber: metadata.prNumber || 0,
      devBranch: metadata.devBranch || '',
      qaVerdict: 'PASS',
      qaReportSummary: qaReport.summary || '',
      deploymentPlatform: metadata.deploymentPlatform || 'auto',
      supabaseConfigured: metadata.supabaseConfigured || false,
      environment: metadata.environment || 'staging',
      gitRepoUrl: metadata.gitRepoUrl || '',
      githubToken: metadata.githubToken || '',
      repoOwner: metadata.repoOwner || '',
      repoName: metadata.repoName || '',
    };
  }

  /**
   * Assemble handoff context from a QA Agent result (FAIL/NEEDS_CHANGES).
   * Extracts failure details and feedback for Dev Agent re-routing.
   */
  assembleQAToDevRejectionContext(
    result: Record<string, any>,
    metadata: Record<string, any>,
  ): QAToDevRejectionHandoff {
    this.logger.debug('Assembling QA -> Dev rejection handoff context');

    const qaReport = result.qaReport || {};
    const testResults = qaReport.testResults || {};
    const failedTests = (testResults.failedTests || []).map(
      (t: any) => `${t.testName} (${t.file}): ${t.error}`,
    );
    const lintResults = qaReport.lintResults || {};
    const securityScan = qaReport.securityScan || {};
    const comments = qaReport.comments || [];

    return {
      storyId: metadata.storyId || '',
      storyTitle: metadata.storyTitle || '',
      storyDescription: metadata.storyDescription || '',
      acceptanceCriteria: metadata.acceptanceCriteria || [],
      techStack: metadata.techStack || '',
      codeStylePreferences: metadata.codeStylePreferences || '',
      testingStrategy: metadata.testingStrategy || '',
      qaVerdict: result.verdict || qaReport.verdict || 'FAIL',
      qaReportSummary: qaReport.summary || '',
      failedTests,
      lintErrors: lintResults.details || '',
      securityIssues: securityScan.details || '',
      changeRequests: comments,
      previousBranch: metadata.previousBranch || '',
      previousPrUrl: metadata.previousPrUrl || '',
      previousPrNumber: metadata.previousPrNumber || 0,
      iterationCount: metadata.iterationCount || 0,
      gitRepoUrl: metadata.gitRepoUrl || '',
      githubToken: metadata.githubToken || '',
      repoOwner: metadata.repoOwner || '',
      repoName: metadata.repoName || '',
    };
  }

  /**
   * Assemble completion context from a DevOps Agent result.
   * Extracts deployment info for story completion.
   */
  assembleDevOpsCompletionContext(
    result: Record<string, any>,
    metadata: Record<string, any>,
  ): DevOpsCompletionHandoff {
    this.logger.debug('Assembling DevOps -> Completion handoff context');

    const smokeTestResults = result.smokeTestResults;
    const smokeTestsPassed = smokeTestResults?.passed === true;

    return {
      storyId: metadata.storyId || '',
      deploymentUrl: result.deploymentUrl || null,
      deploymentPlatform: result.deploymentPlatform || null,
      mergeCommitHash: result.mergeCommitHash || null,
      smokeTestsPassed,
    };
  }
}
