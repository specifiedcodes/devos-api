import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  MinLength,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MentionDto } from './mention.dto';

/**
 * DTO for sending a chat message to an agent
 * Story 9.2: Send Message to Agent
 * Story 9.4: Extended with mentions array support
 */
export class SendMessageDto {
  @ApiProperty({
    description: 'UUID of the agent to send the message to',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  @IsNotEmpty()
  agentId!: string;

  @ApiPropertyOptional({
    description: 'UUID of the project context (optional)',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @ApiProperty({
    description: 'Message text content (1-2000 characters)',
    example: "How's Story 5.2 going?",
    minLength: 1,
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @ApiPropertyOptional({
    description: 'Array of @mentions in the message',
    type: [MentionDto],
    example: [
      { agentId: '550e8400-e29b-41d4-a716-446655440001', agentName: 'Dev Agent', startIndex: 0, endIndex: 10 }
    ],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MentionDto)
  mentions?: MentionDto[];
}
