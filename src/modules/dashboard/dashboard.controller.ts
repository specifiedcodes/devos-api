import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from '../workspace/guards/workspace-member.guard';
import { DashboardStatsDto, ActivityFeedItemDto } from './dto/dashboard.dto';

@Controller('api/v1/workspaces/:workspaceId/dashboard')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async getDashboardStats(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string
  ): Promise<DashboardStatsDto> {
    return this.dashboardService.getDashboardStats(workspaceId);
  }

  @Get('activity-feed')
  async getActivityFeed(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ): Promise<ActivityFeedItemDto[]> {
    const parsedLimit = Math.min(Math.max(limit, 1), 100);
    return this.dashboardService.getActivityFeed(workspaceId, parsedLimit);
  }
}
