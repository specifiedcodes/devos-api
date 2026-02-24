/**
 * SlackNotificationController
 * Story 16.4: Slack Notification Integration (AC5)
 *
 * REST API endpoints for Slack OAuth flow, configuration, and management.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
  Logger,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SlackNotificationService } from '../services/slack-notification.service';
import { SlackOAuthService } from '../services/slack-oauth.service';
import { UpdateSlackConfigDto, SlackIntegrationStatusDto } from '../dto/slack-notification.dto';
import { SlackUserMappingService, SlackUserInfo } from '../../integrations/slack/services/slack-user-mapping.service';
import { MapSlackUserDto } from '../../integrations/slack/dto/slack-user-mapping.dto';
import { SlackUserMapping } from '../../../database/entities/slack-user-mapping.entity';

@Controller('api/integrations/slack')
@ApiTags('Integrations - Slack')
@ApiBearerAuth('JWT-auth')
export class SlackNotificationController {
  private readonly logger = new Logger(SlackNotificationController.name);

  constructor(
    private readonly slackService: SlackNotificationService,
    private readonly oauthService: SlackOAuthService,
    private readonly userMappingService: SlackUserMappingService,
  ) {}

  /**
   * GET /api/integrations/slack/connect?workspaceId=...
   * Initiates Slack OAuth flow - returns authorization URL
   */
  @Get('connect')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Slack OAuth authorization URL' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Authorization URL returned' })
  async connect(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Request() req: any,
  ): Promise<{ authUrl: string }> {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const authUrl = await this.oauthService.getAuthorizationUrl(workspaceId, userId);
    return { authUrl };
  }

  /**
   * GET /api/integrations/slack/callback?code=...&state=...
   * Handles OAuth callback from Slack
   */
  @Get('callback')
  @ApiOperation({ summary: 'Handle Slack OAuth callback' })
  @ApiResponse({ status: 200, description: 'Slack connected successfully' })
  @ApiResponse({ status: 400, description: 'Invalid state or code' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
  ): Promise<{ workspaceId: string; teamName: string; message: string }> {
    if (!code || !state) {
      throw new BadRequestException('Missing code or state parameter');
    }

    const result = await this.oauthService.handleCallback(code, state);
    return {
      ...result,
      message: 'Slack connected successfully',
    };
  }

  /**
   * GET /api/integrations/slack/status?workspaceId=...
   * Get Slack integration status for workspace
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Slack integration status' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Integration status returned' })
  async getStatus(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{
    connected: boolean;
    teamName?: string;
    defaultChannel?: string;
    status?: string;
    messageCount?: number;
    lastMessageAt?: string;
  }> {
    const integration = await this.slackService.getIntegration(workspaceId);

    if (!integration) {
      return { connected: false };
    }

    return {
      connected: true,
      teamName: integration.teamName,
      defaultChannel: integration.defaultChannelName,
      status: integration.status,
      messageCount: integration.messageCount,
      lastMessageAt: integration.lastMessageAt?.toISOString?.() || (integration.lastMessageAt as any) || undefined,
    };
  }

  /**
   * POST /api/integrations/slack/test?workspaceId=...
   * Send a test message to verify connection
   */
  @Post('test')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send test Slack notification' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Test message sent' })
  async testConnection(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return this.slackService.testConnection(workspaceId);
  }

  /**
   * GET /api/integrations/slack/channels?workspaceId=...
   * List available Slack channels for configuration
   */
  @Get('channels')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List available Slack channels' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Channels listed' })
  async listChannels(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<Array<{ id: string; name: string; isPrivate: boolean }>> {
    const integration = await this.slackService.getIntegration(workspaceId);
    if (!integration) {
      throw new NotFoundException('No Slack integration found for this workspace');
    }

    return this.slackService.listChannels(workspaceId);
  }

  /**
   * PUT /api/integrations/slack/config?workspaceId=...
   * Update event-to-channel routing configuration
   */
  @Put('config')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update Slack notification configuration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Configuration updated' })
  async updateConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() config: UpdateSlackConfigDto,
  ): Promise<SlackIntegrationStatusDto> {
    const integration = await this.slackService.getIntegration(workspaceId);
    if (!integration) {
      throw new NotFoundException('No Slack integration found for this workspace');
    }

    // Delegate config update to service (proper encapsulation + cache invalidation)
    const updated = await this.slackService.updateConfig(workspaceId, config);

    return {
      connected: true,
      teamName: updated.teamName,
      teamId: updated.teamId,
      defaultChannelId: updated.defaultChannelId,
      defaultChannelName: updated.defaultChannelName,
      status: updated.status,
      eventChannelConfig: updated.eventChannelConfig,
      quietHoursConfig: updated.quietHoursConfig,
      rateLimitPerHour: updated.rateLimitPerHour,
      mentionConfig: updated.mentionConfig,
      messageCount: updated.messageCount,
      errorCount: updated.errorCount,
      lastMessageAt: updated.lastMessageAt?.toISOString?.() || undefined,
      connectedAt: updated.connectedAt?.toISOString?.() || undefined,
    };
  }

  /**
   * DELETE /api/integrations/slack/disconnect?workspaceId=...
   * Disconnect Slack integration
   */
  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect Slack integration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 204, description: 'Slack disconnected' })
  async disconnect(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<void> {
    const integration = await this.slackService.getIntegration(workspaceId);
    if (!integration) {
      throw new NotFoundException('No Slack integration found for this workspace');
    }

    await this.slackService.disconnect(workspaceId);
  }

  // ============================================================
  // Story 21.1: Enhanced Slack OAuth Integration Endpoints
  // ============================================================

  /**
   * GET /api/integrations/slack/verify?workspaceId=...
   * Verify Slack connection health via auth.test API.
   */
  @Get('verify')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify Slack connection health' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Connection verification result' })
  async verifyConnection(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{
    ok: boolean;
    teamId?: string;
    teamName?: string;
    botUserId?: string;
    error?: string;
  }> {
    return this.oauthService.verifyConnection(workspaceId);
  }

  /**
   * GET /api/integrations/slack/refresh?workspaceId=...
   * Get URL to re-authorize Slack with updated scopes.
   */
  @Get('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Slack re-authorization URL for scope upgrade' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Re-authorization URL returned' })
  async refreshConnection(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Request() req: any,
  ): Promise<{ authUrl: string }> {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const authUrl = await this.oauthService.refreshConnection(workspaceId, userId);
    return { authUrl };
  }

  /**
   * POST /api/integrations/slack/users/auto-map?workspaceId=...
   * Auto-map Slack users to DevOS users by email.
   */
  @Post('users/auto-map')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Auto-map Slack users to DevOS users by email' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Auto-mapping result' })
  async autoMapUsers(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{ mapped: number; unmatched: SlackUserInfo[] }> {
    const integration = await this.slackService.getIntegration(workspaceId);
    if (!integration) {
      throw new NotFoundException('No Slack integration found for this workspace');
    }
    return this.userMappingService.autoMapByEmail(workspaceId, integration.id);
  }

  /**
   * POST /api/integrations/slack/users/map?workspaceId=...
   * Manually map a Slack user to a DevOS user.
   */
  @Post('users/map')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Manually map Slack user to DevOS user' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'User mapped successfully' })
  @ApiResponse({ status: 409, description: 'User already mapped' })
  async mapUser(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: MapSlackUserDto,
  ): Promise<SlackUserMapping> {
    const integration = await this.slackService.getIntegration(workspaceId);
    if (!integration) {
      throw new NotFoundException('No Slack integration found for this workspace');
    }
    return this.userMappingService.mapUser(
      workspaceId,
      integration.id,
      dto.devosUserId,
      dto.slackUserId,
    );
  }

  /**
   * DELETE /api/integrations/slack/users/:mappingId?workspaceId=...
   * Remove a user mapping.
   */
  @Delete('users/:mappingId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove Slack user mapping' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 204, description: 'Mapping removed' })
  @ApiResponse({ status: 404, description: 'Mapping not found' })
  async unmapUser(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
  ): Promise<void> {
    return this.userMappingService.unmapUser(workspaceId, mappingId);
  }

  /**
   * GET /api/integrations/slack/users/slack-list?workspaceId=...
   * List available Slack users for manual mapping.
   * NOTE: More specific route must be defined BEFORE less specific 'users' route
   * to prevent NestJS route shadowing.
   */
  @Get('users/slack-list')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List Slack workspace users' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Slack users listed' })
  async listSlackUsers(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<SlackUserInfo[]> {
    return this.userMappingService.listSlackUsers(workspaceId);
  }

  /**
   * GET /api/integrations/slack/users?workspaceId=...
   * Get all user mappings for a workspace.
   */
  @Get('users')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Slack user mappings' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'User mappings returned' })
  async getUserMappings(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<SlackUserMapping[]> {
    return this.userMappingService.getMappings(workspaceId);
  }
}
