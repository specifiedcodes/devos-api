import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../../common/guards/role.guard';
import { Permission } from '../../../common/decorators/permission.decorator';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { PermissionAuditService } from '../services/permission-audit.service';
import { PermissionAuditQueryDto } from '../dto/permission-audit-query.dto';
import {
  PermissionAuditEventResponseDto,
  PermissionAuditListResponseDto,
  PermissionAuditStatsResponseDto,
} from '../dto/permission-audit-response.dto';

@ApiTags('Permission Audit')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/permissions/audit')
@UseGuards(JwtAuthGuard, RoleGuard)
export class PermissionAuditController {
  constructor(
    private readonly permissionAuditService: PermissionAuditService,
  ) {}

  @Get()
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @Permission('workspace', 'view_audit_log')
  @ApiOperation({ summary: 'List permission audit events (paginated, filtered)' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Audit events list', type: PermissionAuditListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async listEvents(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: PermissionAuditQueryDto,
  ): Promise<PermissionAuditListResponseDto> {
    const { events, total } = await this.permissionAuditService.listEvents(
      workspaceId,
      {
        eventType: query.eventType,
        eventTypes: query.eventTypes,
        actorId: query.actorId,
        targetUserId: query.targetUserId,
        targetRoleId: query.targetRoleId,
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
        search: query.search,
      },
      {
        limit: query.limit,
        offset: query.offset,
      },
    );

    return {
      events: events.map(PermissionAuditEventResponseDto.fromEntity),
      total,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
  }

  @Get('stats')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @Permission('workspace', 'view_audit_log')
  @ApiOperation({ summary: 'Get permission audit statistics' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Audit statistics', type: PermissionAuditStatsResponseDto })
  async getStats(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<PermissionAuditStatsResponseDto> {
    return this.permissionAuditService.getEventStats(
      workspaceId,
      dateFrom ? new Date(dateFrom) : undefined,
      dateTo ? new Date(dateTo) : undefined,
    );
  }

  @Get('export')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @Permission('workspace', 'view_audit_log')
  @ApiOperation({ summary: 'Export permission audit events (CSV or JSON)' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'format', enum: ['csv', 'json'], required: false })
  @ApiResponse({ status: 200, description: 'Exported audit data' })
  async exportEvents(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: PermissionAuditQueryDto,
    @Query('format') format: string = 'csv',
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const filters = {
      eventType: query.eventType,
      eventTypes: query.eventTypes,
      actorId: query.actorId,
      targetUserId: query.targetUserId,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="permission-audit-${workspaceId}-${new Date().toISOString().slice(0, 10)}.json"`,
      );
      return this.permissionAuditService.exportJSON(workspaceId, filters);
    }

    // Default: CSV
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="permission-audit-${workspaceId}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return this.permissionAuditService.exportCSV(workspaceId, filters);
  }

  @Get(':eventId')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @Permission('workspace', 'view_audit_log')
  @ApiOperation({ summary: 'Get a single permission audit event detail' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'eventId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Audit event detail', type: PermissionAuditEventResponseDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getEvent(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<PermissionAuditEventResponseDto> {
    const event = await this.permissionAuditService.getEvent(workspaceId, eventId);
    if (!event) {
      throw new NotFoundException('Permission audit event not found');
    }
    return PermissionAuditEventResponseDto.fromEntity(event);
  }
}
