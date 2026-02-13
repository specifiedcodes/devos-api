import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatSenderType, ChatMessageStatus } from '../../../database/entities/chat-message.entity';
import { AgentType } from '../../../database/entities/agent.entity';

/**
 * Response DTO for a single chat message
 * Story 9.2: Send Message to Agent
 */
export class MessageResponseDto {
  @ApiProperty({
    description: 'Message UUID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  id!: string;

  @ApiProperty({
    description: 'Workspace UUID',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  workspaceId!: string;

  @ApiPropertyOptional({
    description: 'Project UUID (if message is project-scoped)',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  projectId?: string | null;

  @ApiPropertyOptional({
    description: 'Agent UUID (if message involves an agent)',
    example: '550e8400-e29b-41d4-a716-446655440004',
  })
  agentId?: string | null;

  @ApiPropertyOptional({
    description: 'User UUID (if sender is user)',
    example: '550e8400-e29b-41d4-a716-446655440005',
  })
  userId?: string | null;

  @ApiProperty({
    description: 'Type of sender',
    enum: ChatSenderType,
    example: 'user',
  })
  senderType!: ChatSenderType;

  @ApiPropertyOptional({
    description: 'Agent type (if sender is agent)',
    enum: AgentType,
    example: 'dev',
  })
  agentType?: AgentType | null;

  @ApiProperty({
    description: 'Message text content',
    example: "How's Story 5.2 going?",
  })
  text!: string;

  @ApiPropertyOptional({
    description: 'Whether this is a status update message',
    example: false,
  })
  isStatusUpdate?: boolean;

  @ApiProperty({
    description: 'Message delivery status',
    enum: ChatMessageStatus,
    example: 'sent',
  })
  status!: ChatMessageStatus;

  @ApiPropertyOptional({
    description: 'Timestamp when message was delivered',
    example: '2026-02-13T14:30:05Z',
  })
  deliveredAt?: string | null;

  @ApiPropertyOptional({
    description: 'Timestamp when message was read',
    example: '2026-02-13T14:30:10Z',
  })
  readAt?: string | null;

  @ApiProperty({
    description: 'Timestamp when message was created',
    example: '2026-02-13T14:30:00Z',
  })
  createdAt!: string;
}

/**
 * Response DTO for sending a message
 * Story 9.2: Send Message to Agent
 */
export class SendMessageResponseDto {
  @ApiProperty({
    description: 'The created message',
    type: MessageResponseDto,
  })
  message!: MessageResponseDto;

  @ApiPropertyOptional({
    description: 'Job ID for agent response processing (optional)',
    example: '550e8400-e29b-41d4-a716-446655440006',
  })
  jobId?: string;
}

/**
 * Response DTO for fetching messages with pagination
 * Story 9.2: Send Message to Agent
 * Story 9.6: Added hasPrevious and targetMessageId for navigation
 */
export class MessagesListResponseDto {
  @ApiProperty({
    description: 'Array of chat messages',
    type: [MessageResponseDto],
  })
  messages!: MessageResponseDto[];

  @ApiProperty({
    description: 'Whether there are more (older) messages to load',
    example: true,
  })
  hasMore!: boolean;

  @ApiPropertyOptional({
    description: 'Whether there are previous (newer) messages to load',
    example: false,
  })
  hasPrevious?: boolean;

  @ApiPropertyOptional({
    description: 'Cursor for loading the next page (older messages)',
    example: '550e8400-e29b-41d4-a716-446655440007',
  })
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Target message ID (when using aroundMessageId)',
    example: '550e8400-e29b-41d4-a716-446655440008',
  })
  targetMessageId?: string;
}

/**
 * Response DTO for updating message status
 * Story 9.2: Send Message to Agent
 */
export class UpdateStatusResponseDto {
  @ApiProperty({
    description: 'Message UUID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  id!: string;

  @ApiProperty({
    description: 'Updated message status',
    enum: ChatMessageStatus,
    example: 'delivered',
  })
  status!: ChatMessageStatus;

  @ApiPropertyOptional({
    description: 'Timestamp when message was delivered',
    example: '2026-02-13T14:30:05Z',
  })
  deliveredAt?: string | null;

  @ApiPropertyOptional({
    description: 'Timestamp when message was read',
    example: '2026-02-13T14:30:10Z',
  })
  readAt?: string | null;
}
