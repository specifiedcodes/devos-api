import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../common/guards/role.guard';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { VelocityMetricsService } from '../sprints/services/velocity-metrics.service';
import { VelocityQueryDto, VelocityResponseDto } from '../sprints/dto/velocity.dto';

@Controller('api/v1/workspaces/:workspaceId/projects/:projectId')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiBearerAuth('JWT-auth')
@ApiTags('Sprint Metrics')
export class SprintMetricsController {
  constructor(private readonly velocityMetricsService: VelocityMetricsService) {}

  /**
   * Get velocity data for a project across all sprints
   */
  @Get('velocity')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get velocity data across sprints' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({ name: 'date_from', required: false, description: 'Start date filter (ISO8601)' })
  @ApiQuery({ name: 'date_to', required: false, description: 'End date filter (ISO8601)' })
  @ApiQuery({ name: 'last_n', required: false, description: 'Number of recent sprints (default: 10)' })
  @ApiResponse({ status: 200, description: 'Velocity data across sprints' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getVelocityData(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: VelocityQueryDto,
  ): Promise<VelocityResponseDto> {
    return this.velocityMetricsService.getVelocityData(
      workspaceId,
      projectId,
      query.date_from,
      query.date_to,
      query.last_n,
    );
  }
}
