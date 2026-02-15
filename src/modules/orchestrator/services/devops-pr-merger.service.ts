/**
 * DevOpsPRMergerService
 * Story 11.7: DevOps Agent CLI Integration
 *
 * Merges approved PRs to the target branch via GitHub API.
 * Uses GitHubService.mergePullRequest() from Story 6.4.
 * Default merge method: squash (clean history).
 */
import { Injectable, Logger } from '@nestjs/common';
import { GitHubService } from '../../integrations/github/github.service';
import { DevOpsMergeResult } from '../interfaces/devops-agent-execution.interfaces';

@Injectable()
export class DevOpsPRMergerService {
  private readonly logger = new Logger(DevOpsPRMergerService.name);

  constructor(private readonly githubService: GitHubService) {}

  /**
   * Merge an approved PR to the target branch via GitHub API.
   *
   * @param params - Merge parameters including token, repo info, PR number
   * @returns DevOpsMergeResult with merge commit hash on success
   */
  async mergePullRequest(params: {
    githubToken: string;
    repoOwner: string;
    repoName: string;
    prNumber: number;
    mergeMethod?: 'merge' | 'squash' | 'rebase';
  }): Promise<DevOpsMergeResult> {
    const mergeMethod = params.mergeMethod || 'squash';

    this.logger.log(
      `Merging PR #${params.prNumber} in ${params.repoOwner}/${params.repoName} with method: ${mergeMethod}`,
    );

    try {
      const response = await this.githubService.mergePullRequest(
        params.githubToken,
        params.repoOwner,
        params.repoName,
        params.prNumber,
        {
          mergeMethod,
          commitTitle: `Merge PR #${params.prNumber}`,
        },
      );

      if (response.merged) {
        this.logger.log(
          `PR #${params.prNumber} merged successfully. Commit: ${response.sha}`,
        );

        return {
          success: true,
          mergeCommitHash: response.sha || null,
          mergedAt: new Date(),
          error: null,
        };
      }

      // Merge was not performed (e.g., already merged or not mergeable)
      return {
        success: false,
        mergeCommitHash: null,
        mergedAt: null,
        error: response.message || 'PR could not be merged',
      };
    } catch (error: any) {
      const statusCode = error?.status || error?.response?.status;
      const errorMessage =
        error?.message || error?.response?.data?.message || 'Unknown error';

      this.logger.error(
        `Failed to merge PR #${params.prNumber}: status=${statusCode}, message=${errorMessage}`,
      );

      // Handle specific GitHub API error cases
      if (statusCode === 409) {
        return {
          success: false,
          mergeCommitHash: null,
          mergedAt: null,
          error: `Merge conflict: ${errorMessage}`,
        };
      }

      if (statusCode === 403 || statusCode === 422) {
        return {
          success: false,
          mergeCommitHash: null,
          mergedAt: null,
          error: `Branch protection violation: ${errorMessage}`,
        };
      }

      return {
        success: false,
        mergeCommitHash: null,
        mergedAt: null,
        error: `GitHub API error: ${errorMessage}`,
      };
    }
  }
}
