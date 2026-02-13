import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, UpdateResult } from 'typeorm';
import { ChatArchivalService } from './chat-archival.service';
import { ChatMessage, ChatSenderType, ChatMessageStatus } from '../../../database/entities/chat-message.entity';
import { ConversationThread } from '../../../database/entities/conversation-thread.entity';
import { AuditService } from '../../../shared/audit/audit.service';

/**
 * Unit tests for ChatArchivalService
 * Story 9.5: Conversation History Storage
 */
describe('ChatArchivalService', () => {
  let service: ChatArchivalService;
  let messageRepository: jest.Mocked<Repository<ChatMessage>>;
  let conversationRepository: jest.Mocked<Repository<ConversationThread>>;
  let auditService: jest.Mocked<AuditService>;

  const mockWorkspaceId = '123e4567-e89b-12d3-a456-426614174000';

  const createMockMessageQueryBuilder = (affectedCount: number = 0) => ({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: affectedCount } as UpdateResult),
  });

  const createMockConversationQueryBuilder = (affectedCount: number = 0) => ({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: affectedCount } as UpdateResult),
  });

  beforeEach(async () => {
    const mockMessageRepository = {
      createQueryBuilder: jest.fn(),
    };

    const mockConversationRepository = {
      createQueryBuilder: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatArchivalService,
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: mockMessageRepository,
        },
        {
          provide: getRepositoryToken(ConversationThread),
          useValue: mockConversationRepository,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<ChatArchivalService>(ChatArchivalService);
    messageRepository = module.get(getRepositoryToken(ChatMessage));
    conversationRepository = module.get(getRepositoryToken(ConversationThread));
    auditService = module.get(AuditService);
  });

  describe('archiveOldMessages', () => {
    it('should archive messages older than retention days', async () => {
      const mockQueryBuilder = createMockMessageQueryBuilder(100);
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const mockConvQueryBuilder = createMockConversationQueryBuilder(5);
      conversationRepository.createQueryBuilder.mockReturnValue(mockConvQueryBuilder as any);

      const result = await service.archiveOldMessages({
        retentionDays: 90,
      });

      expect(result.messagesArchived).toBe(100);
      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'created_at < :cutoffDate',
        expect.any(Object)
      );
    });

    it('should respect workspace filter when provided', async () => {
      const mockQueryBuilder = createMockMessageQueryBuilder(50);
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const mockConvQueryBuilder = createMockConversationQueryBuilder(2);
      conversationRepository.createQueryBuilder.mockReturnValue(mockConvQueryBuilder as any);

      await service.archiveOldMessages({
        retentionDays: 90,
        workspaceId: mockWorkspaceId,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'workspace_id = :workspaceId',
        { workspaceId: mockWorkspaceId }
      );
    });

    it('should skip already archived messages', async () => {
      const mockQueryBuilder = createMockMessageQueryBuilder(0);
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const mockConvQueryBuilder = createMockConversationQueryBuilder(0);
      conversationRepository.createQueryBuilder.mockReturnValue(mockConvQueryBuilder as any);

      const result = await service.archiveOldMessages({
        retentionDays: 90,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'is_archived = :isArchived',
        { isArchived: false }
      );
      expect(result.messagesArchived).toBe(0);
    });

    it('should log archival action', async () => {
      const mockQueryBuilder = createMockMessageQueryBuilder(100);
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const mockConvQueryBuilder = createMockConversationQueryBuilder(5);
      conversationRepository.createQueryBuilder.mockReturnValue(mockConvQueryBuilder as any);

      await service.archiveOldMessages({
        retentionDays: 90,
      });

      expect(auditService.log).toHaveBeenCalled();
    });

    it('should return execution time in result', async () => {
      const mockQueryBuilder = createMockMessageQueryBuilder(0);
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const mockConvQueryBuilder = createMockConversationQueryBuilder(0);
      conversationRepository.createQueryBuilder.mockReturnValue(mockConvQueryBuilder as any);

      const result = await service.archiveOldMessages({
        retentionDays: 90,
      });

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should archive conversations without recent messages', async () => {
      const mockQueryBuilder = createMockMessageQueryBuilder(100);
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const mockConvQueryBuilder = createMockConversationQueryBuilder(10);
      conversationRepository.createQueryBuilder.mockReturnValue(mockConvQueryBuilder as any);

      const result = await service.archiveOldMessages({
        retentionDays: 90,
      });

      expect(result.conversationsArchived).toBe(10);
      expect(mockConvQueryBuilder.where).toHaveBeenCalledWith(
        'last_message_at < :cutoffDate',
        expect.any(Object)
      );
    });
  });

  describe('configuration', () => {
    it('should use default retention days when not specified', async () => {
      const mockQueryBuilder = createMockMessageQueryBuilder(0);
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const mockConvQueryBuilder = createMockConversationQueryBuilder(0);
      conversationRepository.createQueryBuilder.mockReturnValue(mockConvQueryBuilder as any);

      await service.archiveOldMessages({});

      // Check that cutoff date was set (using default 90 days)
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'created_at < :cutoffDate',
        expect.objectContaining({
          cutoffDate: expect.any(Date),
        })
      );
    });

    it('should allow custom retention days', async () => {
      const mockQueryBuilder = createMockMessageQueryBuilder(0);
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const mockConvQueryBuilder = createMockConversationQueryBuilder(0);
      conversationRepository.createQueryBuilder.mockReturnValue(mockConvQueryBuilder as any);

      await service.archiveOldMessages({
        retentionDays: 30,
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'created_at < :cutoffDate',
        expect.objectContaining({
          cutoffDate: expect.any(Date),
        })
      );
    });
  });

  describe('unarchiveMessages', () => {
    it('should unarchive messages for a conversation', async () => {
      const mockQueryBuilder = createMockMessageQueryBuilder(10);
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const mockConvQueryBuilder = createMockConversationQueryBuilder(1);
      conversationRepository.createQueryBuilder.mockReturnValue(mockConvQueryBuilder as any);

      const result = await service.unarchiveConversation(
        '123e4567-e89b-12d3-a456-426614174002',
        mockWorkspaceId
      );

      expect(result.messagesUnarchived).toBe(10);
    });
  });
});
