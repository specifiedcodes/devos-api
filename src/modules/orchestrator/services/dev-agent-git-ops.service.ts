/**
 * DevAgentGitOpsService
 * Story 11.4: Dev Agent CLI Integration
 *
 * Handles Git operations for the Dev Agent pipeline:
 * - Getting latest commit info
 * - Pushing branches to remote with token-based auth
 * - Getting changed files between branches
 *
 * Uses child_process.exec for local Git operations (not Octokit).
 * Follows the same input validation pattern as PipelineBranchManagerService.
 */
import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import {
  DevAgentCommitInfo,
  DevAgentChangedFiles,
} from '../interfaces/dev-agent-execution.interfaces';

/** Pattern to validate branch name components (no shell metacharacters) */
const SAFE_BRANCH_COMPONENT = /^[a-zA-Z0-9._\-/]+$/;

/** Git push timeout: 2 minutes */
const GIT_PUSH_TIMEOUT_MS = 120_000;

/** Git command timeout: 30 seconds */
const GIT_COMMAND_TIMEOUT_MS = 30_000;

@Injectable()
export class DevAgentGitOpsService {
  private readonly logger = new Logger(DevAgentGitOpsService.name);

  /**
   * Validate input to prevent command injection.
   * Only allows alphanumeric characters, dots, underscores, hyphens, and slashes.
   */
  private validateInput(value: string, label: string): void {
    if (!SAFE_BRANCH_COMPONENT.test(value)) {
      throw new Error(
        `Invalid ${label}: "${value}". Only alphanumeric characters, dots, underscores, hyphens, and slashes are allowed.`,
      );
    }
  }

  /**
   * Execute a git command and return stdout/stderr.
   * Follows the same pattern as PipelineBranchManagerService.
   */
  private execGit(
    command: string,
    cwd: string,
    timeout: number = GIT_COMMAND_TIMEOUT_MS,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      exec(
        command,
        {
          cwd,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
          timeout,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        },
      );
    });
  }

  /**
   * Get the latest commit on the current branch.
   *
   * @param workspacePath - Local workspace directory
   * @returns Commit info or null if no commits exist
   */
  async getLatestCommit(
    workspacePath: string,
  ): Promise<DevAgentCommitInfo | null> {
    try {
      const DELIM = '\x1e'; // ASCII record separator - safe delimiter for git log
      const { stdout } = await this.execGit(
        `git log -1 --format="%H${DELIM}%s${DELIM}%an${DELIM}%ai"`,
        workspacePath,
      );

      const trimmed = stdout.trim();
      if (!trimmed) {
        return null;
      }

      const parts = trimmed.split(DELIM);
      if (parts.length < 4) {
        this.logger.warn(
          `Unexpected git log format: "${trimmed}"`,
        );
        return null;
      }

      return {
        hash: parts[0],
        message: parts[1],
        author: parts[2],
        timestamp: new Date(parts.slice(3).join(DELIM)),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to get latest commit in ${workspacePath}: ${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * Push a feature branch to the remote repository.
   * Uses token-based authentication (no SSH key needed).
   *
   * If push fails with rejection, retries once after pull --rebase.
   * Never logs the token value.
   *
   * @param workspacePath - Local workspace directory
   * @param branchName - Branch name to push
   * @param githubToken - GitHub access token for authentication
   * @param repoOwner - Repository owner
   * @param repoName - Repository name
   */
  async pushBranch(
    workspacePath: string,
    branchName: string,
    githubToken: string,
    repoOwner: string,
    repoName: string,
  ): Promise<void> {
    this.validateInput(branchName, 'branchName');
    this.validateInput(repoOwner, 'repoOwner');
    this.validateInput(repoName, 'repoName');

    const pushUrl = `https://x-access-token:${githubToken}@github.com/${repoOwner}/${repoName}.git`;

    /** Scrub token from any string to prevent accidental leakage */
    const sanitize = (msg: string): string =>
      githubToken ? msg.replaceAll(githubToken, '***') : msg;

    this.logger.log(
      `Pushing branch ${branchName} to ${repoOwner}/${repoName}`,
    );

    try {
      await this.execGit(
        `git push "${pushUrl}" ${branchName}`,
        workspacePath,
        GIT_PUSH_TIMEOUT_MS,
      );

      this.logger.log(
        `Successfully pushed branch ${branchName} to ${repoOwner}/${repoName}`,
      );
    } catch (firstError) {
      const firstErrorMessage =
        firstError instanceof Error
          ? firstError.message
          : 'Unknown error';

      this.logger.warn(
        `Push failed for ${branchName}, attempting pull --rebase and retry: ${sanitize(firstErrorMessage)}`,
      );

      // Retry: pull --rebase then push again
      try {
        await this.execGit(
          `git pull --rebase origin ${branchName}`,
          workspacePath,
        );

        await this.execGit(
          `git push "${pushUrl}" ${branchName}`,
          workspacePath,
          GIT_PUSH_TIMEOUT_MS,
        );

        this.logger.log(
          `Successfully pushed branch ${branchName} after retry`,
        );
      } catch (retryError) {
        const retryErrorMessage =
          retryError instanceof Error
            ? retryError.message
            : 'Unknown error';

        throw new Error(
          `Failed to push branch ${branchName} to ${repoOwner}/${repoName} after retry: ${sanitize(retryErrorMessage)}`,
        );
      }
    }
  }

  /**
   * Get a list of files changed on the feature branch vs the base branch.
   *
   * @param workspacePath - Local workspace directory
   * @param branchName - Feature branch name
   * @param baseBranch - Base branch to compare against (default: 'main')
   * @returns Object with created, modified, and deleted file arrays
   */
  async getChangedFiles(
    workspacePath: string,
    branchName: string,
    baseBranch: string = 'main',
  ): Promise<DevAgentChangedFiles> {
    this.validateInput(branchName, 'branchName');
    this.validateInput(baseBranch, 'baseBranch');

    const created: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    try {
      const { stdout } = await this.execGit(
        `git diff --name-status ${baseBranch}...${branchName}`,
        workspacePath,
      );

      const lines = stdout
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 2) continue;

        const status = parts[0].charAt(0);
        const filePath = parts[parts.length - 1];

        switch (status) {
          case 'A':
            created.push(filePath);
            break;
          case 'M':
            modified.push(filePath);
            break;
          case 'D':
            deleted.push(filePath);
            break;
          case 'R':
            // Renamed files - treat as modified
            modified.push(filePath);
            break;
          default:
            modified.push(filePath);
            break;
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to get changed files for ${branchName} vs ${baseBranch}: ${errorMessage}`,
      );
    }

    return { created, modified, deleted };
  }
}
