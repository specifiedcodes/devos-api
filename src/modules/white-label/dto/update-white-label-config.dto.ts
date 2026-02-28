/**
 * Update White-Label Config DTO
 * Story 22-1: White-Label Configuration (AC2)
 *
 * Validates white-label configuration update requests.
 * All fields are optional to support partial updates.
 */

import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsHexColor,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { BackgroundMode } from '../../../database/entities/white-label-config.entity';

export class UpdateWhiteLabelConfigDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Matches(/^[^<>&"']+$/, { message: 'App name must not contain HTML special characters' })
  appName?: string;

  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
  secondaryColor?: string;

  @IsOptional()
  @IsEnum(BackgroundMode)
  backgroundMode?: BackgroundMode;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Matches(/^[a-zA-Z0-9\s,'-]+$/, { message: 'Font family contains invalid characters' })
  fontFamily?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  customCss?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
