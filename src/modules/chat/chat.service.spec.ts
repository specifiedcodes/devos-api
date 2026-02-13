import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ChatService, CreateMessageParams } from './chat.service';
import {
  ChatMessage,
  ChatSenderType,
  ChatMessageStatus,
} from '../../database/entities/chat-message.entity';
import { AgentType, AgentStatus } from '../../database/entities/agent.entity';
import { AgentQueueService } from '../agent-queue/services/agent-queue.service';
import { AgentsService } from '../agents/agents.service';
import { AgentJobType } from '../agent-queue/entities/agent-job.entity';
import { ConversationService } from './services/conversation.service';

describe('ChatService', () => {
  let service: ChatService;
  let messageRepository: Repository<ChatMessage>;
  let agentQueueService: AgentQueueService;
  let agentsService: AgentsService;

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440001';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440002';
  const mockAgentId = '550e8400-e29b-41d4-a716-446655440003';
  const mockProjectId = '550e8400-e29b-41d4-a716-446655440004';
  const mockMessageId = '550e8400-e29b-41d4-a716-446655440005';

  const mockAgent = {
    id: mockAgentId,
    type: AgentType.DEV,
    status: AgentStatus.RUNNING,
    workspaceId: mockWorkspaceId,
    name: 'Dev Agent',
  };

  const mockMessage: Partial<ChatMessage> = {
    id: mockMessageId,
    workspaceId: mockWorkspaceId,
    agentId: mockAgentId,
    userId: mockUserId,
    senderType: ChatSenderType.USER,
    text: 'Test message',
    status: ChatMessageStatus.SENT,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getCount: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: AgentQueueService,
          useValue: {
            addJob: jest.fn(),
          },
        },
        {
          provide: AgentsService,
          useValue: {
            getAgent: jest.fn(),
          },
        },
        {
          provide: ConversationService,
          useValue: {
            detectOrCreateConversation: jest.fn().mockResolvedValue('conv-123'),
            incrementMessageCount: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    messageRepository = module.get<Repository<ChatMessage>>(
      getRepositoryToken(ChatMessage),
    );
    agentQueueService = module.get<AgentQueueService>(AgentQueueService);
    agentsService = module.get<AgentsService>(AgentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createMessage', () => {
    const createParams: CreateMessageParams = {
      workspaceId: mockWorkspaceId,
      agentId: mockAgentId,
      userId: mockUserId,
      senderType: ChatSenderType.USER,
      text: 'How is the task going?',
    };

    it('should create a message and return it with ID', async () => {
      const savedMessage = { ...mockMessage, id: mockMessageId };
      jest.spyOn(messageRepository, 'create').mockReturnValue(savedMessage as ChatMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(savedMessage as ChatMessage);
      jest.spyOn(agentsService, 'getAgent').mockResolvedValue(mockAgent as any);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(agentQueueService, 'addJob').mockResolvedValue({ id: 'job-123' } as any);

      const result = await service.createMessage(createParams);

      expect(result.message).toBeDefined();
      expect(result.message.id).toBe(mockMessageId);
      expect(messageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          agentId: mockAgentId,
          userId: mockUserId,
          senderType: ChatSenderType.USER,
          text: 'How is the task going?',
          status: ChatMessageStatus.SENT,
        }),
      );
      expect(messageRepository.save).toHaveBeenCalled();
    });

    it('should queue a job for agent response when user sends message', async () => {
      const savedMessage = { ...mockMessage };
      jest.spyOn(messageRepository, 'create').mockReturnValue(savedMessage as ChatMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(savedMessage as ChatMessage);
      jest.spyOn(agentsService, 'getAgent').mockResolvedValue(mockAgent as any);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(agentQueueService, 'addJob').mockResolvedValue({ id: 'job-456' } as any);

      const result = await service.createMessage(createParams);

      expect(result.jobId).toBe('job-456');
      expect(agentQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
          jobType: AgentJobType.PROCESS_CHAT_MESSAGE,
          data: expect.objectContaining({
            messageId: mockMessageId,
            agentId: mockAgentId,
            agentType: AgentType.DEV,
            text: 'How is the task going?',
          }),
        }),
      );
    });

    it('should not queue job for agent messages', async () => {
      const agentParams: CreateMessageParams = {
        ...createParams,
        senderType: ChatSenderType.AGENT,
        userId: null,
        agentType: AgentType.DEV,
      };
      const savedMessage = { ...mockMessage, senderType: ChatSenderType.AGENT };
      jest.spyOn(messageRepository, 'create').mockReturnValue(savedMessage as ChatMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(savedMessage as ChatMessage);

      const result = await service.createMessage(agentParams);

      expect(result.jobId).toBeUndefined();
      expect(agentQueueService.addJob).not.toHaveBeenCalled();
    });

    it('should handle optional projectId', async () => {
      const paramsWithProject: CreateMessageParams = {
        ...createParams,
        projectId: mockProjectId,
      };
      const savedMessage = { ...mockMessage, projectId: mockProjectId };
      jest.spyOn(messageRepository, 'create').mockReturnValue(savedMessage as ChatMessage);
      jest.spyOn(messageRepository, 'save').mockResolvedValue(savedMessage as ChatMessage);
      jest.spyOn(agentsService, 'getAgent').mockResolvedValue(mockAgent as any);
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);
      jest.spyOn(agentQueueService, 'addJob').mockResolvedValue({ id: 'job-789' } as any);

      const result = await service.createMessage(paramsWithProject);

      expect(result.message.projectId).toBe(mockProjectId);
      expect(messageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: mockProjectId,
        }),
      );
    });
  });

  describe('getMessages', () => {
    it('should return paginated messages', async () => {
      const messages = [
        { ...mockMessage, id: 'msg-1', createdAt: new Date('2026-02-13T14:30:00Z') },
        { ...mockMessage, id: 'msg-2', createdAt: new Date('2026-02-13T14:31:00Z') },
      ];
      mockQueryBuilder.getMany.mockResolvedValue([...messages]);

      const result = await service.getMessages({
        workspaceId: mockWorkspaceId,
        limit: 50,
      });

      expect(result.messages).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'message.workspaceId = :workspaceId',
        { workspaceId: mockWorkspaceId },
      );
    });

    it('should filter by agentId when provided', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.getMessages({
        workspaceId: mockWorkspaceId,
        agentId: mockAgentId,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'message.agentId = :agentId',
        { agentId: mockAgentId },
      );
    });

    it('should filter by projectId when provided', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.getMessages({
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'message.projectId = :projectId',
        { projectId: mockProjectId },
      );
    });

    it('should handle cursor-based pagination', async () => {
      const cursorMessage = { ...mockMessage, createdAt: new Date('2026-02-13T14:30:00Z') };
      jest.spyOn(messageRepository, 'findOne').mockResolvedValue(cursorMessage as ChatMessage);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.getMessages({
        workspaceId: mockWorkspaceId,
        before: mockMessageId,
      });

      expect(messageRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockMessageId, workspaceId: mockWorkspaceId },
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'message.createdAt < :cursorCreatedAt',
        expect.any(Object),
      );
    });

    it('should indicate hasMore when more messages exist', async () => {
      const messages = Array(51).fill(null).map((_, i) => ({
        ...mockMessage,
        id: `msg-${i}`,
        createdAt: new Date(`2026-02-13T14:${String(i).padStart(2, '0')}:00Z`),
      }));
      mockQueryBuilder.getMany.mockResolvedValue(messages);

      const result = await service.getMessages({
        workspaceId: mockWorkspaceId,
        limit: 50,
      });

      expect(result.hasMore).toBe(true);
      expect(result.messages).toHaveLength(50);
    });

    it('should enforce max limit of 100', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.getMessages({
        workspaceId: mockWorkspaceId,
        limit: 200, // Try to get more than max
      });

      // Should request 101 (100 + 1 for hasMore check)
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(101);
    });
  });

  describe('updateMessageStatus', () => {
    it('should update status to delivered using atomic update', async () => {
      const message = {
        ...mockMessage,
        status: ChatMessageStatus.SENT,
        deliveredAt: null,
      } as ChatMessage;
      const updatedMessage = {
        ...message,
        status: ChatMessageStatus.DELIVERED,
        deliveredAt: new Date(),
      } as ChatMessage;

      // First call returns the original message for validation
      // Second call (after update) returns the updated message
      jest.spyOn(messageRepository, 'findOne')
        .mockResolvedValueOnce(message)
        .mockResolvedValueOnce(updatedMessage);
      mockQueryBuilder.execute.mockResolvedValue({ affected: 1 });

      const result = await service.updateMessageStatus(
        mockMessageId,
        'delivered',
        mockWorkspaceId,
      );

      expect(result.status).toBe(ChatMessageStatus.DELIVERED);
      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(mockQueryBuilder.set).toHaveBeenCalled();
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should update status to read and set both timestamps', async () => {
      const message = {
        ...mockMessage,
        status: ChatMessageStatus.SENT,
        deliveredAt: null,
        readAt: null,
      } as ChatMessage;
      const updatedMessage = {
        ...message,
        status: ChatMessageStatus.READ,
        deliveredAt: new Date(),
        readAt: new Date(),
      } as ChatMessage;

      jest.spyOn(messageRepository, 'findOne')
        .mockResolvedValueOnce(message)
        .mockResolvedValueOnce(updatedMessage);
      mockQueryBuilder.execute.mockResolvedValue({ affected: 1 });

      const result = await service.updateMessageStatus(
        mockMessageId,
        'read',
        mockWorkspaceId,
      );

      expect(result.status).toBe(ChatMessageStatus.READ);
      expect(result.deliveredAt).toBeDefined();
      expect(result.readAt).toBeDefined();
    });

    it('should throw NotFoundException for non-existent message', async () => {
      jest.spyOn(messageRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateMessageStatus('nonexistent', 'delivered', mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject invalid status transition (delivered -> sent)', async () => {
      const message = {
        ...mockMessage,
        status: ChatMessageStatus.DELIVERED,
      } as ChatMessage;
      jest.spyOn(messageRepository, 'findOne').mockResolvedValue(message);

      // The updateMessageStatus only accepts 'delivered' or 'read', so we test same status
      await expect(
        service.updateMessageStatus(mockMessageId, 'delivered', mockWorkspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject updating already read message to delivered', async () => {
      const message = {
        ...mockMessage,
        status: ChatMessageStatus.READ,
      } as ChatMessage;
      jest.spyOn(messageRepository, 'findOne').mockResolvedValue(message);

      await expect(
        service.updateMessageStatus(mockMessageId, 'delivered', mockWorkspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle race condition when update affects 0 rows', async () => {
      const message = {
        ...mockMessage,
        status: ChatMessageStatus.SENT,
      } as ChatMessage;
      jest.spyOn(messageRepository, 'findOne').mockResolvedValue(message);
      // Simulate race condition - another request already updated the status
      mockQueryBuilder.execute.mockResolvedValue({ affected: 0 });

      await expect(
        service.updateMessageStatus(mockMessageId, 'delivered', mockWorkspaceId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getConversationContext', () => {
    it('should return last N messages in chronological order', async () => {
      const messages = [
        { ...mockMessage, id: 'msg-3', createdAt: new Date('2026-02-13T14:32:00Z') },
        { ...mockMessage, id: 'msg-2', createdAt: new Date('2026-02-13T14:31:00Z') },
        { ...mockMessage, id: 'msg-1', createdAt: new Date('2026-02-13T14:30:00Z') },
      ];
      jest.spyOn(messageRepository, 'find').mockResolvedValue(messages as ChatMessage[]);

      const result = await service.getConversationContext(
        mockWorkspaceId,
        mockAgentId,
        3,
      );

      expect(result).toHaveLength(3);
      // Should be in chronological order (oldest first)
      expect(result[0].id).toBe('msg-1');
      expect(result[2].id).toBe('msg-3');
    });

    it('should use default count of 10 messages', async () => {
      jest.spyOn(messageRepository, 'find').mockResolvedValue([]);

      await service.getConversationContext(mockWorkspaceId, mockAgentId);

      expect(messageRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });
  });

  describe('getMessage', () => {
    it('should return message by ID with workspace isolation', async () => {
      jest.spyOn(messageRepository, 'findOne').mockResolvedValue(mockMessage as ChatMessage);

      const result = await service.getMessage(mockMessageId, mockWorkspaceId);

      expect(result).toEqual(mockMessage);
      expect(messageRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockMessageId, workspaceId: mockWorkspaceId },
      });
    });

    it('should throw NotFoundException if message not found', async () => {
      jest.spyOn(messageRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.getMessage('nonexistent', mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
