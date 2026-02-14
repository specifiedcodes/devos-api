import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { ChatExportService } from './chat-export.service';
import { ChatMessage, ChatSenderType, ChatMessageStatus } from '../../../database/entities/chat-message.entity';
import { AgentType } from '../../../database/entities/agent.entity';
import { AuditService } from '../../../shared/audit/audit.service';

/**
 * Unit tests for ChatExportService
 * Story 9.5: Conversation History Storage
 */
describe('ChatExportService', () => {
  let service: ChatExportService;
  let messageRepository: jest.Mocked<Repository<ChatMessage>>;

  const mockWorkspaceId = '123e4567-e89b-12d3-a456-426614174000';
  const mockAgentId = '123e4567-e89b-12d3-a456-426614174001';
  const mockConversationId = '123e4567-e89b-12d3-a456-426614174002';

  const mockMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      workspaceId: mockWorkspaceId,
      projectId: null,
      roomId: null,
      room: null,
      agentId: mockAgentId,
      userId: 'user-1',
      senderType: ChatSenderType.USER,
      agentType: null,
      text: 'Hello, I need help with deployment',
      isStatusUpdate: false,
      metadata: null,
      status: ChatMessageStatus.SENT,
      deliveredAt: null,
      readAt: null,
      conversationId: mockConversationId,
      conversation: null,
      isArchived: false,
      archivedAt: null,
      createdAt: new Date('2026-02-13T10:00:00Z'),
      updatedAt: new Date('2026-02-13T10:00:00Z'),
      workspace: null as any,
      project: null,
      agent: null,
      user: null,
    },
    {
      id: 'msg-2',
      workspaceId: mockWorkspaceId,
      projectId: null,
      roomId: null,
      room: null,
      agentId: mockAgentId,
      userId: null,
      senderType: ChatSenderType.AGENT,
      agentType: AgentType.DEV,
      text: 'Sure, I can help you with deployment. What specific issue are you facing?',
      isStatusUpdate: false,
      metadata: null,
      status: ChatMessageStatus.SENT,
      deliveredAt: null,
      readAt: null,
      conversationId: mockConversationId,
      conversation: null,
      isArchived: false,
      archivedAt: null,
      createdAt: new Date('2026-02-13T10:01:00Z'),
      updatedAt: new Date('2026-02-13T10:01:00Z'),
      workspace: null as any,
      project: null,
      agent: null,
      user: null,
    },
  ];

  const createMockQueryBuilder = (messages: ChatMessage[] = mockMessages) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(messages),
  });

  beforeEach(async () => {
    const mockMessageRepository = {
      createQueryBuilder: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatExportService,
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: mockMessageRepository,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<ChatExportService>(ChatExportService);
    messageRepository = module.get(getRepositoryToken(ChatMessage));
  });

  describe('exportConversation', () => {
    it('should throw BadRequestException for invalid format', async () => {
      await expect(
        service.exportConversation({
          workspaceId: mockWorkspaceId,
          format: 'xml' as any,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should filter by conversationId when provided', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.exportConversation({
        workspaceId: mockWorkspaceId,
        conversationId: mockConversationId,
        format: 'json',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'msg.conversationId = :conversationId',
        { conversationId: mockConversationId }
      );
    });

    it('should filter by agentId when provided', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.exportConversation({
        workspaceId: mockWorkspaceId,
        agentId: mockAgentId,
        format: 'json',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'msg.agentId = :agentId',
        { agentId: mockAgentId }
      );
    });

    it('should filter by date range when provided', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.exportConversation({
        workspaceId: mockWorkspaceId,
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
        format: 'json',
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
  });

  describe('exportAsJson', () => {
    it('should export messages as valid JSON', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.exportConversation({
        workspaceId: mockWorkspaceId,
        format: 'json',
      });

      expect(result.mimeType).toBe('application/json');
      expect(result.filename).toContain('.json');

      const parsed = JSON.parse(result.data as string);
      expect(parsed.messages).toHaveLength(2);
      expect(parsed.messageCount).toBe(2);
      expect(parsed.exportDate).toBeDefined();
    });

    it('should include message metadata in JSON export', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.exportConversation({
        workspaceId: mockWorkspaceId,
        format: 'json',
        includeMetadata: true,
      });

      const parsed = JSON.parse(result.data as string);
      expect(parsed.messages[0].timestamp).toBeDefined();
      expect(parsed.messages[0].sender).toBe('User');
    });
  });

  describe('exportAsCsv', () => {
    it('should export messages as valid CSV', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.exportConversation({
        workspaceId: mockWorkspaceId,
        format: 'csv',
      });

      expect(result.mimeType).toBe('text/csv');
      expect(result.filename).toContain('.csv');

      const lines = (result.data as string).split('\n');
      expect(lines[0]).toBe('Timestamp,Sender,Message');
      expect(lines.length).toBeGreaterThan(1);
    });

    it('should properly escape quotes in CSV', async () => {
      const messagesWithQuotes = [
        {
          ...mockMessages[0],
          text: 'He said "Hello, world!" and left',
        },
      ];
      const mockQueryBuilder = createMockQueryBuilder(messagesWithQuotes);
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.exportConversation({
        workspaceId: mockWorkspaceId,
        format: 'csv',
      });

      // CSV should escape double quotes by doubling them
      expect(result.data).toContain('""');
    });
  });

  describe('exportAsTxt', () => {
    it('should export messages as plain text', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.exportConversation({
        workspaceId: mockWorkspaceId,
        format: 'txt',
      });

      expect(result.mimeType).toBe('text/plain');
      expect(result.filename).toContain('.txt');

      const text = result.data as string;
      expect(text).toContain('User:');
      expect(text).toContain('dev Agent:');
      expect(text).toContain('Hello, I need help with deployment');
    });
  });

  describe('exportAsMarkdown', () => {
    it('should export messages as Markdown', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.exportConversation({
        workspaceId: mockWorkspaceId,
        format: 'md',
      });

      expect(result.mimeType).toBe('text/markdown');
      expect(result.filename).toContain('.md');

      const md = result.data as string;
      expect(md).toContain('# Chat Export');
      expect(md).toContain('**User**');
      expect(md).toContain('**dev Agent**');
      expect(md).toContain('---');
    });

    it('should include date headers when messages span multiple days', async () => {
      const messagesMultipleDays = [
        { ...mockMessages[0], createdAt: new Date('2026-02-12T10:00:00Z') },
        { ...mockMessages[1], createdAt: new Date('2026-02-13T10:00:00Z') },
      ];
      const mockQueryBuilder = createMockQueryBuilder(messagesMultipleDays);
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.exportConversation({
        workspaceId: mockWorkspaceId,
        format: 'md',
      });

      const md = result.data as string;
      // Should have date headers for both days
      expect(md).toContain('## ');
    });
  });

  describe('message count', () => {
    it('should return correct message count', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.exportConversation({
        workspaceId: mockWorkspaceId,
        format: 'json',
      });

      expect(result.messageCount).toBe(2);
    });
  });

  describe('filename generation', () => {
    it('should generate timestamped filename', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      messageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.exportConversation({
        workspaceId: mockWorkspaceId,
        format: 'json',
      });

      expect(result.filename).toMatch(/chat-export-\d{4}-\d{2}-\d{2}\.json/);
    });
  });
});
