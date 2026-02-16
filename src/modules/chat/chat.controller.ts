import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProduces,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import {
  SendMessageDto,
  GetMessagesQueryDto,
  UpdateMessageStatusDto,
  SendMessageResponseDto,
  MessagesListResponseDto,
  UpdateStatusResponseDto,
  SearchMessagesQueryDto,
  SearchMessagesResponseDto,
  ExportConversationQueryDto,
  GetConversationsQueryDto,
  CreateConversationDto,
  UpdateConversationDto,
  ConversationResponseDto,
  ConversationsListResponseDto,
} from './dto';
import {
  MarkAsReadDto,
  MarkAllAsReadDto,
  UnreadCountResponseDto,
  MarkAsReadResponseDto,
} from './dto/read-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../shared/guards/workspace-access.guard';
import { ChatRateLimitGuard } from './guards/chat-rate-limit.guard';
import { ChatSenderType, ChatMessageStatus } from '../../database/entities/chat-message.entity';
import { ConversationService } from './services/conversation.service';
import { ChatSearchService } from './services/chat-search.service';
import { ChatExportService } from './services/chat-export.service';
import { MessageReadTrackingService } from './services/message-read-tracking.service';

/**
 * ChatController
 * Story 9.2: Send Message to Agent
 *
 * Handles chat message endpoints for workspace-scoped messaging
 */
@ApiTags('Chat')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/chat')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly conversationService: ConversationService,
    private readonly searchService: ChatSearchService,
    private readonly exportService: ChatExportService,
    private readonly readTrackingService: MessageReadTrackingService,
  ) {}

  /**
   * Send a message to an agent
   */
  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ChatRateLimitGuard)
  @ApiOperation({ summary: 'Send a message to an agent' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({
    status: 201,
    description: 'Message created successfully',
    type: SendMessageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async sendMessage(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
    @Body() dto: SendMessageDto,
  ): Promise<SendMessageResponseDto> {
    const userId = req.user.sub || req.user.id;

    this.logger.log(
      `User ${userId} sending message to agent ${dto.agentId} in workspace ${workspaceId}`,
    );

    // Story 9.4: Store mentions in metadata if provided
    const metadata = dto.mentions && dto.mentions.length > 0
      ? { mentions: dto.mentions }
      : null;

    const { message, jobId } = await this.chatService.createMessage({
      workspaceId,
      userId,
      agentId: dto.agentId,
      projectId: dto.projectId || null,
      senderType: ChatSenderType.USER,
      text: dto.text,
      metadata,
    });

    return {
      message: {
        id: message.id,
        workspaceId: message.workspaceId,
        projectId: message.projectId,
        agentId: message.agentId,
        userId: message.userId,
        senderType: message.senderType,
        agentType: message.agentType,
        text: message.text,
        isStatusUpdate: message.isStatusUpdate,
        status: message.status,
        deliveredAt: message.deliveredAt?.toISOString() || null,
        readAt: message.readAt?.toISOString() || null,
        createdAt: message.createdAt.toISOString(),
      },
      jobId,
    };
  }

  /**
   * Get chat messages with pagination and filtering
   * Story 9.6: Added aroundDate and aroundMessageId for navigation
   */
  @Get('messages')
  @ApiOperation({ summary: 'Get chat messages with pagination' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
    type: MessagesListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  async getMessages(
    @Param('workspaceId') workspaceId: string,
    @Query() query: GetMessagesQueryDto,
  ): Promise<MessagesListResponseDto> {
    // MEDIUM-3 Fix: Validate aroundDate produces a valid Date object
    let aroundDate: Date | undefined;
    if (query.aroundDate) {
      const parsedDate = new Date(query.aroundDate);
      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException(`Invalid date format: ${query.aroundDate}`);
      }
      aroundDate = parsedDate;
    }

    const { messages, hasMore, hasPrevious, cursor, targetMessageId } = await this.chatService.getMessages({
      workspaceId,
      agentId: query.agentId,
      projectId: query.projectId,
      conversationId: query.conversationId,
      limit: query.limit,
      before: query.before,
      after: query.after,
      aroundDate,
      aroundMessageId: query.aroundMessageId,
    });

    return {
      messages: messages.map((m) => ({
        id: m.id,
        workspaceId: m.workspaceId,
        projectId: m.projectId,
        agentId: m.agentId,
        userId: m.userId,
        senderType: m.senderType,
        agentType: m.agentType,
        text: m.text,
        isStatusUpdate: m.isStatusUpdate,
        status: m.status,
        deliveredAt: m.deliveredAt?.toISOString() || null,
        readAt: m.readAt?.toISOString() || null,
        createdAt: m.createdAt.toISOString(),
      })),
      hasMore,
      hasPrevious,
      cursor,
      targetMessageId,
    };
  }

  /**
   * Update message delivery status
   */
  @Patch('messages/:messageId/status')
  @ApiOperation({ summary: 'Update message delivery status' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiParam({ name: 'messageId', description: 'Message UUID' })
  @ApiResponse({
    status: 200,
    description: 'Status updated successfully',
    type: UpdateStatusResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async updateMessageStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageStatusDto,
  ): Promise<UpdateStatusResponseDto> {
    const message = await this.chatService.updateMessageStatus(
      messageId,
      dto.status,
      workspaceId,
    );

    return {
      id: message.id,
      status: message.status,
      deliveredAt: message.deliveredAt?.toISOString() || null,
      readAt: message.readAt?.toISOString() || null,
    };
  }

  // ==========================================================================
  // Story 9.5: Conversation History Storage - New Endpoints
  // ==========================================================================

  /**
   * Search chat messages
   * HIGH-3 FIX: Added rate limiting to prevent DoS attacks via expensive search queries
   */
  @Get('search')
  @UseGuards(ChatRateLimitGuard)
  @ApiOperation({ summary: 'Search chat messages with full-text search' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({
    status: 200,
    description: 'Search results',
    type: SearchMessagesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid search query' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  async searchMessages(
    @Param('workspaceId') workspaceId: string,
    @Query() query: SearchMessagesQueryDto,
  ): Promise<SearchMessagesResponseDto> {
    this.logger.log(
      `Searching messages in workspace ${workspaceId}: "${query.query}"`,
    );

    const result = await this.searchService.searchMessages({
      workspaceId,
      query: query.query,
      agentId: query.agentId,
      conversationId: query.conversationId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      includeArchived: query.includeArchived,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      messages: result.messages.map((m) => ({
        id: m.id,
        workspaceId: m.workspaceId,
        projectId: m.projectId,
        agentId: m.agentId,
        userId: m.userId,
        senderType: m.senderType,
        agentType: m.agentType,
        text: m.text,
        isStatusUpdate: m.isStatusUpdate,
        status: m.status,
        conversationId: m.conversationId,
        createdAt: m.createdAt.toISOString(),
      })),
      totalCount: result.totalCount,
      highlights: result.highlights,
    };
  }

  /**
   * Export conversation
   */
  @Get('export')
  @ApiOperation({ summary: 'Export conversation in various formats' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiProduces('application/json', 'text/csv', 'text/plain', 'text/markdown')
  @ApiResponse({ status: 200, description: 'Exported file' })
  @ApiResponse({ status: 400, description: 'Invalid export parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  async exportConversation(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ExportConversationQueryDto,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user?.sub || req.user?.id;
    this.logger.log(
      `User ${userId} exporting conversation from workspace ${workspaceId} as ${query.format}`,
    );

    const result = await this.exportService.exportConversation({
      workspaceId,
      conversationId: query.conversationId,
      agentId: query.agentId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      format: query.format,
      includeMetadata: query.includeMetadata,
      userId, // HIGH-4 FIX: Pass userId for audit logging
    });

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  }

  /**
   * Get conversation threads
   */
  @Get('conversations')
  @ApiOperation({ summary: 'Get conversation threads with pagination' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({
    status: 200,
    description: 'Conversations retrieved successfully',
    type: ConversationsListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  async getConversations(
    @Param('workspaceId') workspaceId: string,
    @Query() query: GetConversationsQueryDto,
  ): Promise<ConversationsListResponseDto> {
    const result = await this.conversationService.getThreads({
      workspaceId,
      projectId: query.projectId,
      agentId: query.agentId,
      includeArchived: query.includeArchived,
      limit: query.limit,
      before: query.before,
    });

    return {
      conversations: result.threads.map((t) => ({
        id: t.id,
        workspaceId: t.workspaceId,
        projectId: t.projectId,
        agentId: t.agentId,
        title: t.title || null,
        messageCount: t.messageCount,
        lastMessageAt: t.lastMessageAt?.toISOString() || null,
        lastMessagePreview: t.lastMessagePreview,
        isArchived: t.isArchived,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      hasMore: result.hasMore,
      cursor: result.cursor,
    };
  }

  /**
   * Create a new conversation thread
   */
  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new conversation thread' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({
    status: 201,
    description: 'Conversation created successfully',
    type: ConversationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  async createConversation(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.conversationService.createThread({
      workspaceId,
      projectId: dto.projectId,
      agentId: dto.agentId,
      title: dto.title,
    });

    return {
      id: conversation.id,
      workspaceId: conversation.workspaceId,
      projectId: conversation.projectId,
      agentId: conversation.agentId,
      title: conversation.title || null,
      messageCount: conversation.messageCount,
      lastMessageAt: conversation.lastMessageAt?.toISOString() || null,
      lastMessagePreview: conversation.lastMessagePreview,
      isArchived: conversation.isArchived,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  /**
   * Get a specific conversation thread
   */
  @Get('conversations/:conversationId')
  @ApiOperation({ summary: 'Get a conversation thread by ID' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiParam({ name: 'conversationId', description: 'Conversation UUID' })
  @ApiResponse({
    status: 200,
    description: 'Conversation retrieved successfully',
    type: ConversationResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getConversation(
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.conversationService.getThreadById(
      conversationId,
      workspaceId,
    );

    // LOW-2 FIX: Throw NotFoundException for proper HTTP 404 response
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    return {
      id: conversation.id,
      workspaceId: conversation.workspaceId,
      projectId: conversation.projectId,
      agentId: conversation.agentId,
      title: conversation.title || null,
      messageCount: conversation.messageCount,
      lastMessageAt: conversation.lastMessageAt?.toISOString() || null,
      lastMessagePreview: conversation.lastMessagePreview,
      isArchived: conversation.isArchived,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  /**
   * Update a conversation thread
   */
  @Patch('conversations/:conversationId')
  @ApiOperation({ summary: 'Update a conversation thread' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiParam({ name: 'conversationId', description: 'Conversation UUID' })
  @ApiResponse({
    status: 200,
    description: 'Conversation updated successfully',
    type: ConversationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async updateConversation(
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.conversationService.updateThread(
      conversationId,
      workspaceId,
      {
        title: dto.title,
        isArchived: dto.isArchived,
      },
    );

    return {
      id: conversation.id,
      workspaceId: conversation.workspaceId,
      projectId: conversation.projectId,
      agentId: conversation.agentId,
      title: conversation.title || null,
      messageCount: conversation.messageCount,
      lastMessageAt: conversation.lastMessageAt?.toISOString() || null,
      lastMessagePreview: conversation.lastMessagePreview,
      isArchived: conversation.isArchived,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  // ==========================================================================
  // Story 9.9: Chat Notifications - Read Tracking Endpoints
  // ==========================================================================

  /**
   * Get unread message count
   */
  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread message count' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({
    status: 200,
    description: 'Unread count retrieved successfully',
    type: UnreadCountResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  async getUnreadCount(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
    @Query('agentId') agentId?: string,
  ): Promise<UnreadCountResponseDto> {
    const userId = req.user.sub || req.user.id;
    return this.readTrackingService.getUnreadCount(userId, workspaceId, agentId);
  }

  /**
   * Mark specific messages as read
   */
  @Post('messages/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark messages as read' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({
    status: 200,
    description: 'Messages marked as read',
    type: MarkAsReadResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  async markAsRead(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
    @Body() dto: MarkAsReadDto,
  ): Promise<MarkAsReadResponseDto> {
    const userId = req.user.sub || req.user.id;

    // Ensure workspaceId from path matches body
    if (dto.workspaceId !== workspaceId) {
      throw new BadRequestException('Workspace ID mismatch');
    }

    const markedIds = await this.readTrackingService.markAsRead(
      dto.messageIds,
      userId,
      workspaceId,
      dto.source || 'viewed',
    );

    return {
      count: markedIds.length,
      messageIds: markedIds,
    };
  }

  /**
   * Mark all messages as read
   */
  @Post('messages/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all messages as read' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace UUID' })
  @ApiResponse({
    status: 200,
    description: 'All messages marked as read',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no workspace access' })
  async markAllAsRead(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
    @Body() dto: MarkAllAsReadDto,
  ): Promise<{ count: number }> {
    const userId = req.user.sub || req.user.id;

    // Ensure workspaceId from path matches body
    if (dto.workspaceId !== workspaceId) {
      throw new BadRequestException('Workspace ID mismatch');
    }

    const count = await this.readTrackingService.markAllAsRead(
      userId,
      workspaceId,
      dto.agentId,
    );

    return { count };
  }
}
