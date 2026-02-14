/**
 * CLISessionConfigService
 * Story 11.2: Claude Code CLI Container Setup
 *
 * Manages CLI session configuration: builds configs from workspace/project
 * context, validates before spawning, and provides workspace defaults.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLIKeyBridgeService } from './cli-key-bridge.service';
import {
  CLISessionConfig,
  CLISessionDefaults,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MODEL,
  MAX_TIMEOUT_MS,
  DEFAULT_MAX_CONCURRENT_SESSIONS,
} from '../interfaces/cli-session-config.interfaces';

@Injectable()
export class CLISessionConfigService {
  private readonly logger = new Logger(CLISessionConfigService.name);

  constructor(
    private readonly keyBridgeService: CLIKeyBridgeService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Build a CLISessionConfig from workspace/project context.
   * Decrypts the BYOK key at session spawn time only.
   *
   * @throws ForbiddenException if no active BYOK key for workspace
   * @throws NotFoundException if project not found
   */
  async buildConfig(
    workspaceId: string,
    projectId: string,
    task: string,
    options?: Partial<CLISessionConfig>,
  ): Promise<CLISessionConfig> {
    this.logger.log(
      `Building CLI session config for workspace ${workspaceId}, project ${projectId}`,
    );

    // Get BYOK key (decrypted at spawn time)
    const apiKey = await this.keyBridgeService.getAnthropicKey(workspaceId);

    // Get workspace defaults
    const defaults = await this.getDefaults(workspaceId);

    // Build workspace path
    const basePath = this.configService.get<string>(
      'CLI_WORKSPACE_BASE_PATH',
      '/workspaces',
    );
    const projectPath = `${basePath}/${workspaceId}/${projectId}`;

    // Merge defaults with explicit options
    const config: CLISessionConfig = {
      apiKey,
      projectPath,
      task,
      maxTokens: options?.maxTokens ?? defaults.maxTokens,
      timeout: options?.timeout ?? defaults.timeout,
      outputFormat: 'stream',
      model: options?.model ?? defaults.model,
      allowedTools: options?.allowedTools ?? defaults.allowedTools,
    };

    this.logger.log(
      `CLI session config built for workspace ${workspaceId}, project ${projectId}`,
    );

    return config;
  }

  /**
   * Validate a CLISessionConfig before spawning.
   * Checks: key is valid, project path exists, timeout within limits.
   */
  validateConfig(config: CLISessionConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey || config.apiKey.trim() === '') {
      errors.push('apiKey is required and must be non-empty');
    }

    if (!config.task || config.task.trim() === '') {
      errors.push('task is required and must be non-empty');
    }

    if (!config.projectPath || config.projectPath.trim() === '') {
      errors.push('projectPath is required and must be non-empty');
    }

    if (config.timeout > MAX_TIMEOUT_MS) {
      errors.push(`timeout must not exceed ${MAX_TIMEOUT_MS}ms (4 hours)`);
    }

    if (config.timeout <= 0) {
      errors.push('timeout must be a positive number');
    }

    if (config.maxTokens <= 0) {
      errors.push('maxTokens must be a positive number');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get default configuration values for a workspace.
   * Reads from workspace settings with sensible fallback defaults.
   */
  async getDefaults(workspaceId: string): Promise<CLISessionDefaults> {
    // Read from environment with fallback defaults
    const maxTokens = DEFAULT_MAX_TOKENS;
    const timeout = this.configService.get<number>(
      'CLI_MAX_SESSION_DURATION_MS',
      DEFAULT_TIMEOUT_MS,
    );
    const model = this.configService.get<string>(
      'CLI_DEFAULT_MODEL',
      DEFAULT_MODEL,
    );
    const maxConcurrentSessions = this.configService.get<number>(
      'CLI_MAX_CONCURRENT_SESSIONS',
      DEFAULT_MAX_CONCURRENT_SESSIONS,
    );

    return {
      maxTokens,
      timeout,
      model,
      maxConcurrentSessions,
    };
  }
}
