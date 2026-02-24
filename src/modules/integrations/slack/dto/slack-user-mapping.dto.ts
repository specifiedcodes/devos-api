/**
 * Slack User Mapping DTOs
 * Story 21.1: Slack OAuth Integration (AC4)
 */

import { IsUUID, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MapSlackUserDto {
  @ApiProperty({ description: 'DevOS user ID to map' })
  @IsUUID()
  devosUserId!: string;

  @ApiProperty({ description: 'Slack user ID to map' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  slackUserId!: string;
}
