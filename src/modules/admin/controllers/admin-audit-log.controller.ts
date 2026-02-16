import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { PlatformAdmin } from '../decorators/platform-admin.decorator';
import { AdminAuditLogService } from '../services/admin-audit-log.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import {
  AdminAuditLogQueryDto,
  AdminAuditLogStatsDto,
  CreateSavedSearchDto,
} from '../dto/audit-log.dto';

/**
 * AdminAuditLogController
 * Story 14.10: Audit Log Viewer (AC4)
 *
 * Admin API for browsing, searching, exporting, and managing
 * saved searches for platform-wide audit logs.
 * All endpoints require @PlatformAdmin() decorator.
 *
 * NOTE: Static routes (meta/*, stats, export, saved-searches)
 * must be registered BEFORE the /:id route to prevent NestJS
 * from treating path segments as log IDs.
 */
@Controller('api/admin/audit-logs')
export class AdminAuditLogController {
  private readonly logger = new Logger(AdminAuditLogController.name);

  constructor(
    private readonly adminAuditLogService: AdminAuditLogService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /api/admin/audit-logs/meta/actions
   * Returns list of distinct action types for filter dropdowns.
   */
  @Get('meta/actions')
  @PlatformAdmin()
  async getActionTypes() {
    return this.adminAuditLogService.getActionTypes();
  }

  /**
   * GET /api/admin/audit-logs/meta/resource-types
   * Returns list of distinct resource types for filter dropdowns.
   */
  @Get('meta/resource-types')
  @PlatformAdmin()
  async getResourceTypes() {
    return this.adminAuditLogService.getResourceTypes();
  }

  /**
   * GET /api/admin/audit-logs/stats
   * Returns aggregate statistics for the given time range.
   */
  @Get('stats')
  @PlatformAdmin()
  async getStats(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AdminAuditLogStatsDto,
  ) {
    return this.adminAuditLogService.getAuditStats(query);
  }

  /**
   * GET /api/admin/audit-logs/export
   * Export audit logs as CSV or JSON file download.
   */
  @Get('export')
  @PlatformAdmin()
  async exportLogs(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AdminAuditLogQueryDto,
    @Query('format') format: string = 'csv',
    @Request() req: any,
    @Res() res: Response,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;
    const exportFormat = format === 'json' ? 'json' : 'csv';

    const data = await this.adminAuditLogService.exportLogs(query, exportFormat);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `audit-logs-${timestamp}.${exportFormat}`;
    const contentType =
      exportFormat === 'json' ? 'application/json' : 'text/csv';

    // Fire-and-forget audit logging
    this.logAudit(
      adminId,
      AuditAction.ADMIN_AUDIT_LOG_EXPORTED,
      'audit_log',
      'export',
      { format: exportFormat, filters: query },
      req,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(data);
  }

  /**
   * GET /api/admin/audit-logs/saved-searches
   * Returns saved searches for current admin (own + shared).
   */
  @Get('saved-searches')
  @PlatformAdmin()
  async getSavedSearches(@Request() req: any) {
    const adminId = req?.user?.userId || req?.user?.id;
    return this.adminAuditLogService.getSavedSearches(adminId);
  }

  /**
   * POST /api/admin/audit-logs/saved-searches
   * Create a new saved search.
   */
  @Post('saved-searches')
  @PlatformAdmin()
  async createSavedSearch(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CreateSavedSearchDto,
    @Request() req: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;
    const result = await this.adminAuditLogService.createSavedSearch(
      adminId,
      dto,
    );

    // Fire-and-forget audit logging
    this.logAudit(
      adminId,
      AuditAction.ADMIN_AUDIT_LOG_SEARCH_SAVED,
      'audit_saved_search',
      result.id,
      { searchName: result.name, isShared: result.isShared },
      req,
    );

    return result;
  }

  /**
   * DELETE /api/admin/audit-logs/saved-searches/:id
   * Delete a saved search (only own searches).
   */
  @Delete('saved-searches/:id')
  @PlatformAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSavedSearch(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;
    await this.adminAuditLogService.deleteSavedSearch(adminId, id);

    // Fire-and-forget audit logging
    this.logAudit(
      adminId,
      AuditAction.ADMIN_AUDIT_LOG_SEARCH_DELETED,
      'audit_saved_search',
      id,
      {},
      req,
    );
  }

  /**
   * GET /api/admin/audit-logs
   * Query audit logs with advanced filtering and pagination.
   */
  @Get()
  @PlatformAdmin()
  async queryLogs(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AdminAuditLogQueryDto,
  ) {
    const { items, total } = await this.adminAuditLogService.queryLogs(query);
    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 100);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * GET /api/admin/audit-logs/:id
   * Returns full audit log entry with all metadata.
   * NOTE: Must be registered AFTER all static routes.
   */
  @Get(':id')
  @PlatformAdmin()
  async getLogDetail(@Param('id') id: string) {
    return this.adminAuditLogService.getLogDetail(id);
  }

  /**
   * Fire-and-forget audit logging helper.
   */
  private logAudit(
    adminId: string,
    action: AuditAction,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, any>,
    req: any,
  ): void {
    this.auditService
      .log('platform', adminId, action, resourceType, resourceId, {
        ...metadata,
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
      })
      .catch((err) => {
        this.logger.warn(`Failed to log audit action ${action}: ${err?.message || err}`);
      });
  }
}
