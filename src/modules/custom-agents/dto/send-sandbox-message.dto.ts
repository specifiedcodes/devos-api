/**
 * Send Sandbox Message DTO
 *
 * Story 18-3: Agent Sandbox Testing
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsObject, MaxLength } from 'class-validator';

export class SendSandboxMessageDto {
  @ApiProperty({
    description: 'The message to send to the sandbox agent',
    maxLength: 10000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  message!: string;

  @ApiPropertyOptional({
    description: 'Optional input variables for the message',
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  inputs?: Record<string, unknown>;
}
