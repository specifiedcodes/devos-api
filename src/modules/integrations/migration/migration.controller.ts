import {
  Controller,
  Get,
  Param,
  UseGuards,
  Logger,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MigrationService, DeploymentMigrationStatus } from './migration.service';

/**
 * MigrationController
 * Story 28.2: Supabase Deployment Deprecation
 *
 * Provides migration guidance endpoint for workspaces transitioning
 * from Vercel/Supabase to Railway-only deployment.
 */
@ApiTags('Migration')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/migration')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class MigrationController {
  private readonly logger = new Logger(MigrationController.name);

  constructor(private readonly migrationService: MigrationService) {}

  /**
   * Get deployment migration status for a workspace.
   * Returns which platforms are connected and recommended migration steps.
   *
   * GET /api/v1/workspaces/:workspaceId/migration/deployment-status
   */
  @Get('deployment-status')
  async getDeploymentStatus(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<DeploymentMigrationStatus> {
    this.logger.log(
      `Getting deployment migration status for workspace ${workspaceId.substring(0, 8)}...`,
    );
    return this.migrationService.getDeploymentMigrationStatus(workspaceId);
  }
}
