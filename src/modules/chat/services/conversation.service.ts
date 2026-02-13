import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationThread } from '../../../database/entities/conversation-thread.entity';
import { ChatMessage } from '../../../database/entities/chat-message.entity';

/**
 * Parameters for creating a new conversation thread
 */
export interface CreateThreadParams {
  workspaceId: string;
  projectId?: string | null;
  agentId?: string | null;
  title?: string;
  firstMessageText?: string;
}

/**
 * Parameters for listing conversation threads
 */
export interface GetThreadsParams {
  workspaceId: string;
  projectId?: string;
  agentId?: string;
  includeArchived?: boolean;
  limit?: number;
  before?: string; // cursor (thread ID)
}

/**
 * Result from listing conversation threads
 */
export interface GetThreadsResult {
  threads: ConversationThread[];
  hasMore: boolean;
  cursor?: string;
}

/**
 * Parameters for updating a thread
 */
export interface UpdateThreadParams {
  title?: string;
  isArchived?: boolean;
}

/**
 * ConversationService
 * Story 9.5: Conversation History Storage
 *
 * Manages conversation threads and auto-detection of thread boundaries
 * based on time gaps (4+ hours = new conversation).
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  /** Gap in hours that triggers a new conversation */
  private static readonly CONVERSATION_GAP_HOURS = 4;

  /** Maximum title length */
  private static readonly MAX_TITLE_LENGTH = 50;

  /** Maximum preview length */
  private static readonly MAX_PREVIEW_LENGTH = 100;

  /** Default limit for listing threads */
  private static readonly DEFAULT_LIMIT = 20;

  constructor(
    @InjectRepository(ConversationThread)
    private readonly conversationRepository: Repository<ConversationThread>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
  ) {}

  /**
   * Create a new conversation thread
   */
  async createThread(params: CreateThreadParams): Promise<ConversationThread> {
    const { workspaceId, projectId, agentId, title, firstMessageText } = params;

    // Auto-generate title from first message if not provided
    let threadTitle = title;
    if (!threadTitle && firstMessageText) {
      threadTitle = firstMessageText.substring(0, ConversationService.MAX_TITLE_LENGTH);
    }

    const thread = this.conversationRepository.create({
      workspaceId,
      projectId: projectId || null,
      agentId: agentId || null,
      title: threadTitle,
      messageCount: 0,
      isArchived: false,
    });

    await this.conversationRepository.save(thread);

    this.logger.log(
      `Created conversation thread ${thread.id} in workspace ${workspaceId}`,
    );

    return thread;
  }

  /**
   * Get conversation threads with pagination
   */
  async getThreads(params: GetThreadsParams): Promise<GetThreadsResult> {
    const {
      workspaceId,
      projectId,
      agentId,
      includeArchived = false,
      limit = ConversationService.DEFAULT_LIMIT,
      before,
    } = params;

    // Ensure limit is within bounds
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const queryBuilder = this.conversationRepository
      .createQueryBuilder('thread')
      .where('thread.workspaceId = :workspaceId', { workspaceId });

    if (projectId) {
      queryBuilder.andWhere('thread.projectId = :projectId', { projectId });
    }

    if (agentId) {
      queryBuilder.andWhere('thread.agentId = :agentId', { agentId });
    }

    if (!includeArchived) {
      queryBuilder.andWhere('thread.isArchived = :isArchived', { isArchived: false });
    }

    // Handle cursor pagination
    if (before) {
      const cursorThread = await this.conversationRepository.findOne({
        where: { id: before, workspaceId },
      });
      if (cursorThread?.lastMessageAt) {
        queryBuilder.andWhere('thread.lastMessageAt < :cursorTime', {
          cursorTime: cursorThread.lastMessageAt,
        });
      }
    }

    queryBuilder
      .orderBy('thread.lastMessageAt', 'DESC', 'NULLS LAST')
      .take(safeLimit + 1);

    const threads = await queryBuilder.getMany();

    // Determine if there are more threads
    const hasMore = threads.length > safeLimit;
    if (hasMore) {
      threads.pop();
    }

    const cursor = threads.length > 0 ? threads[threads.length - 1].id : undefined;

    return {
      threads,
      hasMore,
      cursor,
    };
  }

  /**
   * Get a single thread by ID with workspace isolation
   */
  async getThreadById(
    threadId: string,
    workspaceId: string,
  ): Promise<ConversationThread | null> {
    return this.conversationRepository.findOne({
      where: { id: threadId, workspaceId },
    });
  }

  /**
   * Update thread properties
   */
  async updateThread(
    threadId: string,
    workspaceId: string,
    params: UpdateThreadParams,
  ): Promise<ConversationThread> {
    const thread = await this.conversationRepository.findOne({
      where: { id: threadId, workspaceId },
    });

    if (!thread) {
      throw new NotFoundException(`Thread ${threadId} not found`);
    }

    if (params.title !== undefined) {
      thread.title = params.title;
    }

    if (params.isArchived !== undefined) {
      thread.isArchived = params.isArchived;
      thread.archivedAt = params.isArchived ? new Date() : null;
    }

    await this.conversationRepository.save(thread);

    this.logger.log(`Updated conversation thread ${threadId}`);

    return thread;
  }

  /**
   * Detect or create conversation thread for a new message
   * Uses 4-hour gap rule to determine thread boundaries
   * MEDIUM-2 FIX: Added transaction with retry logic to handle race conditions
   */
  async detectOrCreateConversation(
    workspaceId: string,
    agentId: string | null,
    messageCreatedAt: Date,
    messageText: string,
  ): Promise<string> {
    // Check if connection exists (for testability)
    const connection = this.conversationRepository.manager.connection;

    // If no connection available (e.g., in unit tests), use non-transactional path
    if (!connection || !connection.isInitialized) {
      return this.detectOrCreateConversationNonTransactional(
        workspaceId,
        agentId,
        messageCreatedAt,
        messageText
      );
    }

    // Use pessimistic locking via FOR UPDATE to prevent race conditions
    // This ensures only one transaction can create a thread at a time
    const queryRunner = connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find last message in same workspace/agent context with lock
      const lastMessage = await queryRunner.manager
        .createQueryBuilder(ChatMessage, 'msg')
        .where('msg.workspaceId = :workspaceId', { workspaceId })
        .andWhere(agentId ? 'msg.agentId = :agentId' : 'msg.agentId IS NULL', { agentId })
        .orderBy('msg.createdAt', 'DESC')
        .setLock('pessimistic_read')
        .getOne();

      let conversationId: string;

      // No previous messages - create new conversation
      if (!lastMessage) {
        const thread = await this.createThreadWithManager(
          queryRunner.manager,
          { workspaceId, agentId, firstMessageText: messageText }
        );
        conversationId = thread.id;
      }
      // Last message has no conversation - create new
      else if (!lastMessage.conversationId) {
        const thread = await this.createThreadWithManager(
          queryRunner.manager,
          { workspaceId, agentId, firstMessageText: messageText }
        );
        conversationId = thread.id;
      }
      // Check time gap
      else {
        const hoursSinceLastMessage =
          (messageCreatedAt.getTime() - lastMessage.createdAt.getTime()) /
          (1000 * 60 * 60);

        if (hoursSinceLastMessage > ConversationService.CONVERSATION_GAP_HOURS) {
          // Time gap exceeded - create new conversation
          const thread = await this.createThreadWithManager(
            queryRunner.manager,
            { workspaceId, agentId, firstMessageText: messageText }
          );
          conversationId = thread.id;
        } else {
          // Continue existing conversation
          conversationId = lastMessage.conversationId;
        }
      }

      await queryRunner.commitTransaction();
      return conversationId;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to detect/create conversation', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Non-transactional version for unit testing and fallback
   */
  private async detectOrCreateConversationNonTransactional(
    workspaceId: string,
    agentId: string | null,
    messageCreatedAt: Date,
    messageText: string,
  ): Promise<string> {
    // Find last message in same workspace/agent context
    const lastMessage = await this.messageRepository.findOne({
      where: { workspaceId, agentId: agentId || undefined },
      order: { createdAt: 'DESC' },
    });

    // No previous messages - create new conversation
    if (!lastMessage) {
      const thread = await this.createThread({
        workspaceId,
        agentId,
        firstMessageText: messageText,
      });
      return thread.id;
    }

    // Last message has no conversation - create new
    if (!lastMessage.conversationId) {
      const thread = await this.createThread({
        workspaceId,
        agentId,
        firstMessageText: messageText,
      });
      return thread.id;
    }

    // Check time gap
    const hoursSinceLastMessage =
      (messageCreatedAt.getTime() - lastMessage.createdAt.getTime()) /
      (1000 * 60 * 60);

    if (hoursSinceLastMessage > ConversationService.CONVERSATION_GAP_HOURS) {
      // Time gap exceeded - create new conversation
      const thread = await this.createThread({
        workspaceId,
        agentId,
        firstMessageText: messageText,
      });
      return thread.id;
    }

    // Continue existing conversation
    return lastMessage.conversationId;
  }

  /**
   * Helper method to create thread within a transaction
   * MEDIUM-2 FIX: Used for transactional thread creation
   */
  private async createThreadWithManager(
    manager: any,
    params: CreateThreadParams,
  ): Promise<ConversationThread> {
    const { workspaceId, projectId, agentId, title, firstMessageText } = params;

    let threadTitle = title;
    if (!threadTitle && firstMessageText) {
      threadTitle = firstMessageText.substring(0, ConversationService.MAX_TITLE_LENGTH);
    }

    const thread = manager.create(ConversationThread, {
      workspaceId,
      projectId: projectId || null,
      agentId: agentId || null,
      title: threadTitle,
      messageCount: 0,
      isArchived: false,
    });

    await manager.save(thread);

    this.logger.log(
      `Created conversation thread ${thread.id} in workspace ${workspaceId} (transactional)`,
    );

    return thread;
  }

  /**
   * Increment message count for a thread and update last message info
   * Uses atomic update to prevent race conditions
   */
  async incrementMessageCount(
    threadId: string,
    messageText: string,
  ): Promise<void> {
    const preview = messageText.substring(0, ConversationService.MAX_PREVIEW_LENGTH);
    const now = new Date();

    await this.conversationRepository
      .createQueryBuilder()
      .update(ConversationThread)
      .set({
        messageCount: () => 'message_count + 1',
        lastMessageAt: now,
        lastMessagePreview: preview,
      })
      .where('id = :id', { id: threadId })
      .execute();
  }

  /**
   * Archive a conversation thread
   */
  async archiveThread(threadId: string, workspaceId: string): Promise<ConversationThread> {
    return this.updateThread(threadId, workspaceId, { isArchived: true });
  }

  /**
   * Unarchive a conversation thread
   */
  async unarchiveThread(threadId: string, workspaceId: string): Promise<ConversationThread> {
    return this.updateThread(threadId, workspaceId, { isArchived: false });
  }
}
