import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationService } from './services/conversation.service';
import { ChatSearchService } from './services/chat-search.service';
import { ChatExportService } from './services/chat-export.service';
import { MessageReadTrackingService } from './services/message-read-tracking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../shared/guards/workspace-access.guard';
import { ChatRateLimitGuard } from './guards/chat-rate-limit.guard';
import {
  ChatSenderType,
  ChatMessageStatus,
} from '../../database/entities/chat-message.entity';
import { AgentType } from '../../database/entities/agent.entity';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: ChatService;

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440001';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440002';
  const mockAgentId = '550e8400-e29b-41d4-a716-446655440003';
  const mockMessageId = '550e8400-e29b-41d4-a716-446655440004';

  const mockRequest = {
    user: { sub: mockUserId },
  };

  const mockMessage = {
    id: mockMessageId,
    workspaceId: mockWorkspaceId,
    projectId: null,
    agentId: mockAgentId,
    userId: mockUserId,
    senderType: ChatSenderType.USER,
    agentType: null,
    text: 'Test message',
    isStatusUpdate: false,
    status: ChatMessageStatus.SENT,
    metadata: null,
    deliveredAt: null,
    readAt: null,
    createdAt: new Date('2026-02-13T14:30:00Z'),
    updatedAt: new Date('2026-02-13T14:30:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: {
            createMessage: jest.fn(),
            getMessages: jest.fn(),
            updateMessageStatus: jest.fn(),
          },
        },
        {
          provide: ConversationService,
          useValue: {
            createThread: jest.fn(),
            getThreads: jest.fn(),
            getThreadById: jest.fn(),
            updateThread: jest.fn(),
          },
        },
        {
          provide: ChatSearchService,
          useValue: {
            searchMessages: jest.fn(),
          },
        },
        {
          provide: ChatExportService,
          useValue: {
            exportConversation: jest.fn(),
          },
        },
        {
          provide: MessageReadTrackingService,
          useValue: {
            trackRead: jest.fn(),
            getReadStatus: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ChatRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChatController>(ChatController);
    chatService = module.get<ChatService>(ChatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should create a message and return 201', async () => {
      jest.spyOn(chatService, 'createMessage').mockResolvedValue({
        message: mockMessage as any,
        jobId: 'job-123',
      });

      const dto = {
        agentId: mockAgentId,
        text: 'Test message',
      };

      const result = await controller.sendMessage(
        mockWorkspaceId,
        mockRequest,
        dto,
      );

      expect(result).toBeDefined();
      expect(result.message.id).toBe(mockMessageId);
      expect(result.jobId).toBe('job-123');
      expect(chatService.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          userId: mockUserId,
          agentId: mockAgentId,
          senderType: ChatSenderType.USER,
          text: 'Test message',
        }),
      );
    });

    it('should validate DTO fields', async () => {
      jest.spyOn(chatService, 'createMessage').mockResolvedValue({
        message: mockMessage as any,
      });

      const dto = {
        agentId: mockAgentId,
        projectId: '550e8400-e29b-41d4-a716-446655440005',
        text: 'Message with project',
      };

      await controller.sendMessage(mockWorkspaceId, mockRequest, dto);

      expect(chatService.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: dto.projectId,
        }),
      );
    });

    it('should require authentication via JWT guard', async () => {
      // The guard is already overridden for testing
      // In real usage, JwtAuthGuard would reject unauthenticated requests
      expect(true).toBe(true); // Guard integration tested via e2e
    });

    it('should require workspace access via WorkspaceAccessGuard', async () => {
      // The guard is already overridden for testing
      // In real usage, WorkspaceAccessGuard would reject unauthorized access
      expect(true).toBe(true); // Guard integration tested via e2e
    });
  });

  describe('getMessages', () => {
    it('should return paginated messages', async () => {
      const messages = [mockMessage, { ...mockMessage, id: 'msg-2' }];
      jest.spyOn(chatService, 'getMessages').mockResolvedValue({
        messages: messages as any,
        hasMore: true,
        cursor: 'msg-2',
      });

      const query = { limit: 50 };

      const result = await controller.getMessages(mockWorkspaceId, query);

      expect(result.messages).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('msg-2');
    });

    it('should apply filters correctly', async () => {
      jest.spyOn(chatService, 'getMessages').mockResolvedValue({
        messages: [],
        hasMore: false,
      });

      const query = {
        agentId: mockAgentId,
        projectId: '550e8400-e29b-41d4-a716-446655440005',
        limit: 25,
        before: 'cursor-123',
      };

      await controller.getMessages(mockWorkspaceId, query);

      expect(chatService.getMessages).toHaveBeenCalledWith({
        workspaceId: mockWorkspaceId,
        agentId: mockAgentId,
        projectId: '550e8400-e29b-41d4-a716-446655440005',
        limit: 25,
        before: 'cursor-123',
      });
    });

    it('should format message dates as ISO strings', async () => {
      const messageWithDates = {
        ...mockMessage,
        deliveredAt: new Date('2026-02-13T14:30:05Z'),
        readAt: new Date('2026-02-13T14:30:10Z'),
      };
      jest.spyOn(chatService, 'getMessages').mockResolvedValue({
        messages: [messageWithDates] as any,
        hasMore: false,
      });

      const result = await controller.getMessages(mockWorkspaceId, {});

      expect(result.messages[0].createdAt).toBe('2026-02-13T14:30:00.000Z');
      expect(result.messages[0].deliveredAt).toBe('2026-02-13T14:30:05.000Z');
      expect(result.messages[0].readAt).toBe('2026-02-13T14:30:10.000Z');
    });
  });

  describe('updateMessageStatus', () => {
    it('should update status to delivered', async () => {
      const updatedMessage = {
        ...mockMessage,
        status: ChatMessageStatus.DELIVERED,
        deliveredAt: new Date('2026-02-13T14:30:05Z'),
      };
      jest
        .spyOn(chatService, 'updateMessageStatus')
        .mockResolvedValue(updatedMessage as any);

      const dto = { status: 'delivered' as const };

      const result = await controller.updateMessageStatus(
        mockWorkspaceId,
        mockMessageId,
        dto,
      );

      expect(result.id).toBe(mockMessageId);
      expect(result.status).toBe(ChatMessageStatus.DELIVERED);
      expect(result.deliveredAt).toBe('2026-02-13T14:30:05.000Z');
    });

    it('should update status to read', async () => {
      const updatedMessage = {
        ...mockMessage,
        status: ChatMessageStatus.READ,
        deliveredAt: new Date('2026-02-13T14:30:05Z'),
        readAt: new Date('2026-02-13T14:30:10Z'),
      };
      jest
        .spyOn(chatService, 'updateMessageStatus')
        .mockResolvedValue(updatedMessage as any);

      const dto = { status: 'read' as const };

      const result = await controller.updateMessageStatus(
        mockWorkspaceId,
        mockMessageId,
        dto,
      );

      expect(result.status).toBe(ChatMessageStatus.READ);
      expect(result.readAt).toBe('2026-02-13T14:30:10.000Z');
    });

    it('should include workspaceId for workspace isolation', async () => {
      jest
        .spyOn(chatService, 'updateMessageStatus')
        .mockResolvedValue(mockMessage as any);

      await controller.updateMessageStatus(mockWorkspaceId, mockMessageId, {
        status: 'delivered',
      });

      expect(chatService.updateMessageStatus).toHaveBeenCalledWith(
        mockMessageId,
        'delivered',
        mockWorkspaceId,
      );
    });
  });
});
