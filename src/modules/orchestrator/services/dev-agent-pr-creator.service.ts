/**
 * DevAgentPRCreatorService
 * Story 11.4: Dev Agent CLI Integration
 *
 * Creates pull requests for dev agent work using the existing GitHubService (Story 6.4).
 * Formats PR title and body with story context, test results, and changed files.
 */
import { Injectable, Logger } from '@nestjs/common';
import { GitHubService } from '../../integrations/github/github.service';
import {
  DevAgentTestResults,
  DevAgentChangedFiles,
} from '../interfaces/dev-agent-execution.interfaces';

/**
 * Parameters for creating a dev agent pull request.
 */
export interface DevAgentPRParams {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  baseBranch: string;
  storyId: string;
  storyTitle: string;
  testResults: DevAgentTestResults | null;
  changedFiles: DevAgentChangedFiles;
}

/**
 * Result of PR creation.
 */
export interface DevAgentPRResult {
  prUrl: string;
  prNumber: number;
}

@Injectable()
export class DevAgentPRCreatorService {
  private readonly logger = new Logger(DevAgentPRCreatorService.name);

  constructor(private readonly githubService: GitHubService) {}

  /**
   * Create a pull request for the dev agent's work.
   * Uses GitHubService.createPullRequest() from Story 6.4.
   *
   * If PR already exists (409 Conflict), attempts to find and return the existing PR.
   *
   * @param params - PR creation parameters
   * @returns PR URL and number
   */
  async createPullRequest(
    params: DevAgentPRParams,
  ): Promise<DevAgentPRResult> {
    const title = `[DevOS-${params.storyId}] ${params.storyTitle}`;
    const body = this.buildPRBody(params);

    this.logger.log(
      `Creating PR for story ${params.storyId}: ${title}`,
    );

    try {
      const pr = await this.githubService.createPullRequest(
        params.githubToken,
        params.repoOwner,
        params.repoName,
        {
          title,
          head: params.branch,
          base: params.baseBranch,
          body,
        },
      );

      // Try to add labels (non-critical, errors are silently caught)
      try {
        await this.githubService.addLabelsToIssue(
          params.githubToken,
          params.repoOwner,
          params.repoName,
          pr.number,
          ['devos-agent', 'automated'],
        );
      } catch (labelError) {
        this.logger.warn(
          `Failed to add labels to PR #${pr.number}: ${labelError instanceof Error ? labelError.message : 'Unknown error'}`,
        );
      }

      this.logger.log(
        `PR #${pr.number} created successfully: ${pr.htmlUrl}`,
      );

      return {
        prUrl: pr.htmlUrl,
        prNumber: pr.number,
      };
    } catch (error) {
      // Check if PR already exists (ConflictException from GitHubService)
      if (
        error instanceof Error &&
        (error.message.includes('already exists') ||
          error.constructor.name === 'ConflictException')
      ) {
        this.logger.warn(
          `PR already exists for branch ${params.branch}, finding existing PR`,
        );
        return this.findExistingPR(params);
      }

      throw error;
    }
  }

  /**
   * Build the PR body with structured sections.
   */
  private buildPRBody(params: DevAgentPRParams): string {
    const sections: string[] = [];

    // Summary
    sections.push(`## Summary`);
    sections.push(
      `Implementation for story ${params.storyId}: ${params.storyTitle}`,
    );
    sections.push('');

    // Acceptance Criteria
    sections.push(`## Acceptance Criteria`);
    sections.push(
      `See story [DevOS-${params.storyId}] for full acceptance criteria.`,
    );
    sections.push('');

    // Test Results
    sections.push(`## Test Results`);
    if (params.testResults) {
      const { total, passed, failed, coverage } = params.testResults;
      sections.push(`| Metric | Value |`);
      sections.push(`| --- | --- |`);
      sections.push(`| Total Tests | ${total} |`);
      sections.push(`| Passed | ${passed} |`);
      sections.push(`| Failed | ${failed} |`);
      if (coverage !== null) {
        sections.push(`| Coverage | ${coverage}% |`);
      }
    } else {
      sections.push('Test results not available.');
    }
    sections.push('');

    // Files Changed
    sections.push(`## Files Changed`);
    const { created, modified, deleted } = params.changedFiles;
    sections.push(
      `- **Created**: ${created.length} file(s)`,
    );
    sections.push(
      `- **Modified**: ${modified.length} file(s)`,
    );
    sections.push(
      `- **Deleted**: ${deleted.length} file(s)`,
    );
    sections.push('');

    // Footer
    sections.push('---');
    sections.push('_Automated by DevOS Dev Agent_');

    return sections.join('\n');
  }

  /**
   * Find an existing PR for the given branch.
   * Used as fallback when PR creation returns a conflict.
   */
  private async findExistingPR(
    params: DevAgentPRParams,
  ): Promise<DevAgentPRResult> {
    try {
      const prList = await this.githubService.listPullRequests(
        params.githubToken,
        params.repoOwner,
        params.repoName,
        { state: 'open' },
      );

      const existingPR = prList.pullRequests.find(
        (pr) => pr.head.ref === params.branch,
      );

      if (existingPR) {
        return {
          prUrl: existingPR.htmlUrl,
          prNumber: existingPR.number,
        };
      }
    } catch (listError) {
      this.logger.warn(
        `Failed to find existing PR for branch ${params.branch}: ${listError instanceof Error ? listError.message : 'Unknown error'}`,
      );
    }

    throw new Error(
      `PR already exists for branch ${params.branch} but could not be found`,
    );
  }
}
