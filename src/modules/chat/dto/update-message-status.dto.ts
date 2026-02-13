import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ChatMessageStatus } from '../../../database/entities/chat-message.entity';

/**
 * DTO for updating a message's delivery status
 * Story 9.2: Send Message to Agent
 */
export class UpdateMessageStatusDto {
  @ApiProperty({
    description: 'New status for the message (delivered or read)',
    enum: ['delivered', 'read'],
    example: 'delivered',
  })
  @IsEnum(['delivered', 'read'])
  status!: 'delivered' | 'read';
}
