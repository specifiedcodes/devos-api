/**
 * WorkspaceManagerService
 * Story 11.2: Claude Code CLI Container Setup
 *
 * Manages workspace directories for agent CLI sessions.
 * Each project gets its own isolated directory with Git clone.
 */
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitConfigService } from './git-config.service';
import * as fs from 'fs';
import * as path from 'path';

/** Sensitive file patterns to remove during cleanup */
const SENSITIVE_FILE_PATTERNS = [
  /^\.env$/,
  /^\.env\..+$/,
  /^credentials\.json$/,
  /\.key$/,
  /\.pem$/,
  /^\.npmrc$/,
  /^\.docker\/config\.json$/,
];

@Injectable()
export class WorkspaceManagerService {
  private readonly logger = new Logger(WorkspaceManagerService.name);
  private readonly basePath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly gitConfigService: GitConfigService,
  ) {
    this.basePath = this.configService.get<string>(
      'CLI_WORKSPACE_BASE_PATH',
      '/workspaces',
    );
  }

  /**
   * Prepare workspace for a project: clone if new, pull if existing.
   *
   * @returns The absolute path to the workspace directory
   */
  async prepareWorkspace(
    workspaceId: string,
    projectId: string,
    gitRepoUrl: string,
    gitToken?: string,
    branch?: string,
  ): Promise<string> {
    const workspacePath = this.buildPath(workspaceId, projectId);

    this.logger.log(
      `Preparing workspace at ${workspacePath} for workspace ${workspaceId}, project ${projectId}`,
    );

    // Create directory structure if it doesn't exist
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
      this.logger.log(`Created workspace directory: ${workspacePath}`);
    }

    // Check if this is an existing repo or fresh clone
    const gitDir = path.join(workspacePath, '.git');
    if (fs.existsSync(gitDir)) {
      // Existing repo - pull latest
      this.logger.log(`Pulling latest for existing workspace: ${workspacePath}`);
      await this.gitConfigService.pullLatest(workspacePath, branch);
    } else {
      // Fresh clone
      this.logger.log(`Cloning repository into workspace: ${workspacePath}`);
      await this.gitConfigService.cloneRepository(
        gitRepoUrl,
        workspacePath,
        gitToken,
        branch,
      );
    }

    return workspacePath;
  }

  /**
   * Clean up workspace after session ends.
   * Removes sensitive files (.env, credentials) but keeps repo for next session.
   * Scans recursively through all subdirectories (except .git).
   */
  async cleanupWorkspace(
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    const workspacePath = this.buildPath(workspaceId, projectId);

    if (!fs.existsSync(workspacePath)) {
      this.logger.warn(
        `Workspace does not exist for cleanup: ${workspacePath}`,
      );
      return;
    }

    this.logger.log(`Cleaning up workspace: ${workspacePath}`);

    try {
      this.cleanupDirectory(workspacePath);
    } catch (error) {
      this.logger.error(
        `Error during workspace cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Recursively scan a directory for sensitive files and remove them.
   * Skips the .git directory to preserve repository state.
   */
  private cleanupDirectory(dirPath: string): void {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const isSensitive = SENSITIVE_FILE_PATTERNS.some((pattern) =>
          pattern.test(entry.name),
        );

        if (isSensitive) {
          const filePath = path.join(dirPath, entry.name);
          fs.unlinkSync(filePath);
          this.logger.log(`Removed sensitive file: ${entry.name}`);
        }
      } else if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') {
        // Recurse into subdirectories (skip .git and node_modules)
        this.cleanupDirectory(path.join(dirPath, entry.name));
      }
    }
  }

  /**
   * Completely remove a workspace directory.
   * Called when a project is deleted or workspace is removed.
   */
  async destroyWorkspace(
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    const workspacePath = this.buildPath(workspaceId, projectId);

    if (!fs.existsSync(workspacePath)) {
      this.logger.warn(
        `Workspace does not exist for destruction: ${workspacePath}`,
      );
      return;
    }

    this.logger.log(`Destroying workspace: ${workspacePath}`);
    fs.rmSync(workspacePath, { recursive: true, force: true });
    this.logger.log(`Workspace destroyed: ${workspacePath}`);
  }

  /**
   * Get the workspace path for a project.
   *
   * @throws NotFoundException if workspace does not exist
   */
  getWorkspacePath(workspaceId: string, projectId: string): string {
    const workspacePath = this.buildPath(workspaceId, projectId);

    if (!fs.existsSync(workspacePath)) {
      throw new NotFoundException(
        `Workspace not found for workspace ${workspaceId}, project ${projectId}`,
      );
    }

    return workspacePath;
  }

  /**
   * Check if a workspace exists and has a valid Git repo.
   */
  async isWorkspaceReady(
    workspaceId: string,
    projectId: string,
  ): Promise<boolean> {
    const workspacePath = this.buildPath(workspaceId, projectId);

    if (!fs.existsSync(workspacePath)) {
      return false;
    }

    const gitDir = path.join(workspacePath, '.git');
    return fs.existsSync(gitDir);
  }

  /**
   * Get workspace disk usage in bytes.
   */
  async getWorkspaceSize(
    workspaceId: string,
    projectId: string,
  ): Promise<number> {
    const workspacePath = this.buildPath(workspaceId, projectId);

    if (!fs.existsSync(workspacePath)) {
      return 0;
    }

    return this.calculateDirectorySize(workspacePath);
  }

  /**
   * Build the filesystem path for a workspace/project pair.
   * Validates that IDs do not contain path traversal sequences.
   *
   * @throws Error if workspaceId or projectId contain path traversal patterns
   */
  private buildPath(workspaceId: string, projectId: string): string {
    // Guard against path traversal attacks
    this.validatePathSegment(workspaceId, 'workspaceId');
    this.validatePathSegment(projectId, 'projectId');

    const result = path.join(this.basePath, workspaceId, projectId);

    // Double-check the resolved path is still under basePath
    const resolvedResult = path.resolve(result);
    const resolvedBase = path.resolve(this.basePath);
    if (!resolvedResult.startsWith(resolvedBase + path.sep)) {
      throw new Error(
        `Path traversal detected: resolved path ${resolvedResult} is outside base path ${resolvedBase}`,
      );
    }

    return result;
  }

  /**
   * Validate that a path segment does not contain traversal patterns.
   */
  private validatePathSegment(segment: string, name: string): void {
    if (
      !segment ||
      segment.includes('..') ||
      segment.includes('/') ||
      segment.includes('\\') ||
      segment.includes('\0')
    ) {
      throw new Error(
        `Invalid ${name}: must not contain path separators or traversal sequences`,
      );
    }
  }

  /**
   * Recursively calculate directory size.
   */
  private calculateDirectorySize(dirPath: string): number {
    let totalSize = 0;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isFile()) {
        const stat = fs.statSync(entryPath);
        totalSize += stat.size;
      } else if (entry.isDirectory()) {
        totalSize += this.calculateDirectorySize(entryPath);
      }
    }

    return totalSize;
  }
}
