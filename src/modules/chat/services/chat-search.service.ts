import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../../../database/entities/chat-message.entity';

/**
 * Parameters for searching messages
 */
export interface SearchMessagesParams {
  workspaceId: string;
  query: string;
  agentId?: string;
  dateFrom?: string; // ISO date
  dateTo?: string;   // ISO date
  conversationId?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Result from searching messages
 */
export interface SearchMessagesResult {
  messages: ChatMessage[];
  totalCount: number;
  highlights?: Record<string, string[]>;
}

/**
 * ChatSearchService
 * Story 9.5: Conversation History Storage
 *
 * Provides full-text search functionality using PostgreSQL ts_vector/ts_query.
 */
@Injectable()
export class ChatSearchService {
  private readonly logger = new Logger(ChatSearchService.name);

  /** Default limit for search results */
  private static readonly DEFAULT_LIMIT = 20;

  /** Maximum limit for search results */
  private static readonly MAX_LIMIT = 100;

  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
  ) {}

  /**
   * Search messages using full-text search
   */
  async searchMessages(params: SearchMessagesParams): Promise<SearchMessagesResult> {
    const {
      workspaceId,
      query,
      agentId,
      dateFrom,
      dateTo,
      conversationId,
      includeArchived = false,
      limit = ChatSearchService.DEFAULT_LIMIT,
      offset = 0,
    } = params;

    // Validate query
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      throw new BadRequestException('Search query cannot be empty');
    }

    // Sanitize query to prevent SQL injection
    const sanitizedQuery = this.sanitizeSearchQuery(trimmedQuery);

    // Ensure limit is within bounds
    const safeLimit = Math.min(Math.max(1, limit), ChatSearchService.MAX_LIMIT);

    // Build the main search query using ts_vector
    const queryBuilder = this.chatMessageRepository
      .createQueryBuilder('msg')
      .select([
        'msg.id',
        'msg.workspaceId',
        'msg.projectId',
        'msg.agentId',
        'msg.userId',
        'msg.senderType',
        'msg.agentType',
        'msg.text',
        'msg.isStatusUpdate',
        'msg.metadata',
        'msg.status',
        'msg.deliveredAt',
        'msg.readAt',
        'msg.conversationId',
        'msg.isArchived',
        'msg.archivedAt',
        'msg.createdAt',
        'msg.updatedAt',
      ])
      .addSelect(
        `ts_rank(msg.search_vector, plainto_tsquery('english', :query))`,
        'rank'
      )
      .addSelect(
        `ts_headline('english', msg.text, plainto_tsquery('english', :query), 'MaxWords=30, MinWords=10, StartSel=<b>, StopSel=</b>')`,
        'headline'
      )
      .where('msg.workspaceId = :workspaceId', { workspaceId })
      .andWhere(`msg.search_vector @@ plainto_tsquery('english', :query)`, {
        query: sanitizedQuery,
      });

    // Apply filters
    if (agentId) {
      queryBuilder.andWhere('msg.agentId = :agentId', { agentId });
    }

    if (conversationId) {
      queryBuilder.andWhere('msg.conversationId = :conversationId', { conversationId });
    }

    // MEDIUM-3 FIX: Use UTC timestamps for consistent date boundary handling
    if (dateFrom) {
      // Parse as UTC start of day to avoid timezone issues
      const fromDate = new Date(`${dateFrom}T00:00:00.000Z`);
      queryBuilder.andWhere('msg.createdAt >= :dateFrom', { dateFrom: fromDate });
    }

    if (dateTo) {
      // Parse as UTC end of day to avoid timezone issues
      const toDate = new Date(`${dateTo}T23:59:59.999Z`);
      queryBuilder.andWhere('msg.createdAt <= :dateTo', { dateTo: toDate });
    }

    if (!includeArchived) {
      queryBuilder.andWhere('msg.isArchived = :isArchived', { isArchived: false });
    }

    // Order by relevance (rank) and then by date
    queryBuilder
      .orderBy('rank', 'DESC')
      .addOrderBy('msg.createdAt', 'DESC')
      .take(safeLimit)
      .skip(offset);

    // Set query parameter
    queryBuilder.setParameter('query', sanitizedQuery);

    // Execute query and get raw results to include rank and headline
    const rawResults = await queryBuilder.getRawMany();

    // Build count query for total count
    const countQueryBuilder = this.chatMessageRepository
      .createQueryBuilder('msg')
      .where('msg.workspaceId = :workspaceId', { workspaceId })
      .andWhere(`msg.search_vector @@ plainto_tsquery('english', :query)`, {
        query: sanitizedQuery,
      });

    // Apply same filters for count
    if (agentId) {
      countQueryBuilder.andWhere('msg.agentId = :agentId', { agentId });
    }
    if (conversationId) {
      countQueryBuilder.andWhere('msg.conversationId = :conversationId', { conversationId });
    }
    // MEDIUM-3 FIX: Use UTC timestamps for consistent date boundary handling
    if (dateFrom) {
      const fromDate = new Date(`${dateFrom}T00:00:00.000Z`);
      countQueryBuilder.andWhere('msg.createdAt >= :dateFrom', { dateFrom: fromDate });
    }
    if (dateTo) {
      const toDate = new Date(`${dateTo}T23:59:59.999Z`);
      countQueryBuilder.andWhere('msg.createdAt <= :dateTo', { dateTo: toDate });
    }
    if (!includeArchived) {
      countQueryBuilder.andWhere('msg.isArchived = :isArchived', { isArchived: false });
    }

    const totalCount = await countQueryBuilder.getCount();

    // Transform raw results to ChatMessage objects and extract highlights
    const messages: ChatMessage[] = [];
    const highlights: Record<string, string[]> = {};

    for (const raw of rawResults) {
      // Map raw result to ChatMessage
      const message = this.mapRawToMessage(raw);
      messages.push(message);

      // Extract headline as highlight
      if (raw.headline) {
        highlights[message.id] = [raw.headline];
      }
    }

    this.logger.log(
      `Search for "${trimmedQuery}" in workspace ${workspaceId} returned ${messages.length} results (total: ${totalCount})`,
    );

    return {
      messages,
      totalCount,
      highlights: Object.keys(highlights).length > 0 ? highlights : undefined,
    };
  }

  /**
   * Sanitize search query to prevent SQL injection
   * Removes special characters that could break the ts_query
   * HIGH-2 FIX: Enhanced sanitization for edge cases
   */
  private sanitizeSearchQuery(query: string): string {
    // Normalize unicode to prevent bypass attacks
    const normalized = query.normalize('NFKC');

    // Remove control characters and null bytes
    const noControlChars = normalized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

    // Remove characters that could cause issues with tsquery
    return noControlChars
      .replace(/['"\\`]/g, '') // Remove quotes, backslashes, backticks
      .replace(/[&|!():*<>]/g, ' ') // Replace special tsquery/SQL operators with spaces
      .replace(/--/g, ' ') // Remove SQL comment syntax
      .replace(/\/\*/g, ' ') // Remove block comment start
      .replace(/\*\//g, ' ') // Remove block comment end
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 200); // Limit query length to prevent abuse
  }

  /**
   * Map raw database result to ChatMessage entity
   */
  private mapRawToMessage(raw: Record<string, any>): ChatMessage {
    const message = new ChatMessage();
    message.id = raw.msg_id;
    message.workspaceId = raw.msg_workspaceId;
    message.projectId = raw.msg_projectId;
    message.agentId = raw.msg_agentId;
    message.userId = raw.msg_userId;
    message.senderType = raw.msg_senderType;
    message.agentType = raw.msg_agentType;
    message.text = raw.msg_text;
    message.isStatusUpdate = raw.msg_isStatusUpdate;
    message.metadata = raw.msg_metadata;
    message.status = raw.msg_status;
    message.deliveredAt = raw.msg_deliveredAt;
    message.readAt = raw.msg_readAt;
    message.conversationId = raw.msg_conversationId;
    message.isArchived = raw.msg_isArchived;
    message.archivedAt = raw.msg_archivedAt;
    message.createdAt = raw.msg_createdAt;
    message.updatedAt = raw.msg_updatedAt;
    return message;
  }
}
