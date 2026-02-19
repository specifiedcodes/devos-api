import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import {
  ChatMessage,
  ChatSenderType,
  ChatMessageStatus,
} from '../../database/entities/chat-message.entity';
import { AgentType } from '../../database/entities/agent.entity';
import { AgentQueueService, AgentJobData } from '../agent-queue/services/agent-queue.service';
import { AgentJobType } from '../agent-queue/entities/agent-job.entity';
import { AgentsService } from '../agents/agents.service';
import { ConversationService } from './services/conversation.service';

export interface CreateMessageParams {
  workspaceId: string;
  projectId?: string | null;
  agentId?: string | null;
  userId?: string | null;
  senderType: ChatSenderType;
  agentType?: AgentType | null;
  text: string;
  isStatusUpdate?: boolean;
  metadata?: Record<string, any> | null;
}

export interface GetMessagesParams {
  workspaceId: string;
  agentId?: string;
  projectId?: string;
  conversationId?: string;
  limit?: number;
  before?: string;
  after?: string;
  includeThreadInfo?: boolean;
  /** Story 9.6: Get messages around a specific date */
  aroundDate?: Date;
  /** Story 9.6: Get messages around a specific message ID */
  aroundMessageId?: string;
}

export interface GetMessagesResult {
  messages: ChatMessage[];
  hasMore: boolean;
  hasPrevious?: boolean;
  cursor?: string;
  prevCursor?: string;
  totalInThread?: number;
  /** Story 9.6: The target message ID if aroundMessageId was used */
  targetMessageId?: string;
}

/**
 * ChatService
 * Story 9.2: Send Message to Agent
 *
 * Handles CRUD operations for chat messages
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private static readonly DEFAULT_CONTEXT_MESSAGE_COUNT = 10;

  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
    private readonly agentQueueService: AgentQueueService,
    private readonly agentsService: AgentsService,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Create a new chat message
   * If sent by a user to an agent, queues a job for agent response
   */
  async createMessage(params: CreateMessageParams): Promise<{ message: ChatMessage; jobId?: string }> {
    const {
      workspaceId,
      projectId,
      agentId,
      userId,
      senderType,
      agentType,
      text,
      isStatusUpdate = false,
      metadata,
    } = params;

    // Detect or create conversation thread
    let conversationId: string | null = null;
    try {
      conversationId = await this.conversationService.detectOrCreateConversation(
        workspaceId,
        agentId || null,
        new Date(),
        text,
      );
    } catch (error) {
      // Log but don't fail message creation if conversation detection fails
      this.logger.warn(`Failed to detect conversation for message: ${error}`);
    }

    // Create the message with conversation ID
    const message = this.chatMessageRepository.create({
      workspaceId,
      projectId: projectId || null,
      agentId: agentId || null,
      userId: userId || null,
      conversationId,
      senderType,
      agentType: agentType || null,
      text,
      isStatusUpdate,
      metadata: metadata || null,
      status: ChatMessageStatus.SENT,
    });

    await this.chatMessageRepository.save(message);

    // Update conversation message count
    if (conversationId) {
      try {
        await this.conversationService.incrementMessageCount(conversationId, text);
      } catch (error) {
        this.logger.warn(`Failed to update conversation message count: ${error}`);
      }
    }

    this.logger.log(
      `Message ${message.id} created in workspace ${workspaceId} (sender: ${senderType})`,
    );

    // If user message to an agent, queue agent response job
    let jobId: string | undefined;
    if (senderType === ChatSenderType.USER && agentId && userId) {
      try {
        // Get agent info for routing
        const agent = await this.agentsService.getAgent(agentId, workspaceId);

        // Get conversation context
        const conversationContext = await this.getConversationContext(
          workspaceId,
          agentId,
        );

        const jobData: AgentJobData = {
          workspaceId,
          userId,
          jobType: AgentJobType.PROCESS_CHAT_MESSAGE,
          data: {
            messageId: message.id,
            agentId,
            agentType: agent.type,
            workspaceId,
            projectId: projectId || undefined,
            text,
            conversationContext: {
              lastMessages: conversationContext,
            },
          },
        };

        const job = await this.agentQueueService.addJob(jobData);
        jobId = job.id;

        this.logger.log(
          `Queued PROCESS_CHAT_MESSAGE job ${jobId} for message ${message.id}`,
        );
      } catch (error) {
        // Log error but don't fail message creation
        this.logger.error(
          `Failed to queue agent response job for message ${message.id}: ${error}`,
        );
      }
    }

    return { message, jobId };
  }

  /**
   * Get messages with pagination and filtering
   * Story 9.5: Enhanced with conversation filtering and bi-directional pagination
   * Story 9.6: Added aroundDate and aroundMessageId for navigation
   */
  async getMessages(params: GetMessagesParams): Promise<GetMessagesResult> {
    const {
      workspaceId,
      agentId,
      projectId,
      conversationId,
      limit = 50,
      before,
      after,
      aroundDate,
      aroundMessageId,
    } = params;

    // Story 9.6: Handle aroundDate navigation
    if (aroundDate) {
      return this.getMessagesAroundDate(
        workspaceId,
        conversationId,
        aroundDate,
        limit,
        agentId,
        projectId,
      );
    }

    // Story 9.6: Handle aroundMessageId navigation
    if (aroundMessageId) {
      return this.getMessagesAroundMessage(
        workspaceId,
        conversationId,
        aroundMessageId,
        limit,
        agentId,
        projectId,
      );
    }

    // Ensure limit is within bounds
    const safeLimit = Math.min(Math.max(1, limit), 100);

    // Handle cursor-based pagination (bi-directional)
    let cursorMessage: ChatMessage | null = null;
    let afterMessage: ChatMessage | null = null;

    if (before) {
      cursorMessage = await this.chatMessageRepository.findOne({
        where: { id: before, workspaceId },
      });
      if (!cursorMessage) {
        this.logger.warn(`Invalid cursor: ${before}`);
      }
    }

    if (after) {
      afterMessage = await this.chatMessageRepository.findOne({
        where: { id: after, workspaceId },
      });
      if (!afterMessage) {
        this.logger.warn(`Invalid after cursor: ${after}`);
      }
    }

    // Build the query
    const queryBuilder = this.chatMessageRepository
      .createQueryBuilder('message')
      .where('message.workspaceId = :workspaceId', { workspaceId })
      .andWhere('message.isArchived = :isArchived', { isArchived: false });

    if (agentId) {
      queryBuilder.andWhere('message.agentId = :agentId', { agentId });
    }

    if (projectId) {
      queryBuilder.andWhere('message.projectId = :projectId', { projectId });
    }

    if (conversationId) {
      queryBuilder.andWhere('message.conversationId = :conversationId', { conversationId });
    }

    // Handle pagination direction
    if (afterMessage) {
      // Loading newer messages
      queryBuilder.andWhere('message.createdAt > :afterCreatedAt', {
        afterCreatedAt: afterMessage.createdAt,
      });
      queryBuilder.orderBy('message.createdAt', 'ASC');
    } else if (cursorMessage) {
      // Loading older messages
      queryBuilder.andWhere('message.createdAt < :cursorCreatedAt', {
        cursorCreatedAt: cursorMessage.createdAt,
      });
      queryBuilder.orderBy('message.createdAt', 'DESC');
    } else {
      // Initial load - get most recent messages
      queryBuilder.orderBy('message.createdAt', 'DESC');
    }

    queryBuilder.take(safeLimit + 1);

    let messages = await queryBuilder.getMany();

    // Determine if there are more messages
    const hasMore = messages.length > safeLimit;
    if (hasMore) {
      messages.pop();
    }

    // For backward pagination (before cursor), reverse to get chronological order
    if (cursorMessage || !afterMessage) {
      messages.reverse();
    }

    // Cursors for next/prev pages
    const cursor = messages.length > 0 ? messages[messages.length - 1].id : undefined;
    const prevCursor = messages.length > 0 ? messages[0].id : undefined;

    // Check if there are previous (newer) messages
    let hasPrevious = false;
    if (messages.length > 0) {
      const newerCount = await this.chatMessageRepository
        .createQueryBuilder('message')
        .where('message.workspaceId = :workspaceId', { workspaceId })
        .andWhere('message.isArchived = :isArchived', { isArchived: false })
        .andWhere('message.createdAt > :lastCreatedAt', {
          lastCreatedAt: messages[messages.length - 1].createdAt,
        })
        .getCount();
      hasPrevious = newerCount > 0;
    }

    // Get total count if filtering by conversation
    let totalInThread: number | undefined;
    if (conversationId) {
      totalInThread = await this.chatMessageRepository.count({
        where: { workspaceId, conversationId, isArchived: false },
      });
    }

    return {
      messages,
      hasMore,
      hasPrevious,
      cursor,
      prevCursor,
      totalInThread,
    };
  }

  /**
   * Story 9.6: Get messages centered around a specific date
   * Used for "Jump to Date" functionality
   * HIGH-4 Fix: Use UTC for date boundaries to avoid timezone issues
   */
  async getMessagesAroundDate(
    workspaceId: string,
    conversationId: string | undefined,
    targetDate: Date,
    limit: number = 50,
    agentId?: string,
    projectId?: string,
  ): Promise<GetMessagesResult> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const halfLimit = Math.floor(safeLimit / 2);

    // HIGH-4 Fix: Use UTC for date boundaries to handle timezone differences
    // The client sends date as ISO string (e.g., "2026-01-15") which is parsed as UTC midnight
    // We use the same UTC day boundaries for consistency
    const startOfDay = new Date(Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      targetDate.getUTCDate(),
      0, 0, 0, 0
    ));

    const endOfDay = new Date(Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      targetDate.getUTCDate(),
      23, 59, 59, 999
    ));

    // Build base query conditions
    const buildBaseQuery = () => {
      const qb = this.chatMessageRepository
        .createQueryBuilder('message')
        .where('message.workspaceId = :workspaceId', { workspaceId })
        .andWhere('message.isArchived = :isArchived', { isArchived: false });

      if (conversationId) {
        qb.andWhere('message.conversationId = :conversationId', { conversationId });
      }
      if (agentId) {
        qb.andWhere('message.agentId = :agentId', { agentId });
      }
      if (projectId) {
        qb.andWhere('message.projectId = :projectId', { projectId });
      }

      return qb;
    };

    // Get messages before the target date
    const beforeMessages = await buildBaseQuery()
      .andWhere('message.createdAt < :startOfDay', { startOfDay })
      .orderBy('message.createdAt', 'DESC')
      .take(halfLimit)
      .getMany();

    // Get messages on and after the target date
    const afterMessages = await buildBaseQuery()
      .andWhere('message.createdAt >= :startOfDay', { startOfDay })
      .orderBy('message.createdAt', 'ASC')
      .take(halfLimit + 1)
      .getMany();

    // Combine and sort chronologically
    const messages = [...beforeMessages.reverse(), ...afterMessages];

    // Determine if there are more messages in either direction
    const hasMore = beforeMessages.length === halfLimit;
    const hasPrevious = afterMessages.length > halfLimit;

    // Trim if we got more than limit
    if (messages.length > safeLimit) {
      messages.splice(safeLimit);
    }

    const cursor = messages.length > 0 ? messages[messages.length - 1].id : undefined;
    const prevCursor = messages.length > 0 ? messages[0].id : undefined;

    // Get total count if filtering by conversation
    let totalInThread: number | undefined;
    if (conversationId) {
      totalInThread = await this.chatMessageRepository.count({
        where: { workspaceId, conversationId, isArchived: false },
      });
    }

    return {
      messages,
      hasMore,
      hasPrevious,
      cursor,
      prevCursor,
      totalInThread,
    };
  }

  /**
   * Story 9.6: Get messages centered around a specific message
   * Used for search result navigation and "Jump to Message"
   */
  async getMessagesAroundMessage(
    workspaceId: string,
    conversationId: string | undefined,
    targetMessageId: string,
    limit: number = 50,
    agentId?: string,
    projectId?: string,
  ): Promise<GetMessagesResult> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const halfLimit = Math.floor(safeLimit / 2);

    // First, find the target message
    const targetMessage = await this.chatMessageRepository.findOne({
      where: { id: targetMessageId, workspaceId },
    });

    if (!targetMessage) {
      throw new NotFoundException(`Message ${targetMessageId} not found`);
    }

    // Build base query conditions
    const buildBaseQuery = () => {
      const qb = this.chatMessageRepository
        .createQueryBuilder('message')
        .where('message.workspaceId = :workspaceId', { workspaceId })
        .andWhere('message.isArchived = :isArchived', { isArchived: false });

      // If target message has a conversation ID, use it for filtering
      const effectiveConversationId = conversationId || targetMessage.conversationId;
      if (effectiveConversationId) {
        qb.andWhere('message.conversationId = :conversationId', {
          conversationId: effectiveConversationId,
        });
      }
      if (agentId) {
        qb.andWhere('message.agentId = :agentId', { agentId });
      }
      if (projectId) {
        qb.andWhere('message.projectId = :projectId', { projectId });
      }

      return qb;
    };

    // Get messages before the target message
    const beforeMessages = await buildBaseQuery()
      .andWhere('message.createdAt < :targetCreatedAt', {
        targetCreatedAt: targetMessage.createdAt,
      })
      .orderBy('message.createdAt', 'DESC')
      .take(halfLimit)
      .getMany();

    // Get messages after (and including) the target message
    const afterMessages = await buildBaseQuery()
      .andWhere('message.createdAt >= :targetCreatedAt', {
        targetCreatedAt: targetMessage.createdAt,
      })
      .orderBy('message.createdAt', 'ASC')
      .take(halfLimit + 1)
      .getMany();

    // Combine and sort chronologically
    const messages = [...beforeMessages.reverse(), ...afterMessages];

    // Determine if there are more messages in either direction
    const hasMore = beforeMessages.length === halfLimit;
    const hasPrevious = afterMessages.length > halfLimit;

    // Trim if we got more than limit
    if (messages.length > safeLimit) {
      messages.splice(safeLimit);
    }

    const cursor = messages.length > 0 ? messages[messages.length - 1].id : undefined;
    const prevCursor = messages.length > 0 ? messages[0].id : undefined;

    // Get total count
    const effectiveConversationId = conversationId || targetMessage.conversationId;
    let totalInThread: number | undefined;
    if (effectiveConversationId) {
      totalInThread = await this.chatMessageRepository.count({
        where: { workspaceId, conversationId: effectiveConversationId, isArchived: false },
      });
    }

    return {
      messages,
      hasMore,
      hasPrevious,
      cursor,
      prevCursor,
      totalInThread,
      targetMessageId,
    };
  }

  /**
   * Update message delivery status
   * Uses atomic conditional update to prevent race conditions
   */
  async updateMessageStatus(
    messageId: string,
    status: 'delivered' | 'read',
    workspaceId?: string,
  ): Promise<ChatMessage> {
    // Build where condition
    const where: FindOptionsWhere<ChatMessage> = { id: messageId };
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }

    const message = await this.chatMessageRepository.findOne({ where });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    // Validate status transition
    const statusOrder = { sent: 0, delivered: 1, read: 2 };
    const currentStatusOrder = statusOrder[message.status];
    const newStatusOrder = statusOrder[status];

    if (newStatusOrder <= currentStatusOrder) {
      throw new BadRequestException(
        `Cannot update status from ${message.status} to ${status}`,
      );
    }

    // Build atomic update with conditional WHERE clause to prevent race conditions
    const now = new Date();
    const updateData: Record<string, unknown> = {
      status: status as ChatMessageStatus,
    };

    if (status === 'delivered') {
      updateData.deliveredAt = now;
    }
    if (status === 'read') {
      updateData.readAt = now;
      updateData.deliveredAt = message.deliveredAt || now;
    }

    // Use atomic update with status check to prevent TOCTOU race condition
    const validPreviousStatuses = status === 'delivered'
      ? [ChatMessageStatus.SENT]
      : [ChatMessageStatus.SENT, ChatMessageStatus.DELIVERED];

    const result = await this.chatMessageRepository
      .createQueryBuilder()
      .update(ChatMessage)
      .set(updateData as any)
      .where('id = :id', { id: messageId })
      .andWhere('status IN (:...validStatuses)', { validStatuses: validPreviousStatuses })
      .execute();

    if (result.affected === 0) {
      // Either message was deleted or status already changed (race condition)
      throw new BadRequestException(
        `Cannot update status to ${status}. Message may have been updated by another request.`,
      );
    }

    // Fetch and return the updated message
    const updatedMessage = await this.chatMessageRepository.findOne({ where: { id: messageId } });
    if (!updatedMessage) {
      throw new NotFoundException(`Message ${messageId} not found after update`);
    }

    this.logger.log(`Message ${messageId} status updated to ${status}`);

    return updatedMessage;
  }

  /**
   * Get conversation context (last N messages) for agent prompts
   */
  async getConversationContext(
    workspaceId: string,
    agentId: string,
    messageCount: number = ChatService.DEFAULT_CONTEXT_MESSAGE_COUNT,
  ): Promise<ChatMessage[]> {
    const messages = await this.chatMessageRepository.find({
      where: {
        workspaceId,
        agentId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: messageCount,
    });

    // Return in chronological order
    return messages.reverse();
  }

  /**
   * Get a single message by ID (with workspace isolation)
   */
  async getMessage(messageId: string, workspaceId: string): Promise<ChatMessage> {
    const message = await this.chatMessageRepository.findOne({
      where: { id: messageId, workspaceId },
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    return message;
  }

  /**
   * Check if user can access messages in a workspace
   * (Actual access control is handled by guards, this is for additional validation)
   */
  async validateUserAccess(
    userId: string,
    workspaceId: string,
    messageId?: string,
  ): Promise<void> {
    if (messageId) {
      const message = await this.chatMessageRepository.findOne({
        where: { id: messageId, workspaceId },
      });

      if (!message) {
        throw new NotFoundException(`Message ${messageId} not found`);
      }
    }
    // Additional access checks could be added here
  }
}
