import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ChatMessage, ChatMessageStatus } from '../../../database/entities/chat-message.entity';

/**
 * Read source types
 */
export type ReadSource = 'viewed' | 'notification_clicked' | 'mark_all_read';

/**
 * Unread count result
 */
export interface UnreadCountResult {
  total: number;
  byAgent: Record<string, number>;
}

/**
 * MessageReadTrackingService
 * Story 9.9: Chat Notifications
 *
 * Service for tracking read/unread status of chat messages
 */
@Injectable()
export class MessageReadTrackingService {
  private readonly logger = new Logger(MessageReadTrackingService.name);

  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
  ) {}

  /**
   * Mark specific messages as read
   */
  async markAsRead(
    messageIds: string[],
    userId: string,
    workspaceId: string,
    source: ReadSource = 'viewed',
  ): Promise<string[]> {
    if (messageIds.length === 0) {
      return [];
    }

    const now = new Date();

    // Only mark messages that belong to the workspace and aren't already read
    const result = await this.chatMessageRepository
      .createQueryBuilder()
      .update(ChatMessage)
      .set({
        readAt: now,
        status: ChatMessageStatus.READ,
      })
      .where('id IN (:...messageIds)', { messageIds })
      .andWhere('workspaceId = :workspaceId', { workspaceId })
      .andWhere('readAt IS NULL')
      .andWhere('senderType = :senderType', { senderType: 'agent' }) // Only track reads on agent messages
      .execute();

    this.logger.debug(
      `Marked ${result.affected || 0} messages as read for user ${userId} (source: ${source})`,
    );

    return messageIds;
  }

  /**
   * Mark all messages as read for a user, optionally filtered by agent
   */
  async markAllAsRead(
    userId: string,
    workspaceId: string,
    agentId?: string,
  ): Promise<number> {
    const now = new Date();

    const queryBuilder = this.chatMessageRepository
      .createQueryBuilder()
      .update(ChatMessage)
      .set({
        readAt: now,
        status: ChatMessageStatus.READ,
      })
      .where('workspaceId = :workspaceId', { workspaceId })
      .andWhere('readAt IS NULL')
      .andWhere('senderType = :senderType', { senderType: 'agent' });

    if (agentId) {
      queryBuilder.andWhere('agentId = :agentId', { agentId });
    }

    const result = await queryBuilder.execute();

    this.logger.log(
      `Marked ${result.affected || 0} messages as read for user ${userId}${agentId ? ` (agent: ${agentId})` : ''}`,
    );

    return result.affected || 0;
  }

  /**
   * Get unread message count for a user in a workspace
   */
  async getUnreadCount(
    userId: string,
    workspaceId: string,
    agentId?: string,
  ): Promise<UnreadCountResult> {
    // Get total unread count
    const totalQueryBuilder = this.chatMessageRepository
      .createQueryBuilder('message')
      .where('message.workspaceId = :workspaceId', { workspaceId })
      .andWhere('message.readAt IS NULL')
      .andWhere('message.senderType = :senderType', { senderType: 'agent' })
      .andWhere('message.isArchived = :isArchived', { isArchived: false });

    if (agentId) {
      totalQueryBuilder.andWhere('message.agentId = :agentId', { agentId });
    }

    const total = await totalQueryBuilder.getCount();

    // Get count by agent
    const byAgentQuery = await this.chatMessageRepository
      .createQueryBuilder('message')
      .select('message.agentId', 'agentId')
      .addSelect('COUNT(*)', 'count')
      .where('message.workspaceId = :workspaceId', { workspaceId })
      .andWhere('message.readAt IS NULL')
      .andWhere('message.senderType = :senderType', { senderType: 'agent' })
      .andWhere('message.isArchived = :isArchived', { isArchived: false })
      .andWhere('message.agentId IS NOT NULL')
      .groupBy('message.agentId')
      .getRawMany();

    const byAgent: Record<string, number> = {};
    for (const row of byAgentQuery) {
      byAgent[row.agentId] = parseInt(row.count, 10);
    }

    return { total, byAgent };
  }

  /**
   * Get unread messages for a user
   */
  async getUnreadMessages(
    userId: string,
    workspaceId: string,
    limit: number = 50,
    agentId?: string,
  ): Promise<ChatMessage[]> {
    const queryBuilder = this.chatMessageRepository
      .createQueryBuilder('message')
      .where('message.workspaceId = :workspaceId', { workspaceId })
      .andWhere('message.readAt IS NULL')
      .andWhere('message.senderType = :senderType', { senderType: 'agent' })
      .andWhere('message.isArchived = :isArchived', { isArchived: false })
      .orderBy('message.createdAt', 'DESC')
      .take(limit);

    if (agentId) {
      queryBuilder.andWhere('message.agentId = :agentId', { agentId });
    }

    return queryBuilder.getMany();
  }

  /**
   * Check if a message is read
   */
  async isMessageRead(
    messageId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const message = await this.chatMessageRepository.findOne({
      where: { id: messageId, workspaceId },
      select: ['id', 'readAt'],
    });

    return message?.readAt !== null;
  }

  /**
   * Get read status for multiple messages
   */
  async getReadStatus(
    messageIds: string[],
    workspaceId: string,
  ): Promise<Record<string, boolean>> {
    if (messageIds.length === 0) {
      return {};
    }

    const messages = await this.chatMessageRepository.find({
      where: { id: In(messageIds), workspaceId },
      select: ['id', 'readAt'],
    });

    const result: Record<string, boolean> = {};
    for (const message of messages) {
      result[message.id] = message.readAt !== null;
    }

    return result;
  }
}
