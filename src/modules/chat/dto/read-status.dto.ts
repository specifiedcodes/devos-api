import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for marking messages as read
 */
export class MarkAsReadDto {
  @ApiProperty({ description: 'Array of message IDs to mark as read' })
  @IsArray()
  @IsUUID('4', { each: true })
  messageIds!: string[];

  @ApiProperty({ description: 'Workspace ID' })
  @IsUUID()
  workspaceId!: string;

  @ApiPropertyOptional({ description: 'Source of read action' })
  @IsOptional()
  @IsString()
  source?: 'viewed' | 'notification_clicked' | 'mark_all_read';
}

/**
 * DTO for marking all messages as read
 */
export class MarkAllAsReadDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsUUID()
  workspaceId!: string;

  @ApiPropertyOptional({ description: 'Optional agent ID to filter by' })
  @IsOptional()
  @IsUUID()
  agentId?: string;
}

/**
 * Response DTO for unread count
 */
export class UnreadCountResponseDto {
  @ApiProperty({ description: 'Total unread count' })
  total!: number;

  @ApiProperty({ description: 'Unread count by agent ID' })
  byAgent!: Record<string, number>;
}

/**
 * Response DTO for marking as read
 */
export class MarkAsReadResponseDto {
  @ApiProperty({ description: 'Number of messages marked as read' })
  count!: number;

  @ApiProperty({ description: 'Message IDs that were marked as read' })
  messageIds!: string[];
}
