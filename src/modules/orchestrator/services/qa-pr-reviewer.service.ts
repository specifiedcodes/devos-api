/**
 * QAPRReviewerService
 * Story 11.5: QA Agent CLI Integration
 *
 * Submits PR reviews via GitHub API with the QA report.
 * Uses GitHubService for API access and Octokit for review submission.
 */
import { Injectable, Logger } from '@nestjs/common';
import { GitHubService } from '../../integrations/github/github.service';
import { QAReport } from '../interfaces/qa-agent-execution.interfaces';

/**
 * Parameters for submitting a PR review.
 */
export interface QAPRReviewParams {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  prNumber: number;
  report: QAReport;
  verdict: 'PASS' | 'FAIL' | 'NEEDS_CHANGES';
}

@Injectable()
export class QAPRReviewerService {
  private readonly logger = new Logger(QAPRReviewerService.name);

  constructor(private readonly githubService: GitHubService) {}

  /**
   * Comment on the PR with the QA report and submit a review.
   * Uses GitHubService to add a review comment.
   *
   * @param params - PR review parameters
   */
  async submitPRReview(params: QAPRReviewParams): Promise<void> {
    const { githubToken, repoOwner, repoName, prNumber, report, verdict } = params;

    this.logger.log(
      `Submitting PR review for ${repoOwner}/${repoName}#${prNumber} with verdict: ${verdict}`,
    );

    const body = this.buildReviewBody(report);
    const event = this.verdictToReviewEvent(verdict);

    const client = this.githubService.getClient(githubToken);

    try {
      await client.pulls.createReview({
        owner: repoOwner,
        repo: repoName,
        pull_number: prNumber,
        body,
        event,
      });

      this.logger.log(
        `PR review submitted successfully: ${verdict} -> ${event}`,
      );
    } catch (reviewError) {
      this.logger.warn(
        `Failed to submit PR review, falling back to comment: ${reviewError instanceof Error ? reviewError.message : 'Unknown error'}`,
      );

      // Fallback: post a regular comment (reuse same client instance)
      try {
        await client.issues.createComment({
          owner: repoOwner,
          repo: repoName,
          issue_number: prNumber,
          body,
        });

        this.logger.log('PR comment posted as fallback');
      } catch (commentError) {
        this.logger.error(
          `Failed to post PR comment fallback: ${commentError instanceof Error ? commentError.message : 'Unknown error'}`,
        );
        // Don't rethrow - QA workflow should continue even if PR comment fails
      }
    }
  }

  /**
   * Build the PR review body with markdown sections.
   */
  private buildReviewBody(report: QAReport): string {
    const sections: string[] = [];

    // Header with verdict badge
    const verdictBadge = this.getVerdictBadge(report.verdict);
    sections.push(`## QA Report - ${verdictBadge}`);
    sections.push('');

    // Test Results
    sections.push('### Test Results');
    sections.push('| Metric | Value |');
    sections.push('| --- | --- |');
    sections.push(`| Total Tests | ${report.testResults.total} |`);
    sections.push(`| Passed | ${report.testResults.passed} |`);
    sections.push(`| Failed | ${report.testResults.failed} |`);
    sections.push(`| Skipped | ${report.testResults.skipped} |`);
    if (report.testResults.coverage !== null) {
      sections.push(`| Coverage | ${report.testResults.coverage}% |`);
    }
    if (report.coverageAnalysis.delta !== null) {
      const deltaSign = report.coverageAnalysis.delta >= 0 ? '+' : '';
      sections.push(
        `| Coverage Delta | ${deltaSign}${report.coverageAnalysis.delta}% |`,
      );
    }
    sections.push('');

    // Static Analysis
    sections.push('### Static Analysis');
    sections.push(
      `- **Lint**: ${report.lintResults.passed ? 'PASS' : 'FAIL'} - ${report.lintResults.errors} error(s), ${report.lintResults.warnings} warning(s)`,
    );
    sections.push(
      `- **Type Check**: ${report.typeCheckResults.passed ? 'PASS' : 'FAIL'} - ${report.typeCheckResults.errors} error(s)`,
    );
    sections.push('');

    // Security Scan
    sections.push('### Security Scan');
    sections.push(
      `- **npm audit**: ${report.securityScan.passed ? 'PASS' : 'FAIL'} - Critical: ${report.securityScan.critical}, High: ${report.securityScan.high}, Medium: ${report.securityScan.medium}, Low: ${report.securityScan.low}`,
    );
    sections.push('');

    // Acceptance Criteria
    if (report.acceptanceCriteria.length > 0) {
      sections.push('### Acceptance Criteria');
      for (const criterion of report.acceptanceCriteria) {
        const check = criterion.met ? 'x' : ' ';
        sections.push(
          `- [${check}] **${criterion.criterion}** - ${criterion.evidence}`,
        );
      }
      sections.push('');
    }

    // Issues Found
    if (report.comments.length > 0) {
      sections.push('### Issues Found');
      for (const comment of report.comments) {
        sections.push(`- ${comment}`);
      }
      sections.push('');
    }

    // Failed Tests Detail
    if (report.testResults.failedTests.length > 0) {
      sections.push('### Failed Tests');
      for (const ft of report.testResults.failedTests) {
        sections.push(`- **${ft.testName}** (${ft.file}): ${ft.error}`);
      }
      sections.push('');
    }

    // Summary
    sections.push(`### Summary`);
    sections.push(report.summary);
    sections.push('');

    // Footer
    sections.push('---');
    sections.push('_Automated by DevOS QA Agent_');

    return sections.join('\n');
  }

  /**
   * Map verdict to GitHub PR review event.
   */
  private verdictToReviewEvent(
    verdict: 'PASS' | 'FAIL' | 'NEEDS_CHANGES',
  ): 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' {
    switch (verdict) {
      case 'PASS':
        return 'APPROVE';
      case 'FAIL':
        return 'REQUEST_CHANGES';
      case 'NEEDS_CHANGES':
        return 'COMMENT';
    }
  }

  /**
   * Get a text badge for the verdict.
   */
  private getVerdictBadge(verdict: 'PASS' | 'FAIL' | 'NEEDS_CHANGES'): string {
    switch (verdict) {
      case 'PASS':
        return 'PASS';
      case 'FAIL':
        return 'FAIL';
      case 'NEEDS_CHANGES':
        return 'NEEDS_CHANGES';
    }
  }
}
