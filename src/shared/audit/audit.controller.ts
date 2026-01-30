import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuditService, AuditAction } from './audit.service';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../common/guards/role.guard';
import { WorkspaceAccessGuard } from '../guards/workspace-access.guard';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';

@Controller('api/v1/workspaces/:workspaceId/audit-logs')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard, RoleGuard)
@RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async getAuditLogs(
    @Param('workspaceId') workspaceId: string,
    @Query('userId') userId?: string,
    @Query('userEmail') userEmail?: string,
    @Query('actions') actions?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters = {
      userId,
      userEmail,
      actions: actions ? (actions.split(',') as AuditAction[]) : undefined,
      resourceType,
      resourceId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    const result = await this.auditService.getWorkspaceLogsWithFilters(
      workspaceId,
      filters,
      parsedLimit,
      parsedOffset,
    );

    return {
      logs: result.logs,
      total: result.total,
      limit: parsedLimit,
      offset: parsedOffset,
    };
  }

  @Get('export')
  async exportAuditLogs(
    @Res() res: Response,
    @Param('workspaceId') workspaceId: string,
    @Query('userId') userId?: string,
    @Query('userEmail') userEmail?: string,
    @Query('actions') actions?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters = {
      userId,
      userEmail,
      actions: actions ? (actions.split(',') as AuditAction[]) : undefined,
      resourceType,
      resourceId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const csv = await this.auditService.exportAuditLogsToCSV(
      workspaceId,
      filters,
    );

    const filename = `audit-logs-${workspaceId}-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
