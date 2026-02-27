/**
 * IntegrationManagementController
 * Story 21-7: Integration Management UI (AC2)
 * Story 21-9: Integration Health Monitoring (AC3)
 *
 * Exposes unified integration management endpoints for the frontend.
 * Mounted under /api/v1/workspaces/:workspaceId/integrations
 */

import {
  Controller,
  Get,
  Post,
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
import { IntegrationHealthService } from './integration-health.service';
import { GetIntegrationStatusesDto } from '../dto/get-integration-statuses.dto';
import { GetRecentActivityDto } from '../dto/get-recent-activity.dto';
import { GetHealthHistoryDto, HealthSummaryResponse, HealthHistoryEntry } from '../dto/integration-health.dto';
import { IntegrationHealthCheck, IntegrationHealthType } from '../../../database/entities/integration-health-check.entity';

@ApiTags('Integrations')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/integrations')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class IntegrationManagementController {
  constructor(
    private readonly integrationManagementService: IntegrationManagementService,
    private readonly integrationHealthService: IntegrationHealthService,
  ) {}

  // ==================== Management Endpoints (Story 21-7) ====================

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

  // ==================== Health Endpoints (Story 21-9) ====================

  /**
   * GET /api/v1/workspaces/:workspaceId/integrations/health
   * Get health status of all integrations.
   */
  @Get('health')
  async getAllHealth(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<IntegrationHealthCheck[]> {
    return this.integrationHealthService.getAllHealth(workspaceId);
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/integrations/health/summary
   * Get overall health summary.
   * IMPORTANT: This route MUST be before health/:type to avoid 'summary' being treated as type.
   */
  @Get('health/summary')
  async getHealthSummary(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<HealthSummaryResponse> {
    return this.integrationHealthService.getHealthSummary(workspaceId);
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/integrations/health/:type
   * Get health for a specific integration.
   */
  @Get('health/:type')
  async getHealthByType(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('type') type: string,
  ): Promise<IntegrationHealthCheck> {
    this.validateHealthType(type);
    const result = await this.integrationHealthService.getHealth(
      workspaceId,
      type as IntegrationHealthType,
    );
    if (!result) {
      throw new BadRequestException(`No health data found for integration type: ${type}`);
    }
    return result;
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/integrations/health/:type/history
   * Get health check history for a specific integration.
   */
  @Get('health/:type/history')
  async getHealthHistory(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('type') type: string,
    @Query() query: GetHealthHistoryDto,
  ): Promise<HealthHistoryEntry[]> {
    this.validateHealthType(type);
    return this.integrationHealthService.getHealthHistory(
      workspaceId,
      type as IntegrationHealthType,
      query.limit,
    );
  }

  /**
   * POST /api/v1/workspaces/:workspaceId/integrations/health/:type/check
   * Force a health check for a specific integration.
   */
  @Post('health/:type/check')
  async forceHealthCheck(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('type') type: string,
  ): Promise<IntegrationHealthCheck> {
    this.validateHealthType(type);
    return this.integrationHealthService.forceHealthCheck(
      workspaceId,
      type as IntegrationHealthType,
    );
  }

  /**
   * POST /api/v1/workspaces/:workspaceId/integrations/health/:type/retry-failed
   * Retry all failed sync items for an integration.
   */
  @Post('health/:type/retry-failed')
  async retryFailed(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('type') type: string,
  ): Promise<{ retriedCount: number }> {
    this.validateHealthType(type);
    return this.integrationHealthService.retryFailed(
      workspaceId,
      type as IntegrationHealthType,
    );
  }

  // ==================== Private Validation ====================

  private validateHealthType(type: string): void {
    const validTypes = Object.values(IntegrationHealthType) as string[];
    if (!validTypes.includes(type)) {
      throw new BadRequestException(
        `Invalid integration health type: ${type}. Valid types: ${validTypes.join(', ')}`,
      );
    }
  }
}
