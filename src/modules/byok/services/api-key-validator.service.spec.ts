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

// Mock Google Generative AI SDK
const mockGoogleGenerateContent = jest.fn();
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGoogleGenerateContent,
      }),
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

  describe('validateGoogleAIKey', () => {
    beforeEach(() => {
      mockGoogleGenerateContent.mockReset();
    });

    it('should return true for valid Google AI API key', async () => {
      mockGoogleGenerateContent.mockResolvedValue({
        response: {
          text: () => 'ok',
          candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
        },
      });

      const result = await service.validateApiKey(
        KeyProvider.GOOGLE,
        'AIzaSyTest1234567890123456789012345',
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should call generateContent with minimal prompt and gemini-2.0-flash model', async () => {
      mockGoogleGenerateContent.mockResolvedValue({
        response: {
          text: () => 'ok',
        },
      });

      await service.validateApiKey(
        KeyProvider.GOOGLE,
        'AIzaSyTest1234567890123456789012345',
      );

      expect(mockGoogleGenerateContent).toHaveBeenCalledWith({
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
        generationConfig: { maxOutputTokens: 1 },
      });
    });

    it('should return "Invalid Google AI API key" for 403 error', async () => {
      mockGoogleGenerateContent.mockRejectedValue({
        status: 403,
        message: 'API key not valid',
      });

      const result = await service.validateApiKey(
        KeyProvider.GOOGLE,
        'AIzaSyInvalid1234567890123456789',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid Google AI API key');
    });

    it('should return quota/rate limit message for 429 error', async () => {
      mockGoogleGenerateContent.mockRejectedValue({
        status: 429,
        message: 'Resource has been exhausted',
      });

      const result = await service.validateApiKey(
        KeyProvider.GOOGLE,
        'AIzaSyRateLimited12345678901234567',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('API key has no remaining quota or rate limit exceeded');
    });

    it('should return connectivity message for network error (ECONNREFUSED)', async () => {
      const error = new Error('connect ECONNREFUSED');
      (error as any).code = 'ECONNREFUSED';
      mockGoogleGenerateContent.mockRejectedValue(error);

      const result = await service.validateApiKey(
        KeyProvider.GOOGLE,
        'AIzaSyNetwork1234567890123456789012',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unable to reach Google AI servers. Check your network connection.');
    });

    it('should return connectivity message for ETIMEDOUT error', async () => {
      const error = new Error('connect ETIMEDOUT');
      (error as any).code = 'ETIMEDOUT';
      mockGoogleGenerateContent.mockRejectedValue(error);

      const result = await service.validateApiKey(
        KeyProvider.GOOGLE,
        'AIzaSyTimeout12345678901234567890123',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unable to reach Google AI servers. Check your network connection.');
    });

    it('should return timeout message when validation times out', async () => {
      // The TIMEOUT error is thrown by our Promise.race timeout
      mockGoogleGenerateContent.mockImplementation(() => new Promise(() => {
        // Never resolves - will be caught by timeout
      }));

      // Mock a shorter timeout for this test
      const error = new Error('TIMEOUT');
      mockGoogleGenerateContent.mockRejectedValue(error);

      const result = await service.validateApiKey(
        KeyProvider.GOOGLE,
        'AIzaSySlowKey12345678901234567890123',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Validation timed out. Please try again.');
    });

    it('should sanitize key in error logs', async () => {
      // The key itself should not appear in error messages
      const specificKey = 'AIzaSySecretKey12345678901234567890';
      mockGoogleGenerateContent.mockRejectedValue({
        status: 403,
        message: 'Forbidden',
      });

      const result = await service.validateApiKey(
        KeyProvider.GOOGLE,
        specificKey,
      );

      expect(result.isValid).toBe(false);
      // Error message should not contain the actual key
      expect(result.error).not.toContain(specificKey);
    });
  });

  describe('validateDeepSeekKey', () => {
    it('should return true for valid DeepSeek API key', async () => {
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
        KeyProvider.DEEPSEEK,
        'sk-deepseek-valid-key-12345678901234567890123456789012345678901234567890',
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should use deepseek-chat model with max_tokens: 1', async () => {
      const OpenAI = require('openai').default;
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      await service.validateApiKey(
        KeyProvider.DEEPSEEK,
        'sk-deepseek-valid-key-12345678901234567890123456789012345678901234567890',
      );

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'deepseek-chat',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      });
    });

    it('should create OpenAI client with baseURL https://api.deepseek.com', async () => {
      const OpenAI = require('openai').default;
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });
      OpenAI.mockImplementation((config: any) => {
        // Store config for assertion
        OpenAI.__lastConfig = config;
        return {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        };
      });

      await service.validateApiKey(
        KeyProvider.DEEPSEEK,
        'sk-deepseek-valid-key-12345678901234567890123456789012345678901234567890',
      );

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.deepseek.com',
        }),
      );
    });

    it('should return "Invalid DeepSeek API key" for 401 error', async () => {
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
        KeyProvider.DEEPSEEK,
        'sk-deepseek-invalid-key-12345678901234567890123456789012345678901234567890',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid DeepSeek API key');
    });

    it('should return quota/rate limit message for 429 error', async () => {
      const OpenAI = require('openai').default;
      const mockCreate = jest.fn().mockRejectedValue({
        status: 429,
        message: 'Rate limit exceeded',
      });
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await service.validateApiKey(
        KeyProvider.DEEPSEEK,
        'sk-deepseek-ratelimit-key-12345678901234567890123456789012345678901234',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('API key has no remaining quota or rate limit exceeded');
    });

    it('should return connectivity message for network error (ECONNREFUSED)', async () => {
      const OpenAI = require('openai').default;
      const error = new Error('connect ECONNREFUSED');
      (error as any).code = 'ECONNREFUSED';
      const mockCreate = jest.fn().mockRejectedValue(error);
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await service.validateApiKey(
        KeyProvider.DEEPSEEK,
        'sk-deepseek-network-key-12345678901234567890123456789012345678901234567',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unable to reach DeepSeek servers. Check your network connection.');
    });

    it('should return timeout message for ETIMEDOUT error', async () => {
      const OpenAI = require('openai').default;
      const error = new Error('connect ETIMEDOUT');
      (error as any).code = 'ETIMEDOUT';
      const mockCreate = jest.fn().mockRejectedValue(error);
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await service.validateApiKey(
        KeyProvider.DEEPSEEK,
        'sk-deepseek-timeout-key-12345678901234567890123456789012345678901234567',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Validation timed out. Please try again.');
    });

    it('should sanitize key in error logs', async () => {
      const OpenAI = require('openai').default;
      const specificKey = 'sk-deepseek-secret-key-123456789012345678901234567890123456789';
      const mockCreate = jest.fn().mockRejectedValue({
        status: 401,
        message: 'Unauthorized',
      });
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await service.validateApiKey(
        KeyProvider.DEEPSEEK,
        specificKey,
      );

      expect(result.isValid).toBe(false);
      // Error message should not contain the actual key
      expect(result.error).not.toContain(specificKey);
    });
  });

  describe('validateApiKey', () => {
    it('should handle KeyProvider.GOOGLE and route to validateGoogleAIKey', async () => {
      mockGoogleGenerateContent.mockResolvedValue({
        response: { text: () => 'ok' },
      });

      const result = await service.validateApiKey(
        KeyProvider.GOOGLE,
        'AIzaSyTest1234567890123456789012345',
      );

      expect(result.isValid).toBe(true);
      expect(mockGoogleGenerateContent).toHaveBeenCalled();
    });

    it('should handle KeyProvider.DEEPSEEK and route to validateDeepSeekKey', async () => {
      const OpenAI = require('openai').default;
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await service.validateApiKey(
        KeyProvider.DEEPSEEK,
        'sk-deepseek-route-key-12345678901234567890123456789012345678901234567890',
      );

      expect(result.isValid).toBe(true);
      expect(mockCreate).toHaveBeenCalled();
    });

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
