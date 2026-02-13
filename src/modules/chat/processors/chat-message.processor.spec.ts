import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bull';
import { ChatMessageProcessor, ProcessChatMessageJobData } from './chat-message.processor';
import { ChatService } from '../chat.service';
import { AgentsService } from '../../agents/agents.service';
import { ClaudeApiService } from '../../agents/services/claude-api.service';
import { AgentQueueService } from '../../agent-queue/services/agent-queue.service';
import { RedisService } from '../../redis/redis.service';
import { AgentJobStatus, AgentJobType } from '../../agent-queue/entities/agent-job.entity';
import { AgentType, AgentStatus } from '../../../database/entities/agent.entity';
import { ChatSenderType, ChatMessageStatus } from '../../../database/entities/chat-message.entity';

describe('ChatMessageProcessor', () => {
  let processor: ChatMessageProcessor;
  let chatService: ChatService;
  let agentsService: AgentsService;
  let claudeApiService: ClaudeApiService;
  let agentQueueService: AgentQueueService;
  let redisService: RedisService;
  let mockRedisPublish: jest.Mock;

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440001';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440002';
  const mockAgentId = '550e8400-e29b-41d4-a716-446655440003';
  const mockMessageId = '550e8400-e29b-41d4-a716-446655440004';
  const mockAgentJobId = '550e8400-e29b-41d4-a716-446655440005';
  const mockResponseMessageId = '550e8400-e29b-41d4-a716-446655440006';

  const mockAgent = {
    id: mockAgentId,
    type: AgentType.DEV,
    status: AgentStatus.RUNNING,
    currentTask: 'Working on authentication',
    lastHeartbeat: new Date(),
    workspaceId: mockWorkspaceId,
  };

  const mockClaudeResponse = {
    content: 'The task is 75% complete. Working on tests now.',
    inputTokens: 100,
    outputTokens: 50,
    model: 'claude-sonnet-4-20250514',
    stopReason: 'end_turn',
  };

  const mockAgentMessage = {
    id: mockResponseMessageId,
    workspaceId: mockWorkspaceId,
    agentId: mockAgentId,
    userId: null,
    senderType: ChatSenderType.AGENT,
    agentType: AgentType.DEV,
    text: 'The task is 75% complete. Working on tests now.',
    status: ChatMessageStatus.SENT,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockJob = (data: Partial<ProcessChatMessageJobData>): Job<ProcessChatMessageJobData> =>
    ({
      data: {
        agentJobId: mockAgentJobId,
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        jobType: AgentJobType.PROCESS_CHAT_MESSAGE,
        data: {
          messageId: mockMessageId,
          agentId: mockAgentId,
          agentType: AgentType.DEV,
          workspaceId: mockWorkspaceId,
          text: "How's the task going?",
          conversationContext: { lastMessages: [] },
          ...data.data,
        },
        ...data,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    }) as unknown as Job<ProcessChatMessageJobData>;

  beforeEach(async () => {
    mockRedisPublish = jest.fn().mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatMessageProcessor,
        {
          provide: ChatService,
          useValue: {
            createMessage: jest.fn(),
            updateMessageStatus: jest.fn(),
          },
        },
        {
          provide: AgentsService,
          useValue: {
            getAgent: jest.fn(),
          },
        },
        {
          provide: ClaudeApiService,
          useValue: {
            sendMessage: jest.fn(),
          },
        },
        {
          provide: AgentQueueService,
          useValue: {
            updateJobStatus: jest.fn(),
            updateJobAttempts: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            publish: mockRedisPublish,
          },
        },
      ],
    }).compile();

    processor = module.get<ChatMessageProcessor>(ChatMessageProcessor);
    chatService = module.get<ChatService>(ChatService);
    agentsService = module.get<AgentsService>(AgentsService);
    claudeApiService = module.get<ClaudeApiService>(ClaudeApiService);
    agentQueueService = module.get<AgentQueueService>(AgentQueueService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processMessage', () => {
    beforeEach(() => {
      jest.spyOn(agentsService, 'getAgent').mockResolvedValue(mockAgent as any);
      jest.spyOn(claudeApiService, 'sendMessage').mockResolvedValue(mockClaudeResponse);
      jest.spyOn(chatService, 'createMessage').mockResolvedValue({
        message: mockAgentMessage as any,
      });
      jest.spyOn(chatService, 'updateMessageStatus').mockResolvedValue(undefined as any);
    });

    it('should emit typing indicator before processing', async () => {
      const job = createMockJob({});

      await processor.processMessage(job);

      expect(mockRedisPublish).toHaveBeenCalledWith(
        'chat-events',
        expect.stringContaining('"isTyping":true'),
      );
    });

    it('should call ClaudeApiService with correct prompt', async () => {
      const job = createMockJob({});

      await processor.processMessage(job);

      expect(claudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          systemPrompt: expect.stringContaining('Dev Agent'),
          userPrompt: expect.stringContaining("How's the task going?"),
        }),
      );
    });

    it('should create agent response message', async () => {
      const job = createMockJob({});

      await processor.processMessage(job);

      expect(chatService.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          agentId: mockAgentId,
          userId: null,
          senderType: ChatSenderType.AGENT,
          agentType: AgentType.DEV,
          text: mockClaudeResponse.content,
        }),
      );
    });

    it('should broadcast message via WebSocket', async () => {
      const job = createMockJob({});

      await processor.processMessage(job);

      expect(mockRedisPublish).toHaveBeenCalledWith(
        'chat-events',
        expect.stringContaining('"event":"chat:message"'),
      );
    });

    it('should clear typing indicator after response', async () => {
      const job = createMockJob({});

      await processor.processMessage(job);

      // Should have both true and false typing events
      const publishCalls = mockRedisPublish.mock.calls;
      const typingEvents = publishCalls.filter((call: any) =>
        call[1].includes('chat:typing'),
      );
      expect(typingEvents.length).toBe(2);
      expect(typingEvents[1][1]).toContain('"isTyping":false');
    });

    it('should update original message status to delivered', async () => {
      const job = createMockJob({});

      await processor.processMessage(job);

      expect(chatService.updateMessageStatus).toHaveBeenCalledWith(
        mockMessageId,
        'delivered',
      );
    });

    it('should update job status to completed', async () => {
      const job = createMockJob({});

      await processor.processMessage(job);

      expect(agentQueueService.updateJobStatus).toHaveBeenCalledWith(
        mockAgentJobId,
        AgentJobStatus.COMPLETED,
        expect.objectContaining({
          result: expect.objectContaining({
            responseMessageId: mockResponseMessageId,
          }),
        }),
      );
    });

    it('should handle Claude API errors gracefully', async () => {
      jest.spyOn(claudeApiService, 'sendMessage').mockRejectedValue(
        new Error('API rate limit exceeded'),
      );

      const job = createMockJob({});

      await expect(processor.processMessage(job)).rejects.toThrow(
        'API rate limit exceeded',
      );

      // Should clear typing indicator on error
      expect(mockRedisPublish).toHaveBeenCalledWith(
        'chat-events',
        expect.stringContaining('"isTyping":false'),
      );
    });

    it('should include conversation context in prompt', async () => {
      const contextMessages = [
        {
          senderType: ChatSenderType.USER,
          agentType: null,
          text: 'Previous message',
        },
      ];

      const job = createMockJob({
        data: {
          messageId: mockMessageId,
          agentId: mockAgentId,
          agentType: AgentType.DEV,
          workspaceId: mockWorkspaceId,
          text: 'Follow up question',
          conversationContext: { lastMessages: contextMessages },
        },
      });

      await processor.processMessage(job);

      expect(claudeApiService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('Conversation History'),
        }),
      );
    });

    it('should retry on transient failures', async () => {
      const job = {
        ...createMockJob({}),
        attemptsMade: 1,
      } as Job<ProcessChatMessageJobData>;

      jest.spyOn(claudeApiService, 'sendMessage').mockRejectedValue(
        new Error('Temporary error'),
      );

      await expect(processor.processMessage(job)).rejects.toThrow();

      expect(agentQueueService.updateJobAttempts).toHaveBeenCalledWith(
        mockAgentJobId,
        2, // attemptsMade + 1
      );
    });
  });

  describe('onFailed', () => {
    it('should update job status to failed after max attempts', async () => {
      const job = {
        data: {
          agentJobId: mockAgentJobId,
          jobType: AgentJobType.PROCESS_CHAT_MESSAGE,
          data: {
            workspaceId: mockWorkspaceId,
            agentId: mockAgentId,
            agentType: AgentType.DEV,
          },
        },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as unknown as Job<ProcessChatMessageJobData>;

      const error = new Error('Final failure');

      await processor.onFailed(job, error);

      expect(agentQueueService.updateJobStatus).toHaveBeenCalledWith(
        mockAgentJobId,
        AgentJobStatus.FAILED,
        expect.objectContaining({
          errorMessage: 'Final failure',
        }),
      );
    });

    it('should update job status to retrying if attempts remain', async () => {
      const job = {
        data: {
          agentJobId: mockAgentJobId,
          jobType: AgentJobType.PROCESS_CHAT_MESSAGE,
          data: {
            workspaceId: mockWorkspaceId,
            agentId: mockAgentId,
            agentType: AgentType.DEV,
          },
        },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as unknown as Job<ProcessChatMessageJobData>;

      const error = new Error('Temporary failure');

      await processor.onFailed(job, error);

      expect(agentQueueService.updateJobStatus).toHaveBeenCalledWith(
        mockAgentJobId,
        AgentJobStatus.RETRYING,
        expect.objectContaining({
          errorMessage: 'Temporary failure',
        }),
      );
    });

    it('should clear typing indicator on failure', async () => {
      const job = {
        data: {
          agentJobId: mockAgentJobId,
          jobType: AgentJobType.PROCESS_CHAT_MESSAGE,
          data: {
            workspaceId: mockWorkspaceId,
            agentId: mockAgentId,
            agentType: AgentType.DEV,
          },
        },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as unknown as Job<ProcessChatMessageJobData>;

      await processor.onFailed(job, new Error('Failure'));

      expect(mockRedisPublish).toHaveBeenCalledWith(
        'chat-events',
        expect.stringContaining('"isTyping":false'),
      );
    });

    it('should ignore non-chat-message jobs', async () => {
      const job = {
        data: {
          agentJobId: mockAgentJobId,
          jobType: AgentJobType.EXECUTE_TASK, // Different job type
          data: {},
        },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as unknown as Job<ProcessChatMessageJobData>;

      await processor.onFailed(job, new Error('Failure'));

      expect(agentQueueService.updateJobStatus).not.toHaveBeenCalled();
    });
  });
});
