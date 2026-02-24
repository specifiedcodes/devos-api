/**
 * JiraIntegrationController
 * Story 21.6: Jira Two-Way Sync (AC6)
 *
 * REST API controller for managing the Jira integration: OAuth flow,
 * configuration, sync operations, and health.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { JiraOAuthService } from '../services/jira-oauth.service';
import { JiraSyncService } from '../services/jira-sync.service';
import { JiraApiClientService } from '../services/jira-api-client.service';
import { JiraSyncItem, JiraSyncStatus } from '../../../../database/entities/jira-sync-item.entity';
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';
import {
  CompleteJiraSetupDto,
  UpdateJiraStatusMappingDto,
  UpdateJiraSyncDirectionDto,
  UpdateJiraIssueTypeDto,
  ResolveJiraConflictDto,
  LinkStoryToJiraIssueDto,
  JiraIntegrationStatusDto,
} from '../dto/jira-integration.dto';

interface AuthenticatedRequest {
  user: { userId: string; workspaceId?: string };
}

@ApiTags('Jira Integration')
@Controller('api/integrations/jira')
export class JiraIntegrationController {
  constructor(
    private readonly oauthService: JiraOAuthService,
    private readonly syncService: JiraSyncService,
    private readonly apiClient: JiraApiClientService,
  ) {}

  /**
   * GET /api/integrations/jira/auth-url
   */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Jira OAuth URL' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async getAuthUrl(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ url: string }> {
    const result = await this.oauthService.getAuthorizationUrl(workspaceId, req.user.userId);
    return { url: result.url };
  }

  /**
   * GET /api/integrations/jira/callback
   */
  @Get('callback')
  @ApiOperation({ summary: 'Handle Jira OAuth callback' })
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const result = await this.oauthService.handleCallback(code, state);
      res.redirect(
        `/settings/integrations/jira/setup?integrationId=${result.integrationId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.redirect(
        `/settings/integrations/jira?error=${encodeURIComponent(message)}`,
      );
    }
  }

  /**
   * POST /api/integrations/jira/complete-setup
   */
  @Post('complete-setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Complete Jira integration setup' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async completeSetup(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CompleteJiraSetupDto,
  ): Promise<JiraIntegration> {
    return this.oauthService.completeSetup(workspaceId, workspaceId, dto);
  }

  /**
   * GET /api/integrations/jira/status
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Jira integration status' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async getStatus(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<JiraIntegrationStatusDto> {
    return this.oauthService.getStatus(workspaceId);
  }

  /**
   * POST /api/integrations/jira/verify
   */
  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Verify Jira connection' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async verifyConnection(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{ valid: boolean; siteName?: string; projectName?: string; error?: string }> {
    return this.oauthService.verifyConnection(workspaceId);
  }

  /**
   * PUT /api/integrations/jira/status-mapping
   */
  @Put('status-mapping')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update Jira status mapping' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async updateStatusMapping(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateJiraStatusMappingDto,
  ): Promise<JiraIntegration> {
    return this.oauthService.updateStatusMapping(workspaceId, dto.statusMapping);
  }

  /**
   * PUT /api/integrations/jira/sync-direction
   */
  @Put('sync-direction')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update Jira sync direction' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async updateSyncDirection(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateJiraSyncDirectionDto,
  ): Promise<JiraIntegration> {
    return this.oauthService.updateSyncDirection(workspaceId, dto.syncDirection);
  }

  /**
   * PUT /api/integrations/jira/issue-type
   */
  @Put('issue-type')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update Jira issue type' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async updateIssueType(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateJiraIssueTypeDto,
  ): Promise<JiraIntegration> {
    return this.oauthService.updateIssueType(workspaceId, dto.issueType);
  }

  /**
   * DELETE /api/integrations/jira
   */
  @Delete()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect Jira integration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async disconnect(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<void> {
    return this.oauthService.disconnect(workspaceId);
  }

  /**
   * GET /api/integrations/jira/sync-items
   */
  @Get('sync-items')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Jira sync items' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiQuery({ name: 'status', required: false, enum: JiraSyncStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSyncItems(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('status') status?: JiraSyncStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<{ items: JiraSyncItem[]; total: number }> {
    return this.syncService.getSyncItems(workspaceId, { status, page, limit });
  }

  /**
   * POST /api/integrations/jira/sync-items/:syncItemId/resolve
   */
  @Post('sync-items/:syncItemId/resolve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Resolve Jira sync conflict' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async resolveConflict(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('syncItemId', ParseUUIDPipe) syncItemId: string,
    @Body() dto: ResolveJiraConflictDto,
  ): Promise<JiraSyncItem> {
    return this.syncService.resolveConflict(workspaceId, syncItemId, dto.resolution);
  }

  /**
   * POST /api/integrations/jira/sync-items/:syncItemId/retry
   */
  @Post('sync-items/:syncItemId/retry')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retry failed Jira sync item' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async retrySyncItem(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('syncItemId', ParseUUIDPipe) syncItemId: string,
  ): Promise<JiraSyncItem> {
    return this.syncService.retrySyncItem(workspaceId, syncItemId);
  }

  /**
   * POST /api/integrations/jira/retry-all-failed
   */
  @Post('retry-all-failed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retry all failed Jira syncs' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async retryAllFailed(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{ retried: number; failed: number }> {
    return this.syncService.retryAllFailed(workspaceId);
  }

  /**
   * POST /api/integrations/jira/full-sync
   */
  @Post('full-sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Trigger full Jira sync' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async fullSync(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{ created: number; updated: number; conflicts: number; errors: number }> {
    return this.syncService.fullSync(workspaceId);
  }

  /**
   * POST /api/integrations/jira/link
   */
  @Post('link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Link DevOS story to Jira issue' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async linkStoryToIssue(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: LinkStoryToJiraIssueDto,
  ): Promise<JiraSyncItem> {
    return this.syncService.linkStoryToIssue(workspaceId, dto.storyId, dto.jiraIssueKey);
  }

  /**
   * DELETE /api/integrations/jira/sync-items/:syncItemId
   */
  @Delete('sync-items/:syncItemId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink DevOS story from Jira issue' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async unlinkStoryFromIssue(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('syncItemId', ParseUUIDPipe) syncItemId: string,
  ): Promise<void> {
    return this.syncService.unlinkStoryFromIssue(workspaceId, syncItemId);
  }

  /**
   * GET /api/integrations/jira/projects
   */
  @Get('projects')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Jira projects' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async getProjects(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<Array<{ id: string; key: string; name: string; projectTypeKey: string }>> {
    const integration = await this.oauthService.getIntegration(workspaceId);
    if (!integration) {
      return [];
    }
    return this.apiClient.getProjects(integration);
  }

  /**
   * GET /api/integrations/jira/statuses
   */
  @Get('statuses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Jira project statuses' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async getProjectStatuses(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<Array<{ id: string; name: string; statusCategory: { key: string; name: string } }>> {
    const integration = await this.oauthService.getIntegration(workspaceId);
    if (!integration) {
      return [];
    }
    return this.apiClient.getProjectStatuses(integration, integration.jiraProjectKey);
  }

  /**
   * GET /api/integrations/jira/issue-types
   */
  @Get('issue-types')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Jira issue types' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async getIssueTypes(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<Array<{ id: string; name: string; subtask: boolean; description?: string }>> {
    const integration = await this.oauthService.getIntegration(workspaceId);
    if (!integration) {
      return [];
    }
    return this.apiClient.getIssueTypes(integration, integration.jiraProjectKey);
  }
}
