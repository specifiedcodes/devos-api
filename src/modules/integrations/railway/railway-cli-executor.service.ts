/**
 * RailwayCliExecutor Service
 * Story 23-4: Railway CLI Executor Service
 *
 * Spawns Railway CLI child processes with secure credential isolation,
 * command allowlisting, output streaming, sanitization, and timeout handling.
 *
 * Architecture References: Decision 5 (CLI Execution Strategy),
 * Decision 6 (CLI Installation), Decision 7 (Credential Isolation)
 */
import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { spawn } from 'child_process';

// ============================================================
// Exported Interfaces
// ============================================================

export interface RailwayCliOptions {
  /** Railway CLI command to execute (must be in allowlist) */
  command: string;
  /** Decrypted Railway token for authentication */
  railwayToken: string;
  /** Working directory for the CLI process */
  cwd?: string;
  /** Additional arguments for the command (e.g., ['list'] for 'variable list') */
  args?: string[];
  /** Railway service name (-s flag) */
  service?: string;
  /** Railway environment name (-e flag) */
  environment?: string;
  /** Additional CLI flags (e.g., ['--detach', '-y']) */
  flags?: string[];
  /** Override default timeout in milliseconds */
  timeoutMs?: number;
  /** Callback for real-time output streaming */
  onOutput?: (line: string, stream: 'stdout' | 'stderr') => void;
}

export interface RailwayCliResult {
  /** Process exit code (0 = success) */
  exitCode: number;
  /** Sanitized stdout content */
  stdout: string;
  /** Sanitized stderr content */
  stderr: string;
  /** Total execution time in milliseconds */
  durationMs: number;
  /** Whether the process was killed due to timeout */
  timedOut: boolean;
}

// ============================================================
// Constants
// ============================================================

/** Commands permitted for Railway CLI execution */
const ALLOWED_COMMANDS = new Set([
  'whoami',
  'status',
  'list',
  'init',
  'link',
  'up',
  'add',
  'redeploy',
  'restart',
  'down',
  'domain',
  'logs',
  'variable',
  'environment',
  'service',
  'connect',
]);

/** Commands explicitly denied (security risk) */
const DENIED_COMMANDS = new Set([
  'login',
  'logout',
  'open',
  'delete',
  'ssh',
  'shell',
  'run',
]);

/** Commands that use the extended deploy timeout */
const DEPLOY_COMMANDS = new Set(['up', 'redeploy']);

/** Default timeout for deploy commands: 10 minutes */
const DEPLOY_TIMEOUT_MS = 600_000;

/** Default timeout for non-deploy commands: 2 minutes */
const COMMAND_TIMEOUT_MS = 120_000;

/** Grace period before SIGKILL after SIGTERM: 5 seconds */
const SIGKILL_GRACE_MS = 5_000;

/** Pattern to detect shell injection characters */
const SHELL_INJECTION_PATTERN = /[;&|`$(){}]/;

/** Railway CLI binary path */
const CLI_PATH = 'railway';

// ============================================================
// Service Implementation
// ============================================================

@Injectable()
export class RailwayCliExecutor {
  private readonly logger = new Logger(RailwayCliExecutor.name);

  /**
   * Execute a Railway CLI command with streaming output.
   *
   * @param options - CLI execution options
   * @returns Structured result with exit code, sanitized output, and timing
   * @throws ForbiddenException if command is not in allowlist or contains injection
   */
  async execute(options: RailwayCliOptions): Promise<RailwayCliResult> {
    // 1. Validate command
    this.validateCommand(options.command);

    // 2. Build spawn arguments
    const spawnArgs = this.buildArgs(options);

    // 3. Build sanitized environment
    const env = this.buildSanitizedEnv(options.railwayToken);

    // 4. Determine timeout
    const timeoutMs = options.timeoutMs ?? this.getDefaultTimeout(options.command);

    // 5. Spawn child process and collect output
    return this.spawnAndCollect(spawnArgs, env, options, timeoutMs);
  }

  // ------------------------------------------------------------------
  // Command Validation
  // ------------------------------------------------------------------

  /**
   * Validate that the command is in the allowlist and does not contain
   * shell injection characters.
   */
  private validateCommand(command: string): void {
    if (!command || command.trim().length === 0) {
      throw new ForbiddenException(
        'Railway CLI command is required',
      );
    }

    // Check for shell injection patterns
    if (SHELL_INJECTION_PATTERN.test(command)) {
      throw new ForbiddenException(
        `Railway CLI command contains forbidden characters: ${command}`,
      );
    }

    // Check allowlist
    const baseCommand = command.trim().split(/\s+/)[0];

    if (DENIED_COMMANDS.has(baseCommand)) {
      throw new ForbiddenException(
        `Railway CLI command '${baseCommand}' is explicitly denied for security reasons`,
      );
    }

    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      throw new ForbiddenException(
        `Railway CLI command '${baseCommand}' is not in the allowlist. ` +
        `Allowed commands: ${[...ALLOWED_COMMANDS].join(', ')}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Argument Building
  // ------------------------------------------------------------------

  /**
   * Build the arguments array for child_process.spawn().
   */
  private buildArgs(options: RailwayCliOptions): string[] {
    const args: string[] = [options.command];

    // Append additional args (e.g., 'list' for 'variable list')
    if (options.args && options.args.length > 0) {
      args.push(...options.args);
    }

    // Append service flag
    if (options.service) {
      args.push('-s', options.service);
    }

    // Append environment flag
    if (options.environment) {
      args.push('-e', options.environment);
    }

    // Append additional flags
    if (options.flags && options.flags.length > 0) {
      args.push(...options.flags);
    }

    return args;
  }

  // ------------------------------------------------------------------
  // Credential Isolation
  // ------------------------------------------------------------------

  /**
   * Build a sanitized environment for the child process.
   * Only includes RAILWAY_TOKEN, HOME, PATH, NODE_ENV.
   * No host environment variables are inherited.
   */
  private buildSanitizedEnv(railwayToken: string): Record<string, string> {
    return {
      RAILWAY_TOKEN: railwayToken,
      HOME: '/tmp/railway-sandbox',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      NODE_ENV: 'production',
    };
  }

  // ------------------------------------------------------------------
  // Timeout Management
  // ------------------------------------------------------------------

  /**
   * Determine the default timeout based on command type.
   */
  private getDefaultTimeout(command: string): number {
    return DEPLOY_COMMANDS.has(command) ? DEPLOY_TIMEOUT_MS : COMMAND_TIMEOUT_MS;
  }

  // ------------------------------------------------------------------
  // Process Spawning & Output Collection
  // ------------------------------------------------------------------

  /**
   * Spawn the CLI process, collect output, handle timeouts.
   */
  private spawnAndCollect(
    args: string[],
    env: Record<string, string>,
    options: RailwayCliOptions,
    timeoutMs: number,
  ): Promise<RailwayCliResult> {
    return new Promise<RailwayCliResult>((resolve) => {
      const startTime = Date.now();
      let timedOut = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let resolved = false;

      // Spawn the child process
      const child = spawn(CLI_PATH, args, {
        env,
        cwd: options.cwd || '/tmp/railway-sandbox',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // --- Timeout Handling ---
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        this.logger.warn(
          `Railway CLI command '${options.command}' timed out after ${timeoutMs}ms. Sending SIGTERM.`,
        );
        child.kill('SIGTERM');

        // If still alive after grace period, force kill
        setTimeout(() => {
          if (!resolved) {
            this.logger.warn(
              `Railway CLI command '${options.command}' did not exit after SIGTERM. Sending SIGKILL.`,
            );
            child.kill('SIGKILL');
          }
        }, SIGKILL_GRACE_MS);
      }, timeoutMs);

      // --- stdout Streaming ---
      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          const raw = data.toString();
          const lines = raw.split('\n').filter((line) => line.length > 0);

          for (const line of lines) {
            const sanitized = sanitizeCliOutput(line);
            stdoutBuffer += sanitized + '\n';

            if (options.onOutput) {
              options.onOutput(sanitized, 'stdout');
            }
          }
        });
      }

      // --- stderr Streaming ---
      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          const raw = data.toString();
          const lines = raw.split('\n').filter((line) => line.length > 0);

          for (const line of lines) {
            const sanitized = sanitizeCliOutput(line);
            stderrBuffer += sanitized + '\n';

            if (options.onOutput) {
              options.onOutput(sanitized, 'stderr');
            }
          }
        });
      }

      // --- Error Handling ---
      child.on('error', (err: Error) => {
        this.logger.error(
          `Railway CLI spawn error for command '${options.command}': ${err.message}`,
        );
        stderrBuffer += `Spawn error: ${err.message}\n`;
      });

      // --- Process Close ---
      child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        clearTimeout(timeoutTimer);
        resolved = true;

        const durationMs = Date.now() - startTime;
        const exitCode = code ?? (signal ? 1 : 0);

        this.logger.log(
          `Railway CLI command '${options.command}' exited with code ${exitCode} ` +
          `(signal: ${signal || 'none'}) in ${durationMs}ms` +
          (timedOut ? ' [TIMED OUT]' : ''),
        );

        resolve({
          exitCode,
          stdout: stdoutBuffer.trim(),
          stderr: stderrBuffer.trim(),
          durationMs,
          timedOut,
        });
      });
    });
  }
}

// ============================================================
// Output Sanitization (exported for testing)
// ============================================================

/**
 * Sanitize CLI output to strip sensitive information.
 *
 * Strips:
 * - RAILWAY_TOKEN=... patterns
 * - Bearer ... tokens
 * - PostgreSQL connection strings
 * - Redis connection strings
 * - variable set KEY=VALUE (masks value)
 */
export function sanitizeCliOutput(line: string): string {
  let sanitized = line;

  // Strip RAILWAY_TOKEN=<value>
  sanitized = sanitized.replace(/RAILWAY_TOKEN=[^\s]+/g, 'RAILWAY_TOKEN=***');

  // Strip Bearer tokens
  sanitized = sanitized.replace(
    /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    'Bearer ***',
  );

  // Mask PostgreSQL connection strings
  sanitized = sanitized.replace(
    /postgres(ql)?:\/\/[^@\s]+@[^\s]+/g,
    'postgresql://***:***@***',
  );

  // Mask Redis connection strings
  sanitized = sanitized.replace(
    /redis:\/\/[^@\s]+@[^\s]+/g,
    'redis://***:***@***',
  );

  // Mask variable set KEY=VALUE (preserve key, mask value)
  sanitized = sanitized.replace(
    /variable\s+set\s+(\w+)=\S+/g,
    'variable set $1=***',
  );

  return sanitized;
}
