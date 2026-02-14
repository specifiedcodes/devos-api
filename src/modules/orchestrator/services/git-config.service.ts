/**
 * GitConfigService
 * Story 11.2: Claude Code CLI Container Setup
 *
 * Manages Git configuration and authentication for CLI sessions.
 * Uses GitHub OAuth tokens from integration module (Story 6.1).
 * Tokens are passed per-operation, never stored in .git/config permanently.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';

@Injectable()
export class GitConfigService {
  private readonly logger = new Logger(GitConfigService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Configure Git for a workspace with token authentication.
   * Token is passed via environment variable, not stored on disk.
   * Uses --local scope and environment-based credential helper.
   */
  async configureGitAuth(
    workspacePath: string,
    githubToken: string,
  ): Promise<void> {
    this.logger.log(`Configuring Git auth for workspace: ${workspacePath}`);

    try {
      // Configure credential helper via environment variable rather than storing in .git/config.
      // The GIT_ASKPASS approach avoids persisting any credential-related config to disk.
      await this.execGit(
        `git config --local credential.helper '!f() { echo "username=x-access-token"; echo "password=$GIT_TOKEN"; }; f'`,
        workspacePath,
        { GIT_TOKEN: githubToken },
      );

      // Disable interactive prompts
      await this.execGit(
        'git config --local core.askPass ""',
        workspacePath,
      );

      // Set terminal prompt to 0 to ensure no interactive fallback
      await this.execGit(
        'git config --local core.sshCommand "ssh -o StrictHostKeyChecking=no"',
        workspacePath,
      );
    } catch (error) {
      this.logger.error(
        `Failed to configure Git auth: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Clone a repository into the workspace path.
   * Uses token-based HTTPS authentication.
   *
   * @throws Error if clone fails
   */
  async cloneRepository(
    repoUrl: string,
    workspacePath: string,
    githubToken?: string,
    branch?: string,
  ): Promise<void> {
    this.logger.log(`Cloning repository into: ${workspacePath}`);

    try {
      // Validate branch name to prevent command injection
      if (branch) {
        this.validateGitRef(branch);
      }

      // Build token-embedded HTTPS URL if token is provided
      let cloneUrl = repoUrl;
      if (githubToken) {
        cloneUrl = this.buildAuthenticatedUrl(repoUrl, githubToken);
      }

      // Build clone command with sanitized inputs
      let command = `git clone`;
      if (branch) {
        command += ` --branch "${branch}"`;
      }
      command += ` "${cloneUrl}" "${workspacePath}"`;

      // Execute clone with GIT_TERMINAL_PROMPT=0 to prevent interactive prompts
      await this.execGit(command, undefined, {
        GIT_TERMINAL_PROMPT: '0',
      });

      this.logger.log(`Repository cloned successfully into: ${workspacePath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Sanitize error message to avoid leaking tokens
      const sanitizedError = this.sanitizeGitError(errorMessage);
      this.logger.error(`Failed to clone repository: ${sanitizedError}`);
      throw new Error(`Git clone failed: ${sanitizedError}`);
    }
  }

  /**
   * Pull latest changes from remote.
   *
   * @throws Error if pull fails (conflict, auth, etc.)
   */
  async pullLatest(
    workspacePath: string,
    branch?: string,
  ): Promise<void> {
    const targetBranch = branch || 'main';

    // Validate branch name to prevent command injection
    this.validateGitRef(targetBranch);

    this.logger.log(
      `Pulling latest changes for branch ${targetBranch} in: ${workspacePath}`,
    );

    try {
      // Fetch and pull
      await this.execGit(`git fetch origin`, workspacePath, {
        GIT_TERMINAL_PROMPT: '0',
      });
      await this.execGit(
        `git checkout "${targetBranch}"`,
        workspacePath,
      );
      await this.execGit(
        `git pull origin "${targetBranch}"`,
        workspacePath,
        { GIT_TERMINAL_PROMPT: '0' },
      );

      this.logger.log(`Successfully pulled latest for: ${workspacePath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const sanitizedError = this.sanitizeGitError(errorMessage);
      this.logger.error(`Failed to pull latest: ${sanitizedError}`);
      throw new Error(`Git pull failed: ${sanitizedError}`);
    }
  }

  /**
   * Configure git author for agent commits.
   * Uses configured GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL from environment.
   * Values are sanitized to prevent command injection.
   */
  async configureGitAuthor(workspacePath: string): Promise<void> {
    const authorName = this.configService.get<string>(
      'GIT_AUTHOR_NAME',
      'DevOS Agent',
    );
    const authorEmail = this.configService.get<string>(
      'GIT_AUTHOR_EMAIL',
      'agent@devos.ai',
    );

    // Sanitize values to prevent shell injection via env vars
    const safeName = this.sanitizeShellValue(authorName);
    const safeEmail = this.sanitizeShellValue(authorEmail);

    this.logger.log(
      `Configuring Git author: ${safeName} <${safeEmail}>`,
    );

    try {
      await this.execGit(
        `git config user.name "${safeName}"`,
        workspacePath,
      );
      await this.execGit(
        `git config user.email "${safeEmail}"`,
        workspacePath,
      );
    } catch (error) {
      this.logger.error(
        `Failed to configure Git author: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Sanitize a value for safe use in shell commands within double quotes.
   * Removes characters that could break out of double-quoted strings.
   */
  private sanitizeShellValue(value: string): string {
    // Remove shell metacharacters that could escape double quotes
    return value.replace(/[`$\\!;"'(){}|&<>]/g, '');
  }

  /**
   * Build authenticated HTTPS URL with token.
   * Format: https://x-access-token:{token}@github.com/{owner}/{repo}.git
   */
  private buildAuthenticatedUrl(
    repoUrl: string,
    token: string,
  ): string {
    try {
      const url = new URL(repoUrl);
      url.username = 'x-access-token';
      url.password = token;
      return url.toString();
    } catch {
      // If URL parsing fails, try string manipulation
      return repoUrl.replace(
        'https://',
        `https://x-access-token:${token}@`,
      );
    }
  }

  /**
   * Execute a git command with optional working directory and environment.
   */
  private execGit(
    command: string,
    cwd?: string,
    env?: Record<string, string>,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      exec(
        command,
        {
          cwd,
          env: { ...process.env, ...env },
          timeout: 120_000, // 2 minute timeout for git operations
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
   * Validate a Git ref (branch/tag) name to prevent command injection.
   * Rejects refs containing shell metacharacters or suspicious patterns.
   *
   * @throws Error if ref name is invalid
   */
  private validateGitRef(ref: string): void {
    if (!ref || ref.trim() === '') {
      throw new Error('Git ref name must not be empty');
    }

    // Git ref names must not contain these characters
    // (based on git-check-ref-format rules + shell safety)
    const invalidPatterns = /[\s~^:?*\[\]\\`$(){}|;&<>!'"]/;
    if (invalidPatterns.test(ref)) {
      throw new Error(
        `Invalid Git ref name "${ref}": contains disallowed characters`,
      );
    }

    // Must not start with - (could be interpreted as a flag)
    if (ref.startsWith('-')) {
      throw new Error(
        `Invalid Git ref name "${ref}": must not start with a hyphen`,
      );
    }

    // Must not contain ..
    if (ref.includes('..')) {
      throw new Error(
        `Invalid Git ref name "${ref}": must not contain ".."`,
      );
    }
  }

  /**
   * Sanitize Git error messages to avoid leaking tokens or credentials.
   */
  private sanitizeGitError(message: string): string {
    // Remove any URLs with tokens
    return message
      .replace(/https?:\/\/[^@]+@/g, 'https://***@')
      .replace(/ghp_[a-zA-Z0-9]+/g, 'ghp_***')
      .replace(/gho_[a-zA-Z0-9]+/g, 'gho_***')
      .replace(/x-access-token:[^@]+/g, 'x-access-token:***');
  }
}
