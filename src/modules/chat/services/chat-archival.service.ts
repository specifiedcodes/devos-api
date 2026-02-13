import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatMessage } from '../../../database/entities/chat-message.entity';
import { ConversationThread } from '../../../database/entities/conversation-thread.entity';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';

/**
 * Configuration for archival process
 */
export interface ArchivalConfig {
  retentionDays?: number;
  workspaceId?: string;
  batchSize?: number;
}

/**
 * Result from archival operation
 */
export interface ArchivalResult {
  messagesArchived: number;
  conversationsArchived: number;
  executionTimeMs: number;
}

/**
 * Result from unarchival operation
 */
export interface UnarchivalResult {
  messagesUnarchived: number;
  conversationUnarchived: boolean;
}

/**
 * ChatArchivalService
 * Story 9.5: Conversation History Storage
 *
 * Provides archival functionality for old messages with scheduled job support.
 * Messages older than retention period (default 90 days) are marked as archived.
 */
@Injectable()
export class ChatArchivalService {
  private readonly logger = new Logger(ChatArchivalService.name);

  /** Default retention period in days */
  private static readonly DEFAULT_RETENTION_DAYS = 90;

  /** Default batch size for archival */
  private static readonly DEFAULT_BATCH_SIZE = 1000;

  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(ConversationThread)
    private readonly conversationRepository: Repository<ConversationThread>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Archive old messages based on retention period
   * Marks messages as archived (soft delete) rather than hard deleting
   */
  async archiveOldMessages(config: ArchivalConfig = {}): Promise<ArchivalResult> {
    const startTime = Date.now();
    const {
      retentionDays = ChatArchivalService.DEFAULT_RETENTION_DAYS,
      workspaceId,
      batchSize = ChatArchivalService.DEFAULT_BATCH_SIZE,
    } = config;

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    this.logger.log(
      `Starting archival for messages older than ${retentionDays} days (${cutoffDate.toISOString()})`,
    );

    // Archive old messages
    const messageQueryBuilder = this.chatMessageRepository
      .createQueryBuilder()
      .update(ChatMessage)
      .set({
        isArchived: true,
        archivedAt: new Date(),
      })
      .where('created_at < :cutoffDate', { cutoffDate })
      .andWhere('is_archived = :isArchived', { isArchived: false });

    if (workspaceId) {
      messageQueryBuilder.andWhere('workspace_id = :workspaceId', { workspaceId });
    }

    const messageResult = await messageQueryBuilder.execute();
    const messagesArchived = messageResult.affected || 0;

    // Archive old conversations (those without recent messages)
    const conversationQueryBuilder = this.conversationRepository
      .createQueryBuilder()
      .update(ConversationThread)
      .set({
        isArchived: true,
        archivedAt: new Date(),
      })
      .where('last_message_at < :cutoffDate', { cutoffDate })
      .andWhere('is_archived = :isArchived', { isArchived: false });

    if (workspaceId) {
      conversationQueryBuilder.andWhere('workspace_id = :workspaceId', { workspaceId });
    }

    const conversationResult = await conversationQueryBuilder.execute();
    const conversationsArchived = conversationResult.affected || 0;

    const executionTimeMs = Date.now() - startTime;

    // Log archival action - use system user ID for scheduled jobs
    const systemUserId = 'system';
    await this.auditService.log(
      workspaceId || 'system',
      systemUserId,
      AuditAction.UPDATE,
      'chat_messages',
      'archival',
      {
        messagesArchived,
        conversationsArchived,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        executionTimeMs,
      },
    );

    this.logger.log(
      `Archival complete: ${messagesArchived} messages, ${conversationsArchived} conversations (${executionTimeMs}ms)`,
    );

    return {
      messagesArchived,
      conversationsArchived,
      executionTimeMs,
    };
  }

  /**
   * Unarchive a conversation and its messages
   */
  async unarchiveConversation(
    conversationId: string,
    workspaceId: string,
  ): Promise<UnarchivalResult> {
    // Unarchive messages in the conversation
    const messageResult = await this.chatMessageRepository
      .createQueryBuilder()
      .update(ChatMessage)
      .set({
        isArchived: false,
        archivedAt: null,
      })
      .where('conversation_id = :conversationId', { conversationId })
      .andWhere('workspace_id = :workspaceId', { workspaceId })
      .execute();

    // Unarchive the conversation itself
    const conversationResult = await this.conversationRepository
      .createQueryBuilder()
      .update(ConversationThread)
      .set({
        isArchived: false,
        archivedAt: null,
      })
      .where('id = :conversationId', { conversationId })
      .andWhere('workspace_id = :workspaceId', { workspaceId })
      .execute();

    const messagesUnarchived = messageResult.affected || 0;
    const conversationUnarchived = (conversationResult.affected || 0) > 0;

    this.logger.log(
      `Unarchived conversation ${conversationId}: ${messagesUnarchived} messages`,
    );

    return {
      messagesUnarchived,
      conversationUnarchived,
    };
  }

  /**
   * Scheduled job to run archival at 2 AM daily
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleScheduledArchival(): Promise<void> {
    this.logger.log('Running scheduled archival job');

    try {
      const result = await this.archiveOldMessages();
      this.logger.log(
        `Scheduled archival complete: ${result.messagesArchived} messages, ${result.conversationsArchived} conversations`,
      );
    } catch (error) {
      this.logger.error('Scheduled archival failed', error);
    }
  }

  /**
   * Get archival statistics for a workspace
   */
  async getArchivalStats(workspaceId: string): Promise<{
    totalMessages: number;
    archivedMessages: number;
    activeMessages: number;
    oldestMessageDate: Date | null;
  }> {
    const totalMessages = await this.chatMessageRepository.count({
      where: { workspaceId },
    });

    const archivedMessages = await this.chatMessageRepository.count({
      where: { workspaceId, isArchived: true },
    });

    const oldestMessage = await this.chatMessageRepository.findOne({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });

    return {
      totalMessages,
      archivedMessages,
      activeMessages: totalMessages - archivedMessages,
      oldestMessageDate: oldestMessage?.createdAt || null,
    };
  }
}
