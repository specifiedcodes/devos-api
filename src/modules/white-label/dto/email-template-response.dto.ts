/**
 * Email Template Response DTO
 * Story 22-2: White-Label Email Templates (AC2)
 *
 * Response format for email template API endpoints.
 */

import { ApiProperty } from '@nestjs/swagger';
import {
  WhiteLabelEmailTemplate,
  WhiteLabelEmailTemplateType,
} from '../../../database/entities/white-label-email-template.entity';

export class EmailTemplateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty({ enum: WhiteLabelEmailTemplateType })
  templateType!: WhiteLabelEmailTemplateType;

  @ApiProperty()
  subject!: string;

  @ApiProperty()
  bodyHtml!: string;

  @ApiProperty({ nullable: true })
  bodyText!: string | null;

  @ApiProperty()
  isCustom!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromEntity(entity: WhiteLabelEmailTemplate): EmailTemplateResponseDto {
    const dto = new EmailTemplateResponseDto();
    dto.id = entity.id;
    dto.workspaceId = entity.workspaceId;
    dto.templateType = entity.templateType;
    dto.subject = entity.subject;
    dto.bodyHtml = entity.bodyHtml;
    dto.bodyText = entity.bodyText ?? null;
    dto.isCustom = entity.isCustom;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  static fromDefaultTemplate(
    workspaceId: string,
    templateType: WhiteLabelEmailTemplateType,
    subject: string,
    bodyHtml: string,
    bodyText: string,
  ): EmailTemplateResponseDto {
    const dto = new EmailTemplateResponseDto();
    dto.id = `default-${templateType}`;
    dto.workspaceId = workspaceId;
    dto.templateType = templateType;
    dto.subject = subject;
    dto.bodyHtml = bodyHtml;
    dto.bodyText = bodyText;
    dto.isCustom = false;
    dto.createdAt = new Date();
    dto.updatedAt = new Date();
    return dto;
  }
}
