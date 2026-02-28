/**
 * Update Email Template DTO
 * Story 22-2: White-Label Email Templates (AC2)
 *
 * Validates email template update requests.
 */

import {
  IsEnum,
  IsString,
  IsOptional,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WhiteLabelEmailTemplateType } from '../../../database/entities/white-label-email-template.entity';

export class UpdateEmailTemplateDto {
  @IsEnum(WhiteLabelEmailTemplateType)
  @ApiProperty({ enum: WhiteLabelEmailTemplateType, description: 'Email template type' })
  templateType!: WhiteLabelEmailTemplateType;

  @IsString()
  @Length(1, 255)
  @Matches(/^[^<>&"'\r\n]+$/, {
    message: 'Subject must not contain HTML special characters or line breaks',
  })
  @ApiProperty({ description: 'Email subject line', maxLength: 255 })
  subject!: string;

  @IsString()
  @Length(10, 100000)
  @ApiProperty({ description: 'Email body HTML content', minLength: 10, maxLength: 100000 })
  bodyHtml!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  @ApiProperty({ description: 'Plain text fallback (optional)', maxLength: 50000, required: false })
  bodyText?: string;
}
