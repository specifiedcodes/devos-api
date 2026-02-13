import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { ChatSearchService } from './chat-search.service';
import { ChatMessage, ChatSenderType, ChatMessageStatus } from '../../../database/entities/chat-message.entity';

/**
 * Unit tests for ChatSearchService
 * Story 9.5: Conversation History Storage
 */
describe('ChatSearchService', () => {
  let service: ChatSearchService;
  let messageRepository: jest.Mocked<Repository<ChatMessage>>;

  const mockWorkspaceId = '123e4567-e89b-12d3-a456-426614174000';
  const mockAgentId = '123e4567-e89b-12d3-a456-426614174001';
  const mockConversationId = '123e4567-e89b-12d3-a456-426614174002';

  const createMockQueryBuilder = (rawResults: any[] = []) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawResults),
  });

  const createMockCountQueryBuilder = (count: number = 0) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(count),
  });

  beforeEach(async () => {
    const mockMessageRepository = {
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatSearchService,
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: mockMessageRepository,
        },
      ],
    }).compile();

    service = module.get<ChatSearchService>(ChatSearchService);
    messageRepository = module.get(getRepositoryToken(ChatMessage));
  });

  describe('searchMessages', () => {
    it('should search messages by keyword', async () => {
      const mockQueryBuilder = createMockQueryBuilder([
        {
          msg_id: 'msg-1',
          msg_workspaceId: mockWorkspaceId,
          msg_text: 'Hello, I need help with deployment',
          headline: '<b>deployment</b>',
        },
      ]);
      const countQueryBuilder = createMockCountQueryBuilder(1);

      messageRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder as any)
        .mockReturnValueOnce(countQueryBuilder as any);

      const result = await service.searchMessages({
        workspaceId: mockWorkspaceId,
        query: 'deployment',
      });

      expect(result.messages.length).toBe(1);
      expect(result.totalCount).toBe(1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'msg.workspaceId = :workspaceId',
        { workspaceId: mockWorkspaceId }
      );
    });

    it('should throw BadRequestException for empty query', async () => {
      await expect(
        service.searchMessages({
          workspaceId: mockWorkspaceId,
          query: '',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for whitespace-only query', async () => {
      await expect(
        service.searchMessages({
          workspaceId: mockWorkspaceId,
          query: '   ',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should filter by agentId when provided', async () => {
      const mockQueryBuilder = createMockQueryBuilder([]);
      const countQueryBuilder = createMockCountQueryBuilder(0);

      messageRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder as any)
        .mockReturnValueOnce(countQueryBuilder as any);

      await service.searchMessages({
        workspaceId: mockWorkspaceId,
        query: 'test',
        agentId: mockAgentId,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'msg.agentId = :agentId',
        { agentId: mockAgentId }
      );
    });

    it('should filter by date range when provided', async () => {
      const mockQueryBuilder = createMockQueryBuilder([]);
      const countQueryBuilder = createMockCountQueryBuilder(0);

      messageRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder as any)
        .mockReturnValueOnce(countQueryBuilder as any);

      const dateFrom = '2026-01-01';
      const dateTo = '2026-02-01';

      await service.searchMessages({
        workspaceId: mockWorkspaceId,
        query: 'test',
        dateFrom,
        dateTo,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'msg.createdAt >= :dateFrom',
        expect.any(Object)
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'msg.createdAt <= :dateTo',
        expect.any(Object)
      );
    });

    it('should filter by conversationId when provided', async () => {
      const mockQueryBuilder = createMockQueryBuilder([]);
      const countQueryBuilder = createMockCountQueryBuilder(0);

      messageRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder as any)
        .mockReturnValueOnce(countQueryBuilder as any);

      await service.searchMessages({
        workspaceId: mockWorkspaceId,
        query: 'test',
        conversationId: mockConversationId,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'msg.conversationId = :conversationId',
        { conversationId: mockConversationId }
      );
    });

    it('should exclude archived messages by default', async () => {
      const mockQueryBuilder = createMockQueryBuilder([]);
      const countQueryBuilder = createMockCountQueryBuilder(0);

      messageRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder as any)
        .mockReturnValueOnce(countQueryBuilder as any);

      await service.searchMessages({
        workspaceId: mockWorkspaceId,
        query: 'test',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'msg.isArchived = :isArchived',
        { isArchived: false }
      );
    });

    it('should include archived messages when requested', async () => {
      const mockQueryBuilder = createMockQueryBuilder([]);
      const countQueryBuilder = createMockCountQueryBuilder(0);

      messageRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder as any)
        .mockReturnValueOnce(countQueryBuilder as any);

      await service.searchMessages({
        workspaceId: mockWorkspaceId,
        query: 'test',
        includeArchived: true,
      });

      // Should NOT have the archived filter when includeArchived=true
      const andWhereCalls = mockQueryBuilder.andWhere.mock.calls;
      const archivedFilter = andWhereCalls.find(
        call => call[0] === 'msg.isArchived = :isArchived'
      );
      expect(archivedFilter).toBeUndefined();
    });

    it('should paginate results with limit and offset', async () => {
      const mockQueryBuilder = createMockQueryBuilder([]);
      const countQueryBuilder = createMockCountQueryBuilder(50);

      messageRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder as any)
        .mockReturnValueOnce(countQueryBuilder as any);

      await service.searchMessages({
        workspaceId: mockWorkspaceId,
        query: 'test',
        limit: 10,
        offset: 20,
      });

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
    });

    it('should enforce maximum limit of 100', async () => {
      const mockQueryBuilder = createMockQueryBuilder([]);
      const countQueryBuilder = createMockCountQueryBuilder(0);

      messageRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder as any)
        .mockReturnValueOnce(countQueryBuilder as any);

      await service.searchMessages({
        workspaceId: mockWorkspaceId,
        query: 'test',
        limit: 500,
      });

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(100);
    });

    it('should return highlights for matching text', async () => {
      const mockQueryBuilder = createMockQueryBuilder([
        {
          msg_id: 'msg-1',
          msg_workspaceId: mockWorkspaceId,
          msg_projectId: null,
          msg_agentId: mockAgentId,
          msg_userId: 'user-1',
          msg_senderType: 'user',
          msg_agentType: null,
          msg_text: 'Hello, I need help with deployment',
          msg_isStatusUpdate: false,
          msg_metadata: null,
          msg_status: 'sent',
          msg_deliveredAt: null,
          msg_readAt: null,
          msg_conversationId: mockConversationId,
          msg_isArchived: false,
          msg_archivedAt: null,
          msg_createdAt: new Date('2026-02-13T10:00:00Z'),
          msg_updatedAt: new Date('2026-02-13T10:00:00Z'),
          headline: '<b>deployment</b> issues',
        },
      ]);
      const countQueryBuilder = createMockCountQueryBuilder(1);

      messageRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder as any)
        .mockReturnValueOnce(countQueryBuilder as any);

      const result = await service.searchMessages({
        workspaceId: mockWorkspaceId,
        query: 'deployment',
      });

      expect(result.highlights).toBeDefined();
      expect(result.highlights?.['msg-1'][0]).toContain('<b>deployment</b>');
    });
  });

  describe('sanitizeSearchQuery', () => {
    it('should sanitize special characters', () => {
      // Access the private method via type assertion for testing
      const sanitized = (service as any).sanitizeSearchQuery("test'query");
      expect(sanitized).not.toContain("'");
    });

    it('should handle multiple words', () => {
      const sanitized = (service as any).sanitizeSearchQuery('hello world');
      expect(sanitized).toBe('hello world');
    });
  });
});
