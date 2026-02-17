import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditExportService } from './sso-audit-export.service';
import { SsoAuditAlertService } from './sso-audit-alert.service';
import { SsoAuditWebhookService } from './sso-audit-webhook.service';
import {
  ListAuditEventsQueryDto,
  ExportAuditEventsQueryDto,
  ComplianceReportQueryDto,
  CreateAlertRuleDto,
  UpdateAlertRuleDto,
  CreateWebhookDto,
  UpdateWebhookDto,
  PaginatedAuditEventsResponseDto,
  AlertRuleResponseDto,
  WebhookResponseDto,
  ComplianceReportResponseDto,
} from '../dto/audit.dto';

@ApiTags('SSO - Audit')
@Controller()
export class SsoAuditController {
  private readonly logger = new Logger(SsoAuditController.name);

  constructor(
    private readonly ssoAuditService: SsoAuditService,
    private readonly exportService: SsoAuditExportService,
    private readonly alertService: SsoAuditAlertService,
    private readonly webhookService: SsoAuditWebhookService,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
  ) {}

  private async verifyWorkspaceAdmin(workspaceId: string, userId: string): Promise<void> {
    const member = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId },
    });

    if (!member || (member.role !== WorkspaceRole.ADMIN && member.role !== WorkspaceRole.OWNER)) {
      throw new ForbiddenException('Only workspace admins and owners can manage SSO audit');
    }
  }

  // ==================== Events ====================

  /**
   * GET /api/workspaces/:workspaceId/sso/audit/events
   */
  @Get('api/workspaces/:workspaceId/sso/audit/events')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List SSO audit events with filters and pagination' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Audit events retrieved', type: PaginatedAuditEventsResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async listEvents(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: ListAuditEventsQueryDto,
    @Req() req: Request,
  ): Promise<PaginatedAuditEventsResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const result = await this.ssoAuditService.listEvents(workspaceId, {
      eventType: query.eventType as any,
      actorId: query.actorId,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      page: query.page,
      limit: query.limit,
    });

    return {
      events: result.events.map(e => ({
        id: e.id,
        eventType: e.eventType,
        workspaceId: e.workspaceId,
        actorId: e.actorId,
        targetUserId: e.targetUserId,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        details: e.details,
        createdAt: e.createdAt?.toISOString(),
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * GET /api/workspaces/:workspaceId/sso/audit/events/export
   */
  @Get('api/workspaces/:workspaceId/sso/audit/events/export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Export SSO audit events as CSV or JSON' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Audit events exported' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async exportEvents(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: ExportAuditEventsQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const result = await this.exportService.exportEvents(
      {
        workspaceId,
        eventType: query.eventType,
        actorId: query.actorId,
        targetUserId: query.targetUserId,
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      },
      query.format,
    );

    const contentType = query.format === 'csv' ? 'text/csv' : 'application/json';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.status(200).send(result.data);
  }

  // ==================== Compliance Report ====================

  /**
   * GET /api/workspaces/:workspaceId/sso/audit/compliance-report
   */
  @Get('api/workspaces/:workspaceId/sso/audit/compliance-report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Generate SSO compliance report' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Compliance report generated', type: ComplianceReportResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async getComplianceReport(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: ComplianceReportQueryDto,
    @Req() req: Request,
  ): Promise<ComplianceReportResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    return this.exportService.generateComplianceReport(workspaceId, dateFrom, dateTo);
  }

  // ==================== Alert Rules ====================

  /**
   * GET /api/workspaces/:workspaceId/sso/audit/alert-rules
   */
  @Get('api/workspaces/:workspaceId/sso/audit/alert-rules')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List SSO audit alert rules' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Alert rules retrieved', type: [AlertRuleResponseDto] })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async listAlertRules(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: Request,
  ): Promise<AlertRuleResponseDto[]> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const rules = await this.alertService.listAlertRules(workspaceId);
    return rules.map(r => this.toAlertRuleResponse(r));
  }

  /**
   * POST /api/workspaces/:workspaceId/sso/audit/alert-rules
   */
  @Post('api/workspaces/:workspaceId/sso/audit/alert-rules')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create SSO audit alert rule' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Alert rule created', type: AlertRuleResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error or max rules reached' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async createAlertRule(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateAlertRuleDto,
    @Req() req: Request,
  ): Promise<AlertRuleResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const rule = await this.alertService.createAlertRule({
      workspaceId,
      name: dto.name,
      description: dto.description,
      eventTypes: dto.eventTypes,
      threshold: dto.threshold || 1,
      windowMinutes: dto.windowMinutes || 5,
      notificationChannels: dto.notificationChannels,
      cooldownMinutes: dto.cooldownMinutes,
      actorId: userId,
    });

    return this.toAlertRuleResponse(rule);
  }

  /**
   * GET /api/workspaces/:workspaceId/sso/audit/alert-rules/:ruleId
   */
  @Get('api/workspaces/:workspaceId/sso/audit/alert-rules/:ruleId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get SSO audit alert rule' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'ruleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Alert rule retrieved', type: AlertRuleResponseDto })
  @ApiResponse({ status: 404, description: 'Alert rule not found' })
  async getAlertRule(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Req() req: Request,
  ): Promise<AlertRuleResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const rule = await this.alertService.getAlertRule(ruleId, workspaceId);
    return this.toAlertRuleResponse(rule);
  }

  /**
   * PUT /api/workspaces/:workspaceId/sso/audit/alert-rules/:ruleId
   */
  @Put('api/workspaces/:workspaceId/sso/audit/alert-rules/:ruleId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update SSO audit alert rule' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'ruleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Alert rule updated', type: AlertRuleResponseDto })
  @ApiResponse({ status: 404, description: 'Alert rule not found' })
  async updateAlertRule(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateAlertRuleDto,
    @Req() req: Request,
  ): Promise<AlertRuleResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const rule = await this.alertService.updateAlertRule({
      ruleId,
      workspaceId,
      ...dto,
      actorId: userId,
    });

    return this.toAlertRuleResponse(rule);
  }

  /**
   * DELETE /api/workspaces/:workspaceId/sso/audit/alert-rules/:ruleId
   */
  @Delete('api/workspaces/:workspaceId/sso/audit/alert-rules/:ruleId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete SSO audit alert rule' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'ruleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Alert rule deleted' })
  @ApiResponse({ status: 404, description: 'Alert rule not found' })
  async deleteAlertRule(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Req() req: Request,
  ): Promise<void> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    await this.alertService.deleteAlertRule(ruleId, workspaceId, userId);
  }

  // ==================== Webhooks ====================

  /**
   * GET /api/workspaces/:workspaceId/sso/audit/webhooks
   */
  @Get('api/workspaces/:workspaceId/sso/audit/webhooks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List SSO audit webhooks' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Webhooks retrieved', type: [WebhookResponseDto] })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async listWebhooks(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: Request,
  ): Promise<WebhookResponseDto[]> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const webhooks = await this.webhookService.listWebhooks(workspaceId);
    return webhooks.map(w => this.toWebhookResponse(w));
  }

  /**
   * POST /api/workspaces/:workspaceId/sso/audit/webhooks
   */
  @Post('api/workspaces/:workspaceId/sso/audit/webhooks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create SSO audit webhook' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Webhook created', type: WebhookResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async createWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateWebhookDto,
    @Req() req: Request,
  ): Promise<WebhookResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const webhook = await this.webhookService.createWebhook({
      workspaceId,
      name: dto.name,
      url: dto.url,
      secret: dto.secret,
      eventTypes: dto.eventTypes,
      headers: dto.headers,
      retryCount: dto.retryCount,
      timeoutMs: dto.timeoutMs,
      actorId: userId,
    });

    return this.toWebhookResponse(webhook);
  }

  /**
   * GET /api/workspaces/:workspaceId/sso/audit/webhooks/:webhookId
   */
  @Get('api/workspaces/:workspaceId/sso/audit/webhooks/:webhookId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get SSO audit webhook' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'webhookId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Webhook retrieved', type: WebhookResponseDto })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async getWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Req() req: Request,
  ): Promise<WebhookResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const webhook = await this.webhookService.getWebhook(webhookId, workspaceId);
    return this.toWebhookResponse(webhook);
  }

  /**
   * PUT /api/workspaces/:workspaceId/sso/audit/webhooks/:webhookId
   */
  @Put('api/workspaces/:workspaceId/sso/audit/webhooks/:webhookId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update SSO audit webhook' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'webhookId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Webhook updated', type: WebhookResponseDto })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async updateWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Body() dto: UpdateWebhookDto,
    @Req() req: Request,
  ): Promise<WebhookResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const webhook = await this.webhookService.updateWebhook({
      webhookId,
      workspaceId,
      ...dto,
      actorId: userId,
    });

    return this.toWebhookResponse(webhook);
  }

  /**
   * DELETE /api/workspaces/:workspaceId/sso/audit/webhooks/:webhookId
   */
  @Delete('api/workspaces/:workspaceId/sso/audit/webhooks/:webhookId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete SSO audit webhook' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'webhookId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Webhook deleted' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async deleteWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Req() req: Request,
  ): Promise<void> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    await this.webhookService.deleteWebhook(webhookId, workspaceId);
  }

  /**
   * POST /api/workspaces/:workspaceId/sso/audit/webhooks/:webhookId/test
   */
  @Post('api/workspaces/:workspaceId/sso/audit/webhooks/:webhookId/test')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test SSO audit webhook delivery' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'webhookId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Test result returned' })
  async testWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Req() req: Request,
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    return this.webhookService.testWebhook(webhookId, workspaceId);
  }

  /**
   * GET /api/workspaces/:workspaceId/sso/audit/webhooks/:webhookId/deliveries
   */
  @Get('api/workspaces/:workspaceId/sso/audit/webhooks/:webhookId/deliveries')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List SSO audit webhook deliveries' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'webhookId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Webhook deliveries retrieved' })
  async listDeliveries(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<{ deliveries: any[]; total: number }> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const result = await this.webhookService.listDeliveries(
      webhookId,
      workspaceId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );

    return {
      deliveries: result.deliveries.map(d => ({
        id: d.id,
        webhookId: d.webhookId,
        eventId: d.eventId,
        status: d.status,
        statusCode: d.statusCode,
        errorMessage: d.errorMessage,
        attemptNumber: d.attemptNumber,
        deliveredAt: d.deliveredAt?.toISOString() || null,
        createdAt: d.createdAt?.toISOString(),
      })),
      total: result.total,
    };
  }

  // ==================== Helpers ====================

  private toAlertRuleResponse(rule: any): AlertRuleResponseDto {
    return {
      id: rule.id,
      workspaceId: rule.workspaceId,
      name: rule.name,
      description: rule.description,
      eventTypes: rule.eventTypes,
      threshold: rule.threshold,
      windowMinutes: rule.windowMinutes,
      notificationChannels: rule.notificationChannels,
      isActive: rule.isActive,
      cooldownMinutes: rule.cooldownMinutes,
      lastTriggeredAt: rule.lastTriggeredAt?.toISOString() || null,
      triggerCount: rule.triggerCount,
      createdAt: rule.createdAt?.toISOString(),
    };
  }

  private toWebhookResponse(webhook: any): WebhookResponseDto & { secret: string | null } {
    return {
      id: webhook.id,
      workspaceId: webhook.workspaceId,
      name: webhook.name,
      url: webhook.url,
      secret: webhook.secret ? '********' : null,
      eventTypes: webhook.eventTypes,
      headers: webhook.headers,
      isActive: webhook.isActive,
      retryCount: webhook.retryCount,
      timeoutMs: webhook.timeoutMs,
      lastDeliveryAt: webhook.lastDeliveryAt?.toISOString() || null,
      lastDeliveryStatus: webhook.lastDeliveryStatus,
      consecutiveFailures: webhook.consecutiveFailures,
      createdAt: webhook.createdAt?.toISOString(),
    };
  }
}
