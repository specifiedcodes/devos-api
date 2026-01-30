import {
  Controller,
  Get,
  Query,
  Param,
  Res,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { UsageTrackingService } from '../services/usage-tracking.service';

/**
 * Usage tracking and cost reporting controller
 */
@Controller('api/v1/workspaces/:workspaceId/usage')
@UseGuards(WorkspaceAccessGuard)
export class UsageController {
  constructor(private readonly usageTrackingService: UsageTrackingService) {}

  /**
   * Get usage summary for a workspace
   * GET /api/v1/workspaces/:workspaceId/usage
   */
  @Get()
  async getWorkspaceUsage(
    @Param('workspaceId') workspaceId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('groupBy') groupBy?: 'project' | 'agent' | 'model',
    @Req() req: any,
  ) {
    // Validate workspace access (req.user should be set by auth middleware)
    this.validateWorkspaceAccess(req, workspaceId);

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.usageTrackingService.getUsageSummary(
      workspaceId,
      start,
      end,
      groupBy,
    );
  }

  /**
   * Get usage for a specific project
   * GET /api/v1/workspaces/:workspaceId/usage/projects/:projectId
   */
  @Get('projects/:projectId')
  async getProjectUsage(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req: any,
  ) {
    this.validateWorkspaceAccess(req, workspaceId);

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.usageTrackingService.getUsageSummary(
      workspaceId,
      start,
      end,
      'project',
      projectId,
    );
  }

  /**
   * Get usage for a specific agent
   * GET /api/v1/workspaces/:workspaceId/usage/agents/:agentId
   */
  @Get('agents/:agentId')
  async getAgentUsage(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req: any,
  ) {
    this.validateWorkspaceAccess(req, workspaceId);

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.usageTrackingService.getUsageSummary(
      workspaceId,
      start,
      end,
      'agent',
      agentId,
    );
  }

  /**
   * Export usage data as CSV
   * GET /api/v1/workspaces/:workspaceId/usage/export
   */
  @Get('export')
  async exportUsageCSV(
    @Param('workspaceId') workspaceId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Res() res: Response,
    @Req() req: any,
  ) {
    this.validateWorkspaceAccess(req, workspaceId);

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const csvContent = await this.usageTrackingService.exportUsageToCSV(
      workspaceId,
      start,
      end,
    );

    const filename = `usage-${workspaceId}-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  }

  /**
   * Get daily usage trends
   * GET /api/v1/workspaces/:workspaceId/usage/trends
   */
  @Get('trends')
  async getUsageTrends(
    @Param('workspaceId') workspaceId: string,
    @Query('days') days?: string,
    @Req() req: any,
  ) {
    this.validateWorkspaceAccess(req, workspaceId);

    const numDays = days ? parseInt(days, 10) : 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);

    return this.usageTrackingService.getUsageSummary(
      workspaceId,
      startDate,
      endDate,
    );
  }

  /**
   * Validate that the authenticated user has access to the workspace
   */
  private validateWorkspaceAccess(req: any, workspaceId: string): void {
    // In a real app, this would check req.user.workspaces or req.user.workspaceId
    // For now, we'll do a simple check if the user object exists
    if (!req.user) {
      throw new ForbiddenException('Authentication required');
    }

    // Check if user's workspace matches the requested workspace
    // This assumes auth middleware sets req.user.workspaceId
    if (req.user.workspaceId && req.user.workspaceId !== workspaceId) {
      throw new ForbiddenException(
        'Access denied: You do not have permission to access this workspace',
      );
    }
  }
}
