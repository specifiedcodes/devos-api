/**
 * AgentStreamingService Tests
 * Story 9.8: Agent Response Time Optimization
 *
 * Unit tests for response streaming via WebSocket.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AgentStreamingService } from './agent-streaming.service';
import { ClaudeApiService } from '../../agents/services/claude-api.service';
import { ChatService } from '../chat.service';
import { RedisService } from '../../redis/redis.service';
import {
  STREAMING_EVENTS,
  AgentStreamContext,
} from '../interfaces/streaming.interfaces';
import { AgentType } from '../../../database/entities/agent.entity';

// Mock Socket type with full event handling
interface MockSocket {
  emit: jest.Mock;
  id: string;
  connected: boolean;
  once: jest.Mock;
  off: jest.Mock;
}

describe('AgentStreamingService', () => {
  let service: AgentStreamingService;
  let claudeApiService: jest.Mocked<ClaudeApiService>;
  let chatService: jest.Mocked<ChatService>;
  let redisService: jest.Mocked<RedisService>;
  let mockSocket: MockSocket;

  const mockContext: AgentStreamContext = {
    workspaceId: 'workspace-123',
    agentId: 'agent-456',
    projectId: 'project-789',
    userId: 'user-abc',
    conversationContext: [],
  };

  beforeEach(async () => {
    mockSocket = {
      emit: jest.fn(),
      id: 'socket-123',
      connected: true,
      once: jest.fn(),
      off: jest.fn(),
    };

    const mockClaudeApiService = {
      sendMessage: jest.fn(),
      streamMessage: jest.fn(),
    };

    const mockChatService = {
      createMessage: jest.fn(),
    };

    const mockRedisService = {
      publish: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentStreamingService,
        {
          provide: ClaudeApiService,
          useValue: mockClaudeApiService,
        },
        {
          provide: ChatService,
          useValue: mockChatService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<AgentStreamingService>(AgentStreamingService);
    claudeApiService = module.get(ClaudeApiService);
    chatService = module.get(ChatService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('streamResponse', () => {
    it('should emit start event at beginning of stream', async () => {
      const mockStream = createMockStream(['Hello', ' world', '!']);
      claudeApiService.streamMessage = jest.fn().mockResolvedValue(mockStream);
      chatService.createMessage.mockResolvedValue({
        message: { id: 'msg-123' } as any,
      });

      await service.streamResponse('Test prompt', mockContext, mockSocket as any);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        STREAMING_EVENTS.START,
        expect.objectContaining({
          messageId: expect.any(String),
          agentId: mockContext.agentId,
        }),
      );
    });

    it('should emit chunk events for each chunk', async () => {
      const chunks = ['Hello', ' world', '!'];
      const mockStream = createMockStream(chunks);
      claudeApiService.streamMessage = jest.fn().mockResolvedValue(mockStream);
      chatService.createMessage.mockResolvedValue({
        message: { id: 'msg-123' } as any,
      });

      await service.streamResponse('Test prompt', mockContext, mockSocket as any);

      // Should emit chunk events for each chunk
      const chunkCalls = mockSocket.emit.mock.calls.filter(
        (call) => call[0] === STREAMING_EVENTS.CHUNK,
      );

      expect(chunkCalls.length).toBe(chunks.length);
      expect(chunkCalls[0][1]).toMatchObject({
        chunk: 'Hello',
        index: 0,
        isLast: false,
      });
      // Note: isLast is updated via broadcast after stream completes, not during emission
      expect(chunkCalls[2][1]).toMatchObject({
        chunk: '!',
        index: 2,
      });
    });

    it('should emit end event with full response', async () => {
      const chunks = ['Hello', ' world', '!'];
      const mockStream = createMockStream(chunks);
      claudeApiService.streamMessage = jest.fn().mockResolvedValue(mockStream);
      chatService.createMessage.mockResolvedValue({
        message: { id: 'msg-123' } as any,
      });

      const result = await service.streamResponse('Test prompt', mockContext, mockSocket as any);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        STREAMING_EVENTS.END,
        expect.objectContaining({
          messageId: expect.any(String),
          totalChunks: 3,
          fullResponse: 'Hello world!',
        }),
      );
      expect(result.fullResponse).toBe('Hello world!');
    });

    it('should save complete message after stream', async () => {
      const mockStream = createMockStream(['Test response']);
      claudeApiService.streamMessage = jest.fn().mockResolvedValue(mockStream);
      chatService.createMessage.mockResolvedValue({
        message: { id: 'msg-123' } as any,
      });

      await service.streamResponse('Test prompt', mockContext, mockSocket as any);

      expect(chatService.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockContext.workspaceId,
          agentId: mockContext.agentId,
          text: 'Test response',
        }),
      );
    });

    it('should emit error event on stream error', async () => {
      claudeApiService.streamMessage = jest.fn().mockRejectedValue(
        new Error('API Error'),
      );

      await expect(
        service.streamResponse('Test prompt', mockContext, mockSocket as any),
      ).rejects.toThrow();

      expect(mockSocket.emit).toHaveBeenCalledWith(
        STREAMING_EVENTS.ERROR,
        expect.objectContaining({
          error: expect.stringContaining('API Error'),
        }),
      );
    });

    it('should broadcast via Redis for multi-instance support', async () => {
      const mockStream = createMockStream(['Hello']);
      claudeApiService.streamMessage = jest.fn().mockResolvedValue(mockStream);
      chatService.createMessage.mockResolvedValue({
        message: { id: 'msg-123' } as any,
      });

      await service.streamResponse('Test prompt', mockContext, mockSocket as any);

      expect(redisService.publish).toHaveBeenCalled();
    });
  });

  describe('handleStreamChunk', () => {
    it('should emit chunk with correct index', () => {
      service.handleStreamChunk('test chunk', 'msg-123', 5, mockSocket as any);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        STREAMING_EVENTS.CHUNK,
        expect.objectContaining({
          messageId: 'msg-123',
          chunk: 'test chunk',
          index: 5,
        }),
      );
    });

    it('should handle disconnected socket gracefully', () => {
      const disconnectedSocket: MockSocket = {
        ...mockSocket,
        connected: false,
        emit: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
      };

      // Should not throw
      expect(() => {
        service.handleStreamChunk('test', 'msg-123', 0, disconnectedSocket as any);
      }).not.toThrow();
    });
  });

  describe('finalizeStream', () => {
    it('should save message to database', async () => {
      chatService.createMessage.mockResolvedValue({
        message: { id: 'msg-123' } as any,
      });

      await service.finalizeStream('msg-123', 'Full response', mockContext);

      expect(chatService.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Full response',
          workspaceId: mockContext.workspaceId,
        }),
      );
    });

    it('should broadcast final message via Redis', async () => {
      chatService.createMessage.mockResolvedValue({
        message: { id: 'msg-123' } as any,
      });

      await service.finalizeStream('msg-123', 'Full response', mockContext);

      expect(redisService.publish).toHaveBeenCalledWith(
        'chat-events',
        expect.any(String),
      );
    });
  });

  describe('generateMessageId', () => {
    it('should generate unique message IDs', () => {
      const id1 = service.generateMessageId();
      const id2 = service.generateMessageId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^stream-/);
    });
  });

  describe('calculateStreamMetrics', () => {
    it('should calculate correct metrics', () => {
      const startTime = Date.now() - 1000; // 1 second ago
      const chunks = ['Hello', ' ', 'world'];

      const metrics = service.calculateStreamMetrics(startTime, chunks);

      expect(metrics.totalChunks).toBe(3);
      expect(metrics.totalTime).toBeGreaterThanOrEqual(1000);
      expect(metrics.avgChunkTime).toBeGreaterThan(0);
    });
  });
});

/**
 * Helper to create mock async iterator for streaming
 */
function createMockStream(chunks: string[]) {
  let index = 0;

  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: chunk,
          },
        };
      }
    },
  };
}
