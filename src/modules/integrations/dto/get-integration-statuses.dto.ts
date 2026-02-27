/**
 * GetIntegrationStatusesDto
 * Story 21-7: Integration Management UI (AC2)
 *
 * DTO for the GET /management/all endpoint query parameters.
 */

import { IsOptional, IsEnum } from 'class-validator';
import { IntegrationCategory } from '../services/integration-management.service';

export class GetIntegrationStatusesDto {
  @IsOptional()
  @IsEnum(IntegrationCategory)
  category?: IntegrationCategory;
}
