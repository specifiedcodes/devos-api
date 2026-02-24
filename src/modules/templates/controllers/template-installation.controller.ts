/**
 * TemplateInstallationController
 *
 * Story 19-6: Template Installation Flow
 * Story 19-9: Template Analytics (install tracking integration)
 *
 * API endpoints for template installation management.
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { TemplateInstallationService } from '../services/template-installation.service';
import { TemplateAnalyticsService } from '../services/template-analytics.service';
import { TemplateAnalyticsEventType } from '../../../database/entities/template-analytics-event.entity';
import {
  InstallTemplateDto,
  InstallationJobDto,
  InstallationJobCreatedDto,
  InstallationListQueryDto,
  InstallationListDto,
} from '../dto/install-template.dto';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    id?: string;
    [key: string]: any;
  };
}

@ApiTags('Template Installations')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class TemplateInstallationController {
  constructor(
    private readonly installationService: TemplateInstallationService,
    private readonly analyticsService: TemplateAnalyticsService,
  ) {}

  /**
   * Extract user ID from request
   */
  private getUserId(req: RequestWithUser): string {
    return req.user.sub || req.user.id || '';
  }

  /**
   * Start a template installation.
   */
  @Post('templates/:templateId/install')
  @ApiOperation({ summary: 'Install a template into a workspace' })
  @ApiParam({ name: 'templateId', description: 'Template ID', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Installation started',
    type: InstallationJobCreatedDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request or variables' })
  @ApiResponse({ status: 403, description: 'No access to workspace' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async installTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: InstallTemplateDto,
    @Req() req: RequestWithUser,
  ): Promise<InstallationJobCreatedDto> {
    const userId = this.getUserId(req);

    // Story 19-9: Track install_started event (fire-and-forget)
    this.analyticsService.trackEvent({
      templateId,
      workspaceId: dto.workspaceId,
      userId,
      eventType: TemplateAnalyticsEventType.INSTALL_STARTED,
      metadata: { projectName: dto.projectName },
    }).catch(() => { /* fire-and-forget */ });

    const result = await this.installationService.startInstallation(
      userId,
      templateId,
      dto,
    );

    return {
      jobId: result.jobId,
      status: result.status,
      message: result.message,
      statusUrl: result.statusUrl,
    };
  }

  /**
   * Get installation status by ID.
   */
  @Get('installations/:jobId')
  @ApiOperation({ summary: 'Get installation status' })
  @ApiParam({ name: 'jobId', description: 'Installation job ID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Installation status',
    type: InstallationJobDto,
  })
  @ApiResponse({ status: 403, description: 'No access to installation' })
  @ApiResponse({ status: 404, description: 'Installation not found' })
  async getInstallationStatus(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: RequestWithUser,
  ): Promise<InstallationJobDto> {
    const userId = this.getUserId(req);
    return this.installationService.getInstallationStatus(jobId, userId);
  }

  /**
   * Cancel an in-progress installation.
   */
  @Post('installations/:jobId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an installation' })
  @ApiParam({ name: 'jobId', description: 'Installation job ID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Installation cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel installation' })
  @ApiResponse({ status: 403, description: 'No access to installation' })
  @ApiResponse({ status: 404, description: 'Installation not found' })
  async cancelInstallation(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: RequestWithUser,
  ): Promise<{ success: boolean; message: string }> {
    const userId = this.getUserId(req);
    await this.installationService.cancelInstallation(jobId, userId);
    return { success: true, message: 'Installation cancelled' };
  }

  /**
   * List installations for a workspace.
   */
  @Get('workspaces/:workspaceId/installations')
  @UseGuards(WorkspaceAccessGuard)
  @ApiOperation({ summary: 'List installations for a workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'List of installations',
    type: InstallationListDto,
  })
  @ApiResponse({ status: 403, description: 'No access to workspace' })
  async listInstallations(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: InstallationListQueryDto,
    @Req() req: RequestWithUser,
  ): Promise<InstallationListDto> {
    const userId = this.getUserId(req);
    return this.installationService.listInstallations(userId, workspaceId, query);
  }

  /**
   * Delete an installation record.
   */
  @Delete('installations/:jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an installation record' })
  @ApiParam({ name: 'jobId', description: 'Installation job ID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Installation deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete in-progress installation' })
  @ApiResponse({ status: 403, description: 'No access to installation' })
  @ApiResponse({ status: 404, description: 'Installation not found' })
  async deleteInstallation(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    const userId = this.getUserId(req);
    await this.installationService.deleteInstallation(jobId, userId);
  }
}
