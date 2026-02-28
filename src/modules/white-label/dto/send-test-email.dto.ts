/**
 * Send Test Email DTO
 * Story 22-2: White-Label Email Templates (AC2)
 *
 * Validates test email sending requests.
 */

import { IsEmail, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WhiteLabelEmailTemplateType } from '../../../database/entities/white-label-email-template.entity';

export class SendTestEmailDto {
  @IsEmail()
  @MaxLength(255)
  @ApiProperty({ description: 'Recipient email address for test email' })
  email!: string;

  @IsEnum(WhiteLabelEmailTemplateType)
  @ApiProperty({ enum: WhiteLabelEmailTemplateType, description: 'Template type to test' })
  templateType!: WhiteLabelEmailTemplateType;
}
