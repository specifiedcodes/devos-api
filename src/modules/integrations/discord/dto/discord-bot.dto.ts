/**
 * Discord Bot DTOs
 * Story 21.4: Discord Bot (Optional) (AC6)
 *
 * Data transfer objects for Discord bot setup, config updates,
 * and user link completion.
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetupDiscordBotDto {
  @ApiProperty({ description: 'Discord bot token (will be encrypted)' })
  @IsString()
  @IsNotEmpty()
  botToken!: string;

  @ApiProperty({ description: 'Discord application ID' })
  @IsString()
  @IsNotEmpty()
  applicationId!: string;

  @ApiProperty({ description: 'Discord guild (server) ID' })
  @IsString()
  @IsNotEmpty()
  guildId!: string;

  @ApiPropertyOptional({ description: 'Discord application public key for Ed25519 verification' })
  @IsOptional()
  @IsString()
  publicKey?: string;

  @ApiPropertyOptional({ description: 'Restrict bot commands to this channel ID' })
  @IsOptional()
  @IsString()
  commandChannelId?: string;

  @ApiPropertyOptional({ description: 'Name of the restricted command channel' })
  @IsOptional()
  @IsString()
  commandChannelName?: string;
}

export class UpdateDiscordBotConfigDto {
  @ApiPropertyOptional({ description: 'Restrict bot commands to this channel ID' })
  @IsOptional()
  @IsString()
  commandChannelId?: string;

  @ApiPropertyOptional({ description: 'Name of the restricted command channel' })
  @IsOptional()
  @IsString()
  commandChannelName?: string;

  @ApiPropertyOptional({ description: 'Map of command names to enabled state' })
  @IsOptional()
  @IsObject()
  enabledCommands?: Record<string, boolean>;

  @ApiPropertyOptional({ description: 'Whether the bot is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CompleteLinkDto {
  @ApiProperty({ description: 'One-time link token from Discord DM' })
  @IsString()
  @IsNotEmpty()
  linkToken!: string;
}
