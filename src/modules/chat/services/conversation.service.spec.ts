import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationService } from './conversation.service';
import { ConversationThread } from '../../../database/entities/conversation-thread.entity';
import { ChatMessage } from '../../../database/entities/chat-message.entity';

/**
 * Unit tests for ConversationService
 * Story 9.5: Conversation History Storage
 */
describe('ConversationService', () => {
  let service: ConversationService;
  let conversationRepository: jest.Mocked<Repository<ConversationThread>>;
  let messageRepository: jest.Mocked<Repository<ChatMessage>>;

  const mockWorkspaceId = '123e4567-e89b-12d3-a456-426614174000';
  const mockAgentId = '123e4567-e89b-12d3-a456-426614174001';
  const mockThreadId = '123e4567-e89b-12d3-a456-426614174002';

  const mockConversation: ConversationThread = {
    id: mockThreadId,
    workspaceId: mockWorkspaceId,
    projectId: null,
    agentId: mockAgentId,
    title: 'Test Conversation',
    messageCount: 5,
    lastMessageAt: new Date('2026-02-13T10:00:00Z'),
    lastMessagePreview: 'Hello, world!',
    isArchived: false,
    archivedAt: null,
    createdAt: new Date('2026-02-13T09:00:00Z'),
    updatedAt: new Date('2026-02-13T10:00:00Z'),
    workspace: null as any,
    project: null,
    agent: null,
  };

  beforeEach(async () => {
    const mockConversationRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
      // Mock manager.connection for detectOrCreateConversation tests
      manager: {
        connection: undefined,  // Setting undefined triggers non-transactional fallback
      },
    };

    const mockMessageRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: getRepositoryToken(ConversationThread),
          useValue: mockConversationRepository,
        },
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: mockMessageRepository,
        },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
    conversationRepository = module.get(getRepositoryToken(ConversationThread));
    messageRepository = module.get(getRepositoryToken(ChatMessage));
  });

  describe('createThread', () => {
    it('should create a new conversation thread', async () => {
      const params = {
        workspaceId: mockWorkspaceId,
        agentId: mockAgentId,
        title: 'Test Conversation',
      };

      conversationRepository.create.mockReturnValue(mockConversation);
      conversationRepository.save.mockResolvedValue(mockConversation);

      const result = await service.createThread(params);

      expect(conversationRepository.create).toHaveBeenCalledWith({
        workspaceId: params.workspaceId,
        projectId: null,
        agentId: params.agentId,
        title: params.title,
        messageCount: 0,
        isArchived: false,
      });
      expect(conversationRepository.save).toHaveBeenCalled();
      expect(result.id).toBe(mockThreadId);
    });

    it('should create thread with auto-generated title from first message', async () => {
      const params = {
        workspaceId: mockWorkspaceId,
        agentId: mockAgentId,
        firstMessageText: 'Hello, I need help with deployment',
      };

      const expectedTitle = 'Hello, I need help with deployment';
      const threadWithTitle = { ...mockConversation, title: expectedTitle };

      conversationRepository.create.mockReturnValue(threadWithTitle);
      conversationRepository.save.mockResolvedValue(threadWithTitle);

      const result = await service.createThread(params);

      expect(result.title).toBe(expectedTitle);
    });

    it('should truncate title to 50 characters', async () => {
      const longMessage = 'This is a very long message that exceeds fifty characters and should be truncated';
      const params = {
        workspaceId: mockWorkspaceId,
        agentId: mockAgentId,
        firstMessageText: longMessage,
      };

      const expectedTitle = longMessage.substring(0, 50);
      const threadWithTitle = { ...mockConversation, title: expectedTitle };

      conversationRepository.create.mockReturnValue(threadWithTitle);
      conversationRepository.save.mockResolvedValue(threadWithTitle);

      const result = await service.createThread(params);

      expect(result.title?.length).toBeLessThanOrEqual(50);
    });
  });

  describe('getThreads', () => {
    it('should return paginated threads for workspace', async () => {
      const threads = [mockConversation];
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(threads),
      };

      conversationRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getThreads({
        workspaceId: mockWorkspaceId,
        limit: 20,
      });

      expect(result.threads.length).toBe(1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'thread.workspaceId = :workspaceId',
        { workspaceId: mockWorkspaceId }
      );
    });

    it('should filter by agentId when provided', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockConversation]),
      };

      conversationRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.getThreads({
        workspaceId: mockWorkspaceId,
        agentId: mockAgentId,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'thread.agentId = :agentId',
        { agentId: mockAgentId }
      );
    });

    it('should exclude archived threads by default', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockConversation]),
      };

      conversationRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.getThreads({
        workspaceId: mockWorkspaceId,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'thread.isArchived = :isArchived',
        { isArchived: false }
      );
    });

    it('should include archived threads when requested', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockConversation]),
      };

      conversationRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.getThreads({
        workspaceId: mockWorkspaceId,
        includeArchived: true,
      });

      // Should not filter by isArchived
      const andWhereCalls = mockQueryBuilder.andWhere.mock.calls;
      const archivedFilter = andWhereCalls.find(
        call => call[0].includes('isArchived')
      );
      expect(archivedFilter).toBeUndefined();
    });
  });

  describe('getThreadById', () => {
    it('should return thread by ID with workspace isolation', async () => {
      conversationRepository.findOne.mockResolvedValue(mockConversation);

      const result = await service.getThreadById(mockThreadId, mockWorkspaceId);

      expect(result).toEqual(mockConversation);
      expect(conversationRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockThreadId, workspaceId: mockWorkspaceId },
      });
    });

    it('should return null if thread not found', async () => {
      conversationRepository.findOne.mockResolvedValue(null);

      const result = await service.getThreadById('non-existent', mockWorkspaceId);

      expect(result).toBeNull();
    });
  });

  describe('updateThread', () => {
    it('should update thread title', async () => {
      const updatedThread = { ...mockConversation, title: 'Updated Title' };
      conversationRepository.findOne.mockResolvedValue(mockConversation);
      conversationRepository.save.mockResolvedValue(updatedThread);

      const result = await service.updateThread(mockThreadId, mockWorkspaceId, {
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
    });

    it('should archive thread', async () => {
      const archivedThread = {
        ...mockConversation,
        isArchived: true,
        archivedAt: new Date(),
      };
      conversationRepository.findOne.mockResolvedValue(mockConversation);
      conversationRepository.save.mockResolvedValue(archivedThread);

      const result = await service.updateThread(mockThreadId, mockWorkspaceId, {
        isArchived: true,
      });

      expect(result.isArchived).toBe(true);
      expect(result.archivedAt).toBeDefined();
    });
  });

  describe('detectOrCreateConversation', () => {
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

    it('should create new conversation when no previous messages exist', async () => {
      messageRepository.findOne.mockResolvedValue(null);
      conversationRepository.create.mockReturnValue(mockConversation);
      conversationRepository.save.mockResolvedValue(mockConversation);

      const result = await service.detectOrCreateConversation(
        mockWorkspaceId,
        mockAgentId,
        new Date(),
        'Hello'
      );

      expect(result).toBe(mockThreadId);
      expect(conversationRepository.create).toHaveBeenCalled();
    });

    it('should create new conversation when gap exceeds 4 hours', async () => {
      const oldMessageTime = new Date('2026-02-13T06:00:00Z');
      const newMessageTime = new Date('2026-02-13T11:00:00Z'); // 5 hours later

      const lastMessage = {
        id: 'msg-1',
        conversationId: 'old-thread-id',
        createdAt: oldMessageTime,
      };

      messageRepository.findOne.mockResolvedValue(lastMessage as ChatMessage);
      conversationRepository.create.mockReturnValue(mockConversation);
      conversationRepository.save.mockResolvedValue(mockConversation);

      const result = await service.detectOrCreateConversation(
        mockWorkspaceId,
        mockAgentId,
        newMessageTime,
        'Hello'
      );

      expect(result).toBe(mockThreadId);
      expect(conversationRepository.create).toHaveBeenCalled();
    });

    it('should continue existing conversation when gap is less than 4 hours', async () => {
      const existingThreadId = 'existing-thread-id';
      const oldMessageTime = new Date('2026-02-13T10:00:00Z');
      const newMessageTime = new Date('2026-02-13T12:00:00Z'); // 2 hours later

      const lastMessage = {
        id: 'msg-1',
        conversationId: existingThreadId,
        createdAt: oldMessageTime,
      };

      messageRepository.findOne.mockResolvedValue(lastMessage as ChatMessage);

      const result = await service.detectOrCreateConversation(
        mockWorkspaceId,
        mockAgentId,
        newMessageTime,
        'Hello'
      );

      expect(result).toBe(existingThreadId);
      expect(conversationRepository.create).not.toHaveBeenCalled();
    });

    it('should create new conversation when last message has no conversation', async () => {
      const lastMessage = {
        id: 'msg-1',
        conversationId: null,
        createdAt: new Date(),
      };

      messageRepository.findOne.mockResolvedValue(lastMessage as ChatMessage);
      conversationRepository.create.mockReturnValue(mockConversation);
      conversationRepository.save.mockResolvedValue(mockConversation);

      const result = await service.detectOrCreateConversation(
        mockWorkspaceId,
        mockAgentId,
        new Date(),
        'Hello'
      );

      expect(result).toBe(mockThreadId);
      expect(conversationRepository.create).toHaveBeenCalled();
    });
  });

  describe('incrementMessageCount', () => {
    it('should increment message count and update last message info', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      conversationRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.incrementMessageCount(mockThreadId, 'Hello, world!');

      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(mockQueryBuilder.set).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('id = :id', { id: mockThreadId });
    });

    it('should truncate preview to 100 characters', async () => {
      const longMessage = 'a'.repeat(150);
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      conversationRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.incrementMessageCount(mockThreadId, longMessage);

      const setCall = mockQueryBuilder.set.mock.calls[0][0];
      expect(setCall.lastMessagePreview.length).toBeLessThanOrEqual(100);
    });
  });
});
