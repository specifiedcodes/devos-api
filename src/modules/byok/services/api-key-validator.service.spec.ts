import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ApiKeyValidatorService } from './api-key-validator.service';
import { KeyProvider } from '../../../database/entities/byok-key.entity';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(),
      },
    })),
  };
});

// Mock OpenAI SDK
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    })),
  };
});

describe('ApiKeyValidatorService', () => {
  let service: ApiKeyValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyValidatorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(5000), // API_VALIDATION_TIMEOUT
          },
        },
      ],
    }).compile();

    service = module.get<ApiKeyValidatorService>(ApiKeyValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateAnthropicKey', () => {
    it('should return true for valid Anthropic API key', async () => {
      const Anthropic = require('@anthropic-ai/sdk').default;
      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ text: 'test' }],
      });
      Anthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const result = await service.validateApiKey(
        KeyProvider.ANTHROPIC,
        'sk-ant-valid-key-12345678901234567890123456789012345678901234567890',
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
    });

    it('should return false for invalid Anthropic API key', async () => {
      const Anthropic = require('@anthropic-ai/sdk').default;
      const mockCreate = jest.fn().mockRejectedValue({
        status: 401,
        message: 'Invalid API key',
      });
      Anthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const result = await service.validateApiKey(
        KeyProvider.ANTHROPIC,
        'sk-ant-invalid-key-12345678901234567890123456789012345678901234567890',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid Anthropic API key');
    });

    it('should handle network timeout errors', async () => {
      const Anthropic = require('@anthropic-ai/sdk').default;
      const mockCreate = jest
        .fn()
        .mockRejectedValue(new Error('Request timeout'));
      Anthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const result = await service.validateApiKey(
        KeyProvider.ANTHROPIC,
        'sk-ant-timeout-key-12345678901234567890123456789012345678901234567890',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateOpenAIKey', () => {
    it('should return true for valid OpenAI API key', async () => {
      const OpenAI = require('openai').default;
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'test' } }],
      });
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await service.validateApiKey(
        KeyProvider.OPENAI,
        'sk-proj-valid-key-12345678901234567890123456789012345678901234567890',
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
    });

    it('should return false for invalid OpenAI API key', async () => {
      const OpenAI = require('openai').default;
      const mockCreate = jest.fn().mockRejectedValue({
        status: 401,
        message: 'Invalid API key',
      });
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await service.validateApiKey(
        KeyProvider.OPENAI,
        'sk-proj-invalid-key-12345678901234567890123456789012345678901234567890',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid OpenAI API key');
    });
  });

  describe('validateApiKey', () => {
    it('should return false for unsupported provider', async () => {
      const result = await service.validateApiKey(
        'unsupported' as KeyProvider,
        'test-key',
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unsupported provider');
    });
  });
});
