/**
 * CLISessionConfigService Tests
 * Story 11.2: Claude Code CLI Container Setup
 *
 * TDD: Tests written first, then implementation.
 * Tests configuration building, validation, and defaults for CLI sessions.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLISessionConfigService } from './cli-session-config.service';
import { CLIKeyBridgeService } from './cli-key-bridge.service';
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MODEL,
  MAX_TIMEOUT_MS,
  DEFAULT_MAX_CONCURRENT_SESSIONS,
} from '../interfaces/cli-session-config.interfaces';

describe('CLISessionConfigService', () => {
  let service: CLISessionConfigService;
  let keyBridgeService: jest.Mocked<CLIKeyBridgeService>;
  let configService: jest.Mocked<ConfigService>;

  const mockWorkspaceId = 'workspace-123';
  const mockProjectId = 'project-456';
  const mockTask = 'Implement user authentication feature';
  const mockApiKey = 'sk-ant-api03-test-key-1234567890abcdef';
  const mockBasePath = '/workspaces';

  beforeEach(async () => {
    const mockKeyBridgeService = {
      getAnthropicKey: jest.fn(),
      verifyKeyValidity: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CLI_WORKSPACE_BASE_PATH: mockBasePath,
          CLI_MAX_SESSION_DURATION_MS: DEFAULT_TIMEOUT_MS,
          CLI_MAX_CONCURRENT_SESSIONS: DEFAULT_MAX_CONCURRENT_SESSIONS,
          CLI_DEFAULT_MODEL: DEFAULT_MODEL,
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CLISessionConfigService,
        { provide: CLIKeyBridgeService, useValue: mockKeyBridgeService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CLISessionConfigService>(CLISessionConfigService);
    keyBridgeService = module.get(CLIKeyBridgeService);
    configService = module.get(ConfigService);
  });

  describe('buildConfig', () => {
    it('should return valid config with decrypted BYOK key', async () => {
      keyBridgeService.getAnthropicKey.mockResolvedValue(mockApiKey);

      const config = await service.buildConfig(
        mockWorkspaceId,
        mockProjectId,
        mockTask,
      );

      expect(config.apiKey).toBe(mockApiKey);
      expect(config.projectPath).toBe(`${mockBasePath}/${mockWorkspaceId}/${mockProjectId}`);
      expect(config.task).toBe(mockTask);
      expect(config.maxTokens).toBe(DEFAULT_MAX_TOKENS);
      expect(config.timeout).toBe(DEFAULT_TIMEOUT_MS);
      expect(config.outputFormat).toBe('stream');
      expect(config.model).toBe(DEFAULT_MODEL);
    });

    it('should throw ForbiddenException when no active BYOK key exists', async () => {
      keyBridgeService.getAnthropicKey.mockRejectedValue(
        new ForbiddenException('No active Anthropic API key configured for this workspace'),
      );

      await expect(
        service.buildConfig(mockWorkspaceId, mockProjectId, mockTask),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should apply workspace default settings correctly', async () => {
      keyBridgeService.getAnthropicKey.mockResolvedValue(mockApiKey);

      const config = await service.buildConfig(
        mockWorkspaceId,
        mockProjectId,
        mockTask,
      );

      expect(config.model).toBe(DEFAULT_MODEL);
      expect(config.maxTokens).toBe(DEFAULT_MAX_TOKENS);
      expect(config.timeout).toBe(DEFAULT_TIMEOUT_MS);
    });

    it('should override defaults with explicit options', async () => {
      keyBridgeService.getAnthropicKey.mockResolvedValue(mockApiKey);

      const config = await service.buildConfig(
        mockWorkspaceId,
        mockProjectId,
        mockTask,
        {
          maxTokens: 100_000,
          timeout: 3_600_000,
          model: 'claude-opus-4-20250514',
          allowedTools: ['Read', 'Write', 'Bash'],
        },
      );

      expect(config.maxTokens).toBe(100_000);
      expect(config.timeout).toBe(3_600_000);
      expect(config.model).toBe('claude-opus-4-20250514');
      expect(config.allowedTools).toEqual(['Read', 'Write', 'Bash']);
    });

    it('should set correct default model and timeout values', async () => {
      keyBridgeService.getAnthropicKey.mockResolvedValue(mockApiKey);

      const config = await service.buildConfig(
        mockWorkspaceId,
        mockProjectId,
        mockTask,
      );

      expect(config.model).toBe('claude-sonnet-4-20250514');
      expect(config.timeout).toBe(7_200_000);
    });
  });

  describe('validateConfig', () => {
    const validConfig = {
      apiKey: mockApiKey,
      projectPath: '/workspaces/ws-1/proj-1',
      task: mockTask,
      maxTokens: DEFAULT_MAX_TOKENS,
      timeout: DEFAULT_TIMEOUT_MS,
      outputFormat: 'stream' as const,
      model: DEFAULT_MODEL,
    };

    it('should return valid for complete config', () => {
      const result = service.validateConfig(validConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing apiKey', () => {
      const result = service.validateConfig({ ...validConfig, apiKey: '' });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('apiKey is required and must be non-empty');
    });

    it('should return errors for empty task', () => {
      const result = service.validateConfig({ ...validConfig, task: '' });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('task is required and must be non-empty');
    });

    it('should return errors for timeout exceeding maximum (4 hours)', () => {
      const result = service.validateConfig({
        ...validConfig,
        timeout: MAX_TIMEOUT_MS + 1,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        `timeout must not exceed ${MAX_TIMEOUT_MS}ms (4 hours)`,
      );
    });

    it('should return errors for invalid project path', () => {
      const result = service.validateConfig({
        ...validConfig,
        projectPath: '',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('projectPath is required and must be non-empty');
    });
  });

  describe('getDefaults', () => {
    it('should return workspace-specific defaults', async () => {
      const defaults = await service.getDefaults(mockWorkspaceId);

      expect(defaults.maxTokens).toBe(DEFAULT_MAX_TOKENS);
      expect(defaults.timeout).toBe(DEFAULT_TIMEOUT_MS);
      expect(defaults.model).toBe(DEFAULT_MODEL);
    });

    it('should return fallback defaults when no workspace settings exist', async () => {
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        return defaultValue;
      });

      const defaults = await service.getDefaults('nonexistent-workspace');

      expect(defaults.maxTokens).toBe(DEFAULT_MAX_TOKENS);
      expect(defaults.timeout).toBe(DEFAULT_TIMEOUT_MS);
      expect(defaults.model).toBe(DEFAULT_MODEL);
    });
  });
});
