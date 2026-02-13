import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ServiceUnavailableException,
  InternalServerErrorException,
  RequestTimeoutException,
} from '@nestjs/common';
import { ClaudeApiService } from './claude-api.service';
import { BYOKKeyService } from '../../byok/services/byok-key.service';
import { ClaudeApiRequest } from '../interfaces/claude-api.interfaces';

// Mock the Anthropic SDK module
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

describe('ClaudeApiService', () => {
  let service: ClaudeApiService;
  let mockBYOKKeyService: any;
  let mockConfigService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';

  const baseRequest: ClaudeApiRequest = {
    workspaceId: mockWorkspaceId,
    systemPrompt: 'You are a helpful assistant.',
    userPrompt: 'Write a hello world program.',
  };

  const mockAnthropicResponse = {
    content: [{ type: 'text', text: '{"result": "hello world"}' }],
    model: 'claude-sonnet-4-20250514',
    usage: {
      input_tokens: 50,
      output_tokens: 20,
    },
    stop_reason: 'end_turn',
  };

  beforeEach(async () => {
    mockBYOKKeyService = {
      getActiveKeyForProvider: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(120000),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeApiService,
        { provide: BYOKKeyService, useValue: mockBYOKKeyService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ClaudeApiService>(ClaudeApiService);

    jest.clearAllMocks();
    mockBYOKKeyService.getActiveKeyForProvider.mockResolvedValue('sk-ant-test-key-12345');
    mockCreate.mockResolvedValue(mockAnthropicResponse);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMessage', () => {
    it('should call BYOKKeyService.getActiveKeyForProvider with correct workspace and provider', async () => {
      await service.sendMessage(baseRequest);

      expect(mockBYOKKeyService.getActiveKeyForProvider).toHaveBeenCalledWith(
        mockWorkspaceId,
        'anthropic',
      );
    });

    it('should call Anthropic messages.create with correct parameters', async () => {
      await service.sendMessage(baseRequest);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 0.3,
        system: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'Write a hello world program.' }],
      });
    });

    it('should return structured response with content, token counts, and stop reason', async () => {
      const result = await service.sendMessage(baseRequest);

      expect(result).toEqual({
        content: '{"result": "hello world"}',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 50,
        outputTokens: 20,
        stopReason: 'end_turn',
      });
    });

    it('should use default model when not specified', async () => {
      await service.sendMessage(baseRequest);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-20250514' }),
      );
    });

    it('should use default maxTokens (4096) when not specified', async () => {
      await service.sendMessage(baseRequest);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 4096 }),
      );
    });

    it('should respect custom maxTokens and temperature', async () => {
      await service.sendMessage({
        ...baseRequest,
        maxTokens: 8192,
        temperature: 0.7,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 8192,
          temperature: 0.7,
        }),
      );
    });

    it('should respect custom model', async () => {
      await service.sendMessage({
        ...baseRequest,
        model: 'claude-3-haiku-20240307',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-3-haiku-20240307' }),
      );
    });

    it('should handle temperature of 0 correctly', async () => {
      await service.sendMessage({
        ...baseRequest,
        temperature: 0,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0 }),
      );
    });
  });

  describe('error handling', () => {
    it('should throw BadRequestException when no BYOK key exists for workspace', async () => {
      mockBYOKKeyService.getActiveKeyForProvider.mockResolvedValue(null);

      await expect(service.sendMessage(baseRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendMessage(baseRequest)).rejects.toThrow(
        'No Anthropic API key configured for this workspace',
      );
    });

    it('should throw BadRequestException for 401 Anthropic error', async () => {
      mockCreate.mockRejectedValue({ status: 401, message: 'Unauthorized' });

      await expect(service.sendMessage(baseRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendMessage(baseRequest)).rejects.toThrow(
        'Anthropic API key is invalid or revoked',
      );
    });

    it('should throw ServiceUnavailableException for 429 rate limit error', async () => {
      mockCreate.mockRejectedValue({
        status: 429,
        message: 'Rate limited',
        headers: { 'retry-after': '30' },
      });

      await expect(service.sendMessage(baseRequest)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw InternalServerErrorException for 500+ server error', async () => {
      mockCreate.mockRejectedValue({ status: 500, message: 'Server error' });

      await expect(service.sendMessage(baseRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.sendMessage(baseRequest)).rejects.toThrow(
        'Claude API is temporarily unavailable',
      );
    });

    it('should throw InternalServerErrorException for 503 server error', async () => {
      mockCreate.mockRejectedValue({ status: 503, message: 'Service unavailable' });

      await expect(service.sendMessage(baseRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should throw RequestTimeoutException for timeout errors', async () => {
      mockCreate.mockRejectedValue({ code: 'ETIMEDOUT', message: 'Connection timed out' });

      await expect(service.sendMessage(baseRequest)).rejects.toThrow(
        RequestTimeoutException,
      );
    });

    it('should throw RequestTimeoutException for timeout in message', async () => {
      mockCreate.mockRejectedValue({ message: 'Request timeout exceeded' });

      await expect(service.sendMessage(baseRequest)).rejects.toThrow(
        RequestTimeoutException,
      );
    });

    it('should throw InternalServerErrorException for unknown errors', async () => {
      mockCreate.mockRejectedValue({ message: 'Something unexpected happened' });

      await expect(service.sendMessage(baseRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should not expose API key in error messages', async () => {
      mockCreate.mockRejectedValue({ status: 401, message: 'Invalid key: sk-ant-secret' });

      try {
        await service.sendMessage(baseRequest);
      } catch (error: any) {
        // The error message should be our sanitized message, not the raw one
        expect(error.message).toBe('Anthropic API key is invalid or revoked');
        expect(error.message).not.toContain('sk-ant-');
      }
    });
  });
});
