import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage, ChatSenderType } from '../../../database/entities/chat-message.entity';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';

/**
 * Export format options
 */
export type ExportFormat = 'json' | 'csv' | 'txt' | 'md';

/**
 * Parameters for exporting conversations
 */
export interface ExportConversationParams {
  workspaceId: string;
  conversationId?: string;
  agentId?: string;
  dateFrom?: string; // ISO date
  dateTo?: string;   // ISO date
  format: ExportFormat;
  includeMetadata?: boolean;
  userId?: string;  // HIGH-4 FIX: Added for audit logging
}

/**
 * Result from exporting conversations
 */
export interface ExportResult {
  data: string;
  filename: string;
  mimeType: string;
  messageCount: number;
}

/**
 * ChatExportService
 * Story 9.5: Conversation History Storage
 *
 * Provides conversation export functionality in multiple formats.
 */
@Injectable()
export class ChatExportService {
  private readonly logger = new Logger(ChatExportService.name);

  /** Maximum messages to export */
  private static readonly MAX_EXPORT_MESSAGES = 10000;

  /** Valid export formats */
  private static readonly VALID_FORMATS: ExportFormat[] = ['json', 'csv', 'txt', 'md'];

  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Export conversation in the specified format
   */
  async exportConversation(params: ExportConversationParams): Promise<ExportResult> {
    const {
      workspaceId,
      conversationId,
      agentId,
      dateFrom,
      dateTo,
      format,
      includeMetadata = true,
    } = params;

    // Validate format
    if (!ChatExportService.VALID_FORMATS.includes(format)) {
      throw new BadRequestException(
        `Invalid export format: ${format}. Valid formats: ${ChatExportService.VALID_FORMATS.join(', ')}`
      );
    }

    // Build query
    const queryBuilder = this.chatMessageRepository
      .createQueryBuilder('msg')
      .where('msg.workspaceId = :workspaceId', { workspaceId })
      .andWhere('msg.isArchived = :isArchived', { isArchived: false });

    if (conversationId) {
      queryBuilder.andWhere('msg.conversationId = :conversationId', { conversationId });
    }

    if (agentId) {
      queryBuilder.andWhere('msg.agentId = :agentId', { agentId });
    }

    // MEDIUM-3 FIX: Use UTC timestamps for consistent date boundary handling
    if (dateFrom) {
      const fromDate = new Date(`${dateFrom}T00:00:00.000Z`);
      queryBuilder.andWhere('msg.createdAt >= :dateFrom', { dateFrom: fromDate });
    }

    if (dateTo) {
      const toDate = new Date(`${dateTo}T23:59:59.999Z`);
      queryBuilder.andWhere('msg.createdAt <= :dateTo', { dateTo: toDate });
    }

    queryBuilder
      .orderBy('msg.createdAt', 'ASC')
      .take(ChatExportService.MAX_EXPORT_MESSAGES);

    const messages = await queryBuilder.getMany();

    // Export based on format
    let data: string;
    let mimeType: string;
    let extension: string;

    switch (format) {
      case 'json':
        data = this.exportAsJson(messages, includeMetadata);
        mimeType = 'application/json';
        extension = 'json';
        break;
      case 'csv':
        data = this.exportAsCsv(messages);
        mimeType = 'text/csv';
        extension = 'csv';
        break;
      case 'txt':
        data = this.exportAsTxt(messages);
        mimeType = 'text/plain';
        extension = 'txt';
        break;
      case 'md':
        data = this.exportAsMarkdown(messages);
        mimeType = 'text/markdown';
        extension = 'md';
        break;
    }

    const filename = this.generateFilename(extension);

    this.logger.log(
      `Exported ${messages.length} messages from workspace ${workspaceId} as ${format}`,
    );

    // HIGH-4 FIX: Audit log export operations for security compliance
    if (params.userId) {
      await this.auditService.log(
        workspaceId,
        params.userId,
        AuditAction.CHAT_EXPORT_REQUESTED,
        'chat_messages',
        conversationId || 'bulk-export',
        {
          format,
          messageCount: messages.length,
          conversationId: conversationId || null,
          agentId: agentId || null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          includeMetadata,
        },
      );
    }

    return {
      data,
      filename,
      mimeType,
      messageCount: messages.length,
    };
  }

  /**
   * Export as JSON format
   */
  private exportAsJson(messages: ChatMessage[], includeMetadata: boolean): string {
    const exportData = {
      exportDate: new Date().toISOString(),
      messageCount: messages.length,
      messages: messages.map((m) => ({
        timestamp: m.createdAt.toISOString(),
        sender: this.formatSender(m),
        text: m.text,
        ...(includeMetadata && {
          metadata: m.metadata,
        }),
      })),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export as CSV format
   */
  private exportAsCsv(messages: ChatMessage[]): string {
    const header = 'Timestamp,Sender,Message';
    const rows = messages.map((m) => {
      const timestamp = m.createdAt.toISOString();
      const sender = this.formatSender(m);
      // Escape double quotes and wrap in quotes
      const text = `"${m.text.replace(/"/g, '""')}"`;
      return `${timestamp},${sender},${text}`;
    });

    return [header, ...rows].join('\n');
  }

  /**
   * Export as plain text format
   */
  private exportAsTxt(messages: ChatMessage[]): string {
    let txt = `Chat Export\n`;
    txt += `Exported: ${new Date().toISOString()}\n`;
    txt += `Messages: ${messages.length}\n`;
    txt += `${'='.repeat(50)}\n\n`;

    messages.forEach((m) => {
      const time = m.createdAt.toLocaleString();
      const sender = this.formatSender(m);
      txt += `[${time}] ${sender}:\n`;
      txt += `${m.text}\n\n`;
    });

    return txt;
  }

  /**
   * Export as Markdown format
   */
  private exportAsMarkdown(messages: ChatMessage[]): string {
    let md = `# Chat Export\n\n`;
    md += `*Exported: ${new Date().toISOString()}*\n\n`;
    md += `---\n\n`;

    let currentDate = '';

    messages.forEach((m) => {
      const msgDate = m.createdAt.toDateString();
      if (msgDate !== currentDate) {
        md += `## ${msgDate}\n\n`;
        currentDate = msgDate;
      }

      const sender = m.senderType === ChatSenderType.USER
        ? '**User**'
        : `**${m.agentType || 'Agent'} Agent**`;
      const time = m.createdAt.toLocaleTimeString();

      md += `${sender} (${time}):\n\n`;
      md += `${m.text}\n\n`;
      md += `---\n\n`;
    });

    return md;
  }

  /**
   * Format sender name based on message type
   */
  private formatSender(message: ChatMessage): string {
    if (message.senderType === ChatSenderType.USER) {
      return 'User';
    }
    return `${message.agentType || 'Unknown'} Agent`;
  }

  /**
   * Generate timestamped filename
   */
  private generateFilename(extension: string): string {
    const date = new Date().toISOString().split('T')[0];
    return `chat-export-${date}.${extension}`;
  }
}
