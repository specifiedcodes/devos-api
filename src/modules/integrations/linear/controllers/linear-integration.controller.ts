/**
 * LinearIntegrationController
 * Story 21.5: Linear Two-Way Sync (AC6)
 *
 * REST API controller for managing the Linear integration: OAuth flow,
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
import { LinearOAuthService } from '../services/linear-oauth.service';
import { LinearSyncService } from '../services/linear-sync.service';
import { LinearApiClientService } from '../services/linear-api-client.service';
import { LinearSyncItem, LinearSyncStatus } from '../../../../database/entities/linear-sync-item.entity';
import { LinearIntegration } from '../../../../database/entities/linear-integration.entity';
import {
  CompleteLinearSetupDto,
  UpdateLinearStatusMappingDto,
  UpdateLinearSyncDirectionDto,
  ResolveLinearConflictDto,
  LinkStoryToIssueDto,
  LinearIntegrationStatusDto,
} from '../dto/linear-integration.dto';

interface AuthenticatedRequest {
  user: { userId: string; workspaceId?: string };
}

@ApiTags('Linear Integration')
@Controller('api/integrations/linear')
export class LinearIntegrationController {
  constructor(
    private readonly oauthService: LinearOAuthService,
    private readonly syncService: LinearSyncService,
    private readonly apiClient: LinearApiClientService,
  ) {}

  /**
   * GET /api/integrations/linear/auth-url
   */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Linear OAuth URL' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async getAuthUrl(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ url: string }> {
    const result = await this.oauthService.getAuthorizationUrl(workspaceId, req.user.userId);
    return { url: result.url };
  }

  /**
   * GET /api/integrations/linear/callback
   */
  @Get('callback')
  @ApiOperation({ summary: 'Handle Linear OAuth callback' })
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const result = await this.oauthService.handleCallback(code, state);
      // Redirect to frontend with integration ID
      res.redirect(
        `/settings/integrations/linear/setup?integrationId=${result.integrationId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.redirect(
        `/settings/integrations/linear?error=${encodeURIComponent(message)}`,
      );
    }
  }

  /**
   * POST /api/integrations/linear/complete-setup
   */
  @Post('complete-setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Complete Linear integration setup' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async completeSetup(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CompleteLinearSetupDto,
  ): Promise<LinearIntegration> {
    return this.oauthService.completeSetup(workspaceId, dto.teamId, dto);
  }

  /**
   * GET /api/integrations/linear/status
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Linear integration status' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async getStatus(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<LinearIntegrationStatusDto> {
    return this.oauthService.getStatus(workspaceId);
  }

  /**
   * POST /api/integrations/linear/verify
   */
  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Verify Linear connection' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async verifyConnection(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{ valid: boolean; teamName?: string; error?: string }> {
    return this.oauthService.verifyConnection(workspaceId);
  }

  /**
   * PUT /api/integrations/linear/status-mapping
   */
  @Put('status-mapping')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update Linear status mapping' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async updateStatusMapping(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateLinearStatusMappingDto,
  ): Promise<LinearIntegration> {
    return this.oauthService.updateStatusMapping(workspaceId, dto.statusMapping);
  }

  /**
   * PUT /api/integrations/linear/sync-direction
   */
  @Put('sync-direction')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update Linear sync direction' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async updateSyncDirection(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateLinearSyncDirectionDto,
  ): Promise<LinearIntegration> {
    return this.oauthService.updateSyncDirection(workspaceId, dto.syncDirection);
  }

  /**
   * DELETE /api/integrations/linear
   */
  @Delete()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect Linear integration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async disconnect(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<void> {
    return this.oauthService.disconnect(workspaceId);
  }

  /**
   * GET /api/integrations/linear/sync-items
   */
  @Get('sync-items')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Linear sync items' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiQuery({ name: 'status', required: false, enum: LinearSyncStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSyncItems(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('status') status?: LinearSyncStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<{ items: LinearSyncItem[]; total: number }> {
    return this.syncService.getSyncItems(workspaceId, { status, page, limit });
  }

  /**
   * POST /api/integrations/linear/sync-items/:syncItemId/resolve
   */
  @Post('sync-items/:syncItemId/resolve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Resolve Linear sync conflict' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async resolveConflict(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('syncItemId', ParseUUIDPipe) syncItemId: string,
    @Body() dto: ResolveLinearConflictDto,
  ): Promise<LinearSyncItem> {
    return this.syncService.resolveConflict(workspaceId, syncItemId, dto.resolution);
  }

  /**
   * POST /api/integrations/linear/sync-items/:syncItemId/retry
   */
  @Post('sync-items/:syncItemId/retry')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retry failed Linear sync item' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async retrySyncItem(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('syncItemId', ParseUUIDPipe) syncItemId: string,
  ): Promise<LinearSyncItem> {
    return this.syncService.retrySyncItem(workspaceId, syncItemId);
  }

  /**
   * POST /api/integrations/linear/retry-all-failed
   */
  @Post('retry-all-failed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retry all failed Linear syncs' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async retryAllFailed(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{ retried: number; failed: number }> {
    return this.syncService.retryAllFailed(workspaceId);
  }

  /**
   * POST /api/integrations/linear/full-sync
   */
  @Post('full-sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Trigger full Linear sync' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async fullSync(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{ created: number; updated: number; conflicts: number; errors: number }> {
    return this.syncService.fullSync(workspaceId);
  }

  /**
   * POST /api/integrations/linear/link
   */
  @Post('link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Link DevOS story to Linear issue' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async linkStoryToIssue(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: LinkStoryToIssueDto,
  ): Promise<LinearSyncItem> {
    return this.syncService.linkStoryToIssue(workspaceId, dto.storyId, dto.linearIssueId);
  }

  /**
   * DELETE /api/integrations/linear/sync-items/:syncItemId
   */
  @Delete('sync-items/:syncItemId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink DevOS story from Linear issue' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async unlinkStoryFromIssue(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('syncItemId', ParseUUIDPipe) syncItemId: string,
  ): Promise<void> {
    return this.syncService.unlinkStoryFromIssue(workspaceId, syncItemId);
  }

  /**
   * GET /api/integrations/linear/workflow-states
   */
  @Get('workflow-states')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Linear workflow states' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async getWorkflowStates(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<Array<{ id: string; name: string; type: string; position: number }>> {
    const integration = await this.oauthService.getIntegration(workspaceId);
    if (!integration) {
      return [];
    }

    return this.apiClient.getWorkflowStates(
      integration.accessToken,
      integration.accessTokenIv,
      integration.linearTeamId,
    );
  }
}
