import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  BadRequestException,
  Header,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UsageTrackingService } from '../services/usage-tracking.service';

@Controller('api/v1/workspaces/:workspaceId/usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private readonly usageTrackingService: UsageTrackingService) {}

  /**
   * Get usage summary for a workspace
   * Query params: startDate, endDate (ISO format)
   */
  @Get()
  async getUsage(
    @Param('workspaceId') workspaceId: string,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
  ) {
    // Default to last 30 days if not provided
    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    if (startDate > endDate) {
      throw new BadRequestException('Start date must be before end date');
    }

    return this.usageTrackingService.getWorkspaceUsage(
      workspaceId,
      startDate,
      endDate,
    );
  }

  /**
   * Export usage data as CSV
   */
  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="usage-export.csv"')
  async exportUsage(
    @Param('workspaceId') workspaceId: string,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
  ) {
    // Default to last 30 days if not provided
    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    return this.usageTrackingService.exportUsage(
      workspaceId,
      startDate,
      endDate,
    );
  }
}
