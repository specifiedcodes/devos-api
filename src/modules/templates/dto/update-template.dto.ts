/**
 * UpdateTemplateDto
 *
 * Story 19-1: Template Registry Backend
 *
 * DTO for updating an existing template.
 */
import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateTemplateDto } from './create-template.dto';

export class UpdateTemplateDto extends PartialType(
  OmitType(CreateTemplateDto, ['name'] as const),
) {}
