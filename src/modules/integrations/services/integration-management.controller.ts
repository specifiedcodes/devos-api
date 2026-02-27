/**
 * IntegrationManagementController
 * Story 21-7: Integration Management UI (AC2)
 *
 * Exposes unified integration management endpoints for the frontend.
 * Mounted under /api/v1/workspaces/:workspaceId/integrations/management
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import {
  IntegrationManagementService,
  IntegrationType,
  UnifiedIntegrationStatus,
} from './integration-management.service';
import { GetIntegrationStatusesDto } from '../dto/get-integration-statuses.dto';
import { GetRecentActivityDto } from '../dto/get-recent-activity.dto';

@ApiTags('Integrations')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/integrations')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class IntegrationManagementController {
  constructor(
    private readonly integrationManagementService: IntegrationManagementService,
  ) {}

  /**
   * GET /api/v1/workspaces/:workspaceId/integrations/management/all
   * Get all integration statuses with optional category filter.
   */
  @Get('management/all')
  async getAllStatuses(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: GetIntegrationStatusesDto,
  ): Promise<UnifiedIntegrationStatus[]> {
    return this.integrationManagementService.getAllIntegrationStatuses(
      workspaceId,
      query.category,
    );
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/integrations/management/summary
   * Get summary counts of integration statuses.
   */
  @Get('management/summary')
  async getSummary(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{ total: number; connected: number; errored: number; disconnected: number }> {
    return this.integrationManagementService.getIntegrationSummary(workspaceId);
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/integrations/management/activity
   * Get recent integration activity.
   * IMPORTANT: This route MUST be before management/:type to avoid 'activity' being treated as type.
   */
  @Get('management/activity')
  async getRecentActivity(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: GetRecentActivityDto,
  ): Promise<Array<{ type: string; event: string; timestamp: string; details?: string }>> {
    return this.integrationManagementService.getRecentActivity(
      workspaceId,
      query.limit,
    );
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/integrations/management/:type
   * Get detailed status for a single integration.
   */
  @Get('management/:type')
  async getStatus(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('type') type: string,
  ): Promise<UnifiedIntegrationStatus> {
    const validTypes = Object.values(IntegrationType) as string[];
    if (!validTypes.includes(type)) {
      throw new BadRequestException(`Invalid integration type: ${type}. Valid types: ${validTypes.join(', ')}`);
    }
    return this.integrationManagementService.getIntegrationStatus(
      workspaceId,
      type as IntegrationType,
    );
  }
}
