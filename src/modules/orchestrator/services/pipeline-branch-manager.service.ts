/**
 * PipelineBranchManagerService
 * Story 11.3: Agent-to-CLI Execution Pipeline
 *
 * Manages Git branches for pipeline agents. Creates feature branches
 * following the devos/{agentType}/{storyId} naming convention.
 */
import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { GitConfigService } from './git-config.service';

/**
 * Parameters for creating a feature branch.
 */
export interface CreateFeatureBranchParams {
  workspacePath: string;
  agentType: string;
  storyId: string;
  baseBranch?: string;
}

@Injectable()
export class PipelineBranchManagerService {
  private readonly logger = new Logger(PipelineBranchManagerService.name);

  /** Pattern to validate Git branch name components (no shell metacharacters) */
  private static readonly SAFE_BRANCH_COMPONENT = /^[a-zA-Z0-9._\-]+$/;

  constructor(private readonly gitConfigService: GitConfigService) {}

  /**
   * Validate a branch name component to prevent command injection.
   * Only allows alphanumeric characters, dots, underscores, and hyphens.
   */
  private validateBranchComponent(value: string, label: string): void {
    if (!PipelineBranchManagerService.SAFE_BRANCH_COMPONENT.test(value)) {
      throw new Error(
        `Invalid ${label} for branch name: "${value}". Only alphanumeric characters, dots, underscores, and hyphens are allowed.`,
      );
    }
  }

  /**
   * Create a feature branch for an agent's work.
   * Branch naming: devos/{agent-type}/{story-id}
   * Example: devos/dev/11-3
   *
   * If branch already exists (from a retry), checks it out instead of creating new.
   */
  async createFeatureBranch(
    params: CreateFeatureBranchParams,
  ): Promise<string> {
    const { workspacePath, agentType, storyId, baseBranch = 'main' } = params;

    // Validate inputs to prevent command injection
    this.validateBranchComponent(agentType, 'agentType');
    this.validateBranchComponent(storyId, 'storyId');
    this.validateBranchComponent(baseBranch, 'baseBranch');

    const branchName = `devos/${agentType}/${storyId}`;

    this.logger.log(
      `Creating feature branch ${branchName} from ${baseBranch} in ${workspacePath}`,
    );

    // Check if branch already exists locally
    const localExists = await this.localBranchExists(
      workspacePath,
      branchName,
    );

    if (localExists) {
      this.logger.log(
        `Branch ${branchName} already exists, checking it out`,
      );
      await this.execGit(
        `git checkout ${branchName}`,
        workspacePath,
      );

      // Try to pull latest (ignore errors for local-only branches)
      try {
        await this.execGit(
          `git pull origin ${branchName}`,
          workspacePath,
        );
      } catch {
        this.logger.warn(
          `Could not pull ${branchName} from remote (may be local-only)`,
        );
      }
    } else {
      // Create new branch from base
      await this.execGit(
        `git checkout -b ${branchName} ${baseBranch}`,
        workspacePath,
      );
    }

    this.logger.log(`Feature branch ${branchName} ready`);
    return branchName;
  }

  /**
   * Get the current branch in a workspace.
   */
  async getCurrentBranch(workspacePath: string): Promise<string> {
    const { stdout } = await this.execGit(
      'git rev-parse --abbrev-ref HEAD',
      workspacePath,
    );
    return stdout.trim();
  }

  /**
   * Check if a branch exists locally or remotely.
   */
  async branchExists(
    workspacePath: string,
    branchName: string,
  ): Promise<boolean> {
    // Check local first
    const localExists = await this.localBranchExists(
      workspacePath,
      branchName,
    );
    if (localExists) return true;

    // Check remote
    try {
      const { stdout } = await this.execGit(
        `git ls-remote --heads origin ${branchName}`,
        workspacePath,
      );
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if a branch exists locally.
   */
  private async localBranchExists(
    workspacePath: string,
    branchName: string,
  ): Promise<boolean> {
    try {
      const { stdout } = await this.execGit(
        `git branch --list ${branchName}`,
        workspacePath,
      );
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Execute a git command with the given working directory.
   */
  private execGit(
    command: string,
    cwd: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      exec(
        command,
        {
          cwd,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
          timeout: 60_000,
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
}
