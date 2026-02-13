import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Agent, AgentType } from '../../../database/entities/agent.entity';
import { AgentStatusUpdate } from '../../../database/entities/agent-status-update.entity';
import { ChatMessage, ChatSenderType } from '../../../database/entities/chat-message.entity';
import {
  AgentActivityStatus,
  StatusUpdateCategory,
  ACTIVITY_STATUS_CATEGORY_MAP,
  MILESTONE_STATUSES,
} from '../enums/agent-activity-status.enum';
import { RedisService } from '../../redis/redis.service';

/**
 * Options for posting status updates
 */
export interface UpdateAgentStatusOptions {
  projectId?: string;
  category?: StatusUpdateCategory;
  metadata?: Record<string, any>;
  postToChatWhen?: 'always' | 'milestone' | 'never';
}

/**
 * Result from getting agent status history
 */
export interface StatusHistoryResult {
  statusUpdates: AgentStatusUpdate[];
  hasMore: boolean;
  cursor?: string;
}

/**
 * Current agent status info
 */
export interface CurrentAgentStatus {
  activityStatus: AgentActivityStatus | null;
  message: string | null;
  since: Date | null;
}

/**
 * Redis event channel for agent status updates
 */
const AGENT_STATUS_CHANNEL = 'agent-status-events';

/**
 * Debounce interval for rapid status changes (ms)
 */
const STATUS_DEBOUNCE_MS = 500;

/**
 * Maximum entries in debounce map before cleanup
 */
const MAX_DEBOUNCE_ENTRIES = 1000;

/**
 * AgentStatusService
 * Story 9.3: Agent Status Updates
 *
 * Manages agent activity status updates, history tracking, and real-time broadcasting.
 */
@Injectable()
export class AgentStatusService {
  private readonly logger = new Logger(AgentStatusService.name);
  private readonly statusDebounceMap = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(AgentStatusUpdate)
    private readonly statusUpdateRepo: Repository<AgentStatusUpdate>,
    @InjectRepository(Agent)
    private readonly agentRepo: Repository<Agent>,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepo: Repository<ChatMessage>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Updates agent activity status and posts status update message.
   * Handles debouncing, persistence, Redis pub/sub, and optional chat posting.
   * Uses optimistic locking to prevent race conditions.
   */
  async updateAgentStatus(
    agentId: string,
    workspaceId: string,
    newStatus: AgentActivityStatus,
    message: string,
    options?: UpdateAgentStatusOptions,
  ): Promise<AgentStatusUpdate> {
    const now = new Date();
    const sanitizedMessage = this.sanitizeMessage(message);

    // 1. Atomically update agent and get previous status using RETURNING clause
    // This prevents TOCTOU race conditions between read and update
    const updateResult = await this.agentRepo
      .createQueryBuilder()
      .update(Agent)
      .set({
        activityStatus: newStatus,
        activityStatusSince: now,
        activityMessage: sanitizedMessage,
      })
      .where('id = :agentId AND workspace_id = :workspaceId', { agentId, workspaceId })
      .returning(['id', 'type', 'name', 'activityStatus', 'projectId'])
      .execute();

    if (updateResult.affected === 0) {
      throw new NotFoundException(`Agent ${agentId} not found in workspace ${workspaceId}`);
    }

    // Extract the returned agent data (before update - PostgreSQL returns old values for our query)
    // Since RETURNING gives us new values, we need to fetch agent for details
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, workspaceId },
    });

    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found in workspace ${workspaceId}`);
    }

    // For previousStatus, we use the raw value if available, otherwise null
    // Note: The agent now has the NEW status, so we need to track separately
    const previousStatus = updateResult.raw?.[0]?.activity_status || null;

    // 2. Determine category (explicit or inferred from status)
    const category =
      options?.category || ACTIVITY_STATUS_CATEGORY_MAP[newStatus] || StatusUpdateCategory.PROGRESS;

    // 3. Create status update record with sanitized metadata
    const statusUpdate = this.statusUpdateRepo.create({
      workspaceId,
      projectId: options?.projectId || agent.projectId || null,
      agentId,
      agentType: agent.type,
      agentName: agent.name,
      previousStatus: previousStatus !== newStatus ? previousStatus : null,
      newStatus,
      message: sanitizedMessage,
      category,
      metadata: this.sanitizeMetadata(options?.metadata),
      postedToChat: false,
      chatMessageId: null,
    });

    // 4. Save status update record
    await this.statusUpdateRepo.save(statusUpdate);

    this.logger.log(
      `Agent ${agentId} status updated: ${previousStatus || 'none'} -> ${newStatus}: ${message}`,
    );

    // 6. Debounce rapid status changes before publishing
    this.debouncedPublishStatusEvent(workspaceId, statusUpdate, agent);

    // 7. Optionally post as chat message (for important milestones)
    const shouldPostToChat = this.shouldPostToChat(newStatus, options?.postToChatWhen);
    if (shouldPostToChat) {
      await this.postStatusAsChatMessage(statusUpdate, agent);
    }

    return statusUpdate;
  }

  /**
   * Get current status for an agent
   */
  async getCurrentStatus(
    agentId: string,
    workspaceId: string,
  ): Promise<{ currentStatus: CurrentAgentStatus; agent: Agent }> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, workspaceId },
    });

    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found in workspace ${workspaceId}`);
    }

    return {
      currentStatus: {
        activityStatus: agent.activityStatus,
        message: agent.activityMessage,
        since: agent.activityStatusSince,
      },
      agent,
    };
  }

  /**
   * Get status history for an agent with pagination
   */
  async getAgentStatusHistory(
    agentId: string,
    workspaceId: string,
    options?: { limit?: number; before?: Date },
  ): Promise<StatusHistoryResult> {
    const limit = Math.min(options?.limit || 50, 100);

    // Verify agent exists in workspace
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, workspaceId },
    });

    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found in workspace ${workspaceId}`);
    }

    // Build query
    const queryBuilder = this.statusUpdateRepo
      .createQueryBuilder('statusUpdate')
      .where('statusUpdate.agentId = :agentId', { agentId })
      .andWhere('statusUpdate.workspaceId = :workspaceId', { workspaceId });

    if (options?.before) {
      queryBuilder.andWhere('statusUpdate.createdAt < :before', {
        before: options.before,
      });
    }

    queryBuilder
      .orderBy('statusUpdate.createdAt', 'DESC')
      .take(limit + 1); // Fetch one extra to determine hasMore

    const statusUpdates = await queryBuilder.getMany();

    // Determine if there are more records
    const hasMore = statusUpdates.length > limit;
    if (hasMore) {
      statusUpdates.pop();
    }

    // Cursor for next page
    const cursor =
      statusUpdates.length > 0
        ? statusUpdates[statusUpdates.length - 1].createdAt.toISOString()
        : undefined;

    return {
      statusUpdates,
      hasMore,
      cursor,
    };
  }

  /**
   * Get recent status updates for a workspace
   */
  async getWorkspaceStatusUpdates(
    workspaceId: string,
    options?: { projectId?: string; agentId?: string; category?: StatusUpdateCategory; limit?: number },
  ): Promise<StatusHistoryResult> {
    const limit = Math.min(options?.limit || 20, 100);

    const queryBuilder = this.statusUpdateRepo
      .createQueryBuilder('statusUpdate')
      .where('statusUpdate.workspaceId = :workspaceId', { workspaceId });

    if (options?.projectId) {
      queryBuilder.andWhere('statusUpdate.projectId = :projectId', {
        projectId: options.projectId,
      });
    }

    if (options?.agentId) {
      queryBuilder.andWhere('statusUpdate.agentId = :agentId', {
        agentId: options.agentId,
      });
    }

    if (options?.category) {
      queryBuilder.andWhere('statusUpdate.category = :category', {
        category: options.category,
      });
    }

    queryBuilder
      .orderBy('statusUpdate.createdAt', 'DESC')
      .take(limit + 1);

    const statusUpdates = await queryBuilder.getMany();

    const hasMore = statusUpdates.length > limit;
    if (hasMore) {
      statusUpdates.pop();
    }

    return {
      statusUpdates,
      hasMore,
    };
  }

  /**
   * Determines if a status should be posted to chat
   */
  private shouldPostToChat(
    status: AgentActivityStatus,
    postToChatWhen?: 'always' | 'milestone' | 'never',
  ): boolean {
    if (postToChatWhen === 'always') return true;
    if (postToChatWhen === 'never') return false;

    // Default: post milestones only
    return MILESTONE_STATUSES.includes(status);
  }

  /**
   * Posts status update as a chat message
   */
  private async postStatusAsChatMessage(
    statusUpdate: AgentStatusUpdate,
    agent: Agent,
  ): Promise<void> {
    try {
      // Validate required inputs
      if (!statusUpdate?.id || !agent?.id) {
        this.logger.warn('postStatusAsChatMessage called with invalid inputs', {
          statusUpdateId: statusUpdate?.id,
          agentId: agent?.id,
        });
        return;
      }

      const chatMessage = this.chatMessageRepo.create({
        workspaceId: statusUpdate.workspaceId,
        projectId: statusUpdate.projectId,
        agentId: agent.id,
        userId: null,
        senderType: ChatSenderType.AGENT,
        agentType: agent.type as AgentType,
        text: statusUpdate.message,
        isStatusUpdate: true,
        metadata: {
          statusUpdateId: statusUpdate.id,
          newStatus: statusUpdate.newStatus,
          previousStatus: statusUpdate.previousStatus,
          category: statusUpdate.category,
          ...(statusUpdate.metadata || {}),
        },
      });

      const savedMessage = await this.chatMessageRepo.save(chatMessage);

      // Validate that save succeeded and returned an ID
      if (!savedMessage?.id) {
        this.logger.error('Chat message save returned without ID');
        return;
      }

      // Update status update with chat message reference
      await this.statusUpdateRepo.update(
        { id: statusUpdate.id },
        { postedToChat: true, chatMessageId: savedMessage.id },
      );

      // Publish chat message to Redis for WebSocket broadcast
      await this.publishChatMessage(savedMessage, agent);

      this.logger.debug(`Status update ${statusUpdate.id} posted to chat as message ${savedMessage.id}`);
    } catch (error) {
      this.logger.error(`Failed to post status update to chat: ${error}`);
      // Don't throw - status update succeeded, chat posting is secondary
    }
  }

  /**
   * Publishes status update event to Redis with debouncing
   * Includes safeguards against memory leaks from unbounded map growth
   */
  private debouncedPublishStatusEvent(
    workspaceId: string,
    statusUpdate: AgentStatusUpdate,
    agent: Agent,
  ): void {
    const key = `${workspaceId}:${statusUpdate.agentId}`;

    // Clear any existing timeout for this agent
    const existingTimeout = this.statusDebounceMap.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Memory leak prevention: if map grows too large, clear oldest entries
    if (this.statusDebounceMap.size >= MAX_DEBOUNCE_ENTRIES) {
      this.logger.warn(`Debounce map size exceeded ${MAX_DEBOUNCE_ENTRIES}, clearing oldest entries`);
      const entriesToRemove = Math.floor(MAX_DEBOUNCE_ENTRIES / 2);
      const keys = Array.from(this.statusDebounceMap.keys()).slice(0, entriesToRemove);
      for (const oldKey of keys) {
        const oldTimeout = this.statusDebounceMap.get(oldKey);
        if (oldTimeout) {
          clearTimeout(oldTimeout);
        }
        this.statusDebounceMap.delete(oldKey);
      }
    }

    // Set new debounced publish
    const timeout = setTimeout(async () => {
      this.statusDebounceMap.delete(key);
      await this.publishStatusEvent(workspaceId, statusUpdate, agent);
    }, STATUS_DEBOUNCE_MS);

    this.statusDebounceMap.set(key, timeout);
  }

  /**
   * Publishes status update event to Redis for WebSocket broadcast
   */
  private async publishStatusEvent(
    workspaceId: string,
    statusUpdate: AgentStatusUpdate,
    agent: Agent,
  ): Promise<void> {
    try {
      const event = {
        event: 'agent:status',
        workspaceId,
        data: {
          id: statusUpdate.id,
          agentId: statusUpdate.agentId,
          agentType: agent.type,
          agentName: agent.name,
          previousStatus: statusUpdate.previousStatus,
          newStatus: statusUpdate.newStatus,
          message: statusUpdate.message,
          category: statusUpdate.category,
          metadata: statusUpdate.metadata,
          timestamp: statusUpdate.createdAt.toISOString(),
        },
      };

      await this.redisService.publish(AGENT_STATUS_CHANNEL, JSON.stringify(event));

      this.logger.debug(`Published agent:status event for agent ${statusUpdate.agentId}`);
    } catch (error) {
      this.logger.error(`Failed to publish status event: ${error}`);
    }
  }

  /**
   * Publishes chat message to Redis for WebSocket broadcast
   */
  private async publishChatMessage(chatMessage: ChatMessage, agent: Agent): Promise<void> {
    try {
      const event = {
        event: 'chat:message',
        workspaceId: chatMessage.workspaceId,
        data: {
          id: chatMessage.id,
          workspaceId: chatMessage.workspaceId,
          projectId: chatMessage.projectId,
          agentId: chatMessage.agentId,
          userId: chatMessage.userId,
          senderType: chatMessage.senderType,
          agentType: chatMessage.agentType,
          text: chatMessage.text,
          isStatusUpdate: chatMessage.isStatusUpdate,
          metadata: chatMessage.metadata,
          status: chatMessage.status,
          createdAt: chatMessage.createdAt.toISOString(),
        },
      };

      await this.redisService.publish('chat-events', JSON.stringify(event));
    } catch (error) {
      this.logger.error(`Failed to publish chat message: ${error}`);
    }
  }

  /**
   * Sanitizes status message to prevent prompt injection
   * Based on learnings from Story 9.2 code review
   */
  private sanitizeMessage(message: string): string {
    if (!message) return '';

    // Limit length
    const maxLength = 500;
    let sanitized = message.slice(0, maxLength);

    // Remove control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

    // Escape potential injection patterns
    sanitized = sanitized.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');

    return sanitized.trim();
  }

  /**
   * Sanitizes metadata to prevent excessively large objects
   * Returns null if metadata is invalid or too large
   */
  private sanitizeMetadata(metadata: Record<string, any> | null | undefined): Record<string, any> | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    // Limit size by stringifying and checking length
    const MAX_METADATA_SIZE = 10000; // 10KB limit
    try {
      const stringified = JSON.stringify(metadata);
      if (stringified.length > MAX_METADATA_SIZE) {
        this.logger.warn(`Metadata too large (${stringified.length} bytes), truncating`);
        // Return a reduced version with just keys
        return { _truncated: true, keys: Object.keys(metadata).slice(0, 20) };
      }
      return metadata;
    } catch {
      this.logger.warn('Invalid metadata object, cannot serialize');
      return null;
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  onModuleDestroy(): void {
    // Clear all pending debounce timeouts
    for (const timeout of this.statusDebounceMap.values()) {
      clearTimeout(timeout);
    }
    this.statusDebounceMap.clear();
  }
}
