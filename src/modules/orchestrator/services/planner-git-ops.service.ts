/**
 * PlannerGitOpsService
 * Story 11.6: Planner Agent CLI Integration
 *
 * Handles Git operations for planning documents:
 * - Staging specific planning document files
 * - Committing with descriptive planning messages
 * - Pushing to remote (delegates to DevAgentGitOpsService)
 *
 * Reuses DevAgentGitOpsService for push and commit verification.
 */
import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { DevAgentGitOpsService } from './dev-agent-git-ops.service';
import { PlannerTaskType } from '../interfaces/planner-agent-execution.interfaces';

/** Pattern to validate file paths (no shell metacharacters) */
const SAFE_PATH_COMPONENT = /^[a-zA-Z0-9._\-/]+$/;

/** Git command timeout: 30 seconds */
const GIT_COMMAND_TIMEOUT_MS = 30_000;

@Injectable()
export class PlannerGitOpsService {
  private readonly logger = new Logger(PlannerGitOpsService.name);

  constructor(private readonly devAgentGitOps: DevAgentGitOpsService) {}

  /**
   * Stage specific planning document files for commit.
   * Uses git add for each file individually (not git add -A).
   *
   * @param workspacePath - Local workspace directory
   * @param filePaths - List of relative or absolute file paths to stage
   */
  async stageDocuments(
    workspacePath: string,
    filePaths: string[],
  ): Promise<void> {
    if (filePaths.length === 0) {
      this.logger.log('No files to stage, skipping');
      return;
    }

    for (const filePath of filePaths) {
      // Validate file path to prevent command injection.
      // Reject (not strip) paths with unsafe characters to avoid silent corruption.
      if (!filePath || !SAFE_PATH_COMPONENT.test(filePath)) {
        this.logger.warn(
          `Skipping file with unsafe path: ${filePath}`,
        );
        continue;
      }
      const sanitizedPath = filePath;

      try {
        await this.execGit(
          `git add "${sanitizedPath}"`,
          workspacePath,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Failed to stage file ${sanitizedPath}: ${errorMessage}`,
        );
        // Continue staging other files even if one fails
      }
    }

    this.logger.log(`Staged ${filePaths.length} planning documents`);
  }

  /**
   * Commit planning documents with a descriptive message.
   * Message format: plan(devos-{epicId}): Generate {task description} ({count} files)
   *
   * @param params - Commit parameters
   * @returns Commit hash and message, or null if no changes to commit
   */
  async commitDocuments(params: {
    workspacePath: string;
    epicId: string;
    planningTask: PlannerTaskType;
    documentsGenerated: number;
  }): Promise<{ hash: string; message: string } | null> {
    const taskDescriptions: Record<string, string> = {
      'create-project-plan': 'project plan with epics and stories',
      'breakdown-epic': 'epic breakdown into stories',
      'create-stories': 'story files with acceptance criteria',
      'generate-prd': 'product requirements document',
      'generate-architecture': 'architecture document',
    };

    const taskDescription =
      taskDescriptions[params.planningTask] || 'planning documents';
    const message = `plan(devos-${params.epicId}): Generate ${taskDescription} (${params.documentsGenerated} files)`;

    try {
      // Use single quotes to prevent shell interpretation of special characters
      // in the message (which may contain user-provided epicId values).
      // Escape any single quotes within the message itself.
      const escapedMessage = message.replace(/'/g, "'\\''");
      await this.execGit(
        `git commit -m '${escapedMessage}'`,
        params.workspacePath,
      );

      // Get the commit hash
      const latestCommit = await this.devAgentGitOps.getLatestCommit(
        params.workspacePath,
      );

      if (latestCommit) {
        this.logger.log(
          `Committed planning documents: ${latestCommit.hash.substring(0, 8)} - ${message}`,
        );
        return { hash: latestCommit.hash, message };
      }

      return null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Check if the error is "nothing to commit"
      if (
        errorMessage.includes('nothing to commit') ||
        errorMessage.includes('no changes added')
      ) {
        this.logger.log('No changes to commit');
        return null;
      }

      this.logger.error(`Failed to commit planning documents: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Push planning commits to remote repository.
   * Delegates to DevAgentGitOpsService.pushBranch() for push logic.
   * Planner works on main branch by default.
   *
   * @param params - Push parameters
   */
  async pushToRemote(params: {
    workspacePath: string;
    githubToken: string;
    repoOwner: string;
    repoName: string;
    branch?: string;
  }): Promise<void> {
    const branch = params.branch || 'main';

    this.logger.log(
      `Pushing planning documents to ${params.repoOwner}/${params.repoName} on branch ${branch}`,
    );

    await this.devAgentGitOps.pushBranch(
      params.workspacePath,
      branch,
      params.githubToken,
      params.repoOwner,
      params.repoName,
    );

    this.logger.log('Planning documents pushed successfully');
  }

  /**
   * Execute a git command in the workspace.
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
}
