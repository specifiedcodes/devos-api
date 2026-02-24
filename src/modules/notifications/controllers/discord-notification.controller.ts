/**
 * DiscordNotificationController
 * Story 16.5: Discord Notification Integration (AC5)
 * Story 21.3: Discord Webhook Integration (AC4)
 *
 * REST API endpoints for Discord webhook management, configuration,
 * notification config CRUD, detailed status, and webhook verification.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DiscordNotificationService } from '../services/discord-notification.service';
import { DiscordNotificationConfigService } from '../../integrations/discord/services/discord-notification-config.service';
import {
  AddDiscordWebhookDto,
  UpdateDiscordConfigDto,
  DiscordIntegrationStatusDto,
} from '../dto/discord-notification.dto';
import {
  UpsertDiscordNotificationConfigDto,
  ToggleDiscordNotificationConfigDto,
  VerifyDiscordWebhookDto,
  DetailedDiscordStatusDto,
} from '../../integrations/discord/dto/discord-notification-config.dto';
import { DiscordNotificationConfig } from '../../../database/entities/discord-notification-config.entity';

@Controller('api/integrations/discord')
@ApiTags('Integrations - Discord')
@ApiBearerAuth('JWT-auth')
export class DiscordNotificationController {
  private readonly logger = new Logger(DiscordNotificationController.name);

  constructor(
    private readonly discordService: DiscordNotificationService,
    private readonly notificationConfigService: DiscordNotificationConfigService,
  ) {}

  /**
   * POST /api/integrations/discord/webhook?workspaceId=...
   * Add/update a Discord webhook for a workspace.
   * Validates the webhook URL and sends a test message.
   */
  @Post('webhook')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add or update Discord webhook' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Webhook configured successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook URL' })
  async addWebhook(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() body: AddDiscordWebhookDto,
    @Request() req: any,
  ): Promise<{ success: boolean; guildName?: string; channelName?: string; error?: string }> {
    const userId = req.user.sub || req.user.userId || req.user.id;
    return this.discordService.addWebhook(workspaceId, userId, body.webhookUrl, body.channelName);
  }

  /**
   * GET /api/integrations/discord/status?workspaceId=...
   * Get Discord integration status for workspace
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Discord integration status' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Integration status returned' })
  async getStatus(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{
    connected: boolean;
    name?: string;
    guildName?: string;
    defaultChannelName?: string;
    status?: string;
    messageCount?: number;
    lastMessageAt?: string;
  }> {
    const integration = await this.discordService.getIntegration(workspaceId);

    if (!integration) {
      return { connected: false };
    }

    return {
      connected: true,
      name: integration.name,
      guildName: integration.guildName,
      defaultChannelName: integration.defaultChannelName,
      status: integration.status,
      messageCount: integration.messageCount,
      lastMessageAt: integration.lastMessageAt?.toISOString?.() || (integration.lastMessageAt as any) || undefined,
    };
  }

  /**
   * GET /api/integrations/discord/detailed-status?workspaceId=...
   * Get detailed integration status including health, stats, and config summary.
   * Story 21.3 AC4
   */
  @Get('detailed-status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get detailed Discord integration status' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Detailed integration status returned' })
  async getDetailedStatus(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<DetailedDiscordStatusDto> {
    return this.discordService.getDetailedStatus(workspaceId);
  }

  /**
   * POST /api/integrations/discord/verify-webhook
   * Verify a Discord webhook URL is valid.
   * Story 21.3 AC4
   */
  @Post('verify-webhook')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify Discord webhook URL' })
  @ApiResponse({ status: 200, description: 'Webhook verification result' })
  async verifyWebhook(
    @Body() dto: VerifyDiscordWebhookDto,
  ): Promise<{ valid: boolean; guildName?: string; channelName?: string; error?: string }> {
    return this.discordService.verifyWebhook(dto.webhookUrl);
  }

  /**
   * GET /api/integrations/discord/notification-configs?workspaceId=...
   * Get all notification configs for the workspace.
   * Story 21.3 AC4
   */
  @Get('notification-configs')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Discord notification configs' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Notification configs returned' })
  async getNotificationConfigs(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<DiscordNotificationConfig[]> {
    return this.notificationConfigService.getConfigs(workspaceId);
  }

  /**
   * PUT /api/integrations/discord/notification-configs?workspaceId=...
   * Upsert a notification config for an event type.
   * Story 21.3 AC4
   */
  @Put('notification-configs')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upsert Discord notification config' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Notification config upserted' })
  async upsertNotificationConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpsertDiscordNotificationConfigDto,
  ): Promise<DiscordNotificationConfig> {
    return this.notificationConfigService.upsertConfig(workspaceId, dto);
  }

  /**
   * PATCH /api/integrations/discord/notification-configs/:configId/toggle?workspaceId=...
   * Toggle a notification config enabled/disabled.
   * Story 21.3 AC4
   */
  @Patch('notification-configs/:configId/toggle')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Toggle Discord notification config' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Notification config toggled' })
  async toggleNotificationConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Body() dto: ToggleDiscordNotificationConfigDto,
  ): Promise<DiscordNotificationConfig> {
    return this.notificationConfigService.toggleConfig(workspaceId, configId, dto.isEnabled);
  }

  /**
   * DELETE /api/integrations/discord/notification-configs/:configId?workspaceId=...
   * Delete a notification config.
   * Story 21.3 AC4
   */
  @Delete('notification-configs/:configId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete Discord notification config' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 204, description: 'Notification config deleted' })
  async deleteNotificationConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
  ): Promise<void> {
    return this.notificationConfigService.deleteConfig(workspaceId, configId);
  }

  /**
   * POST /api/integrations/discord/test?workspaceId=...
   * Send a test message to verify connection
   */
  @Post('test')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send test Discord notification' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Test message sent' })
  async testConnection(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return this.discordService.testConnection(workspaceId);
  }

  /**
   * PUT /api/integrations/discord/config?workspaceId=...
   * Update Discord notification configuration
   */
  @Put('config')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update Discord notification configuration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Configuration updated' })
  async updateConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() config: UpdateDiscordConfigDto,
  ): Promise<DiscordIntegrationStatusDto> {
    const integration = await this.discordService.getIntegration(workspaceId);
    if (!integration) {
      throw new NotFoundException('No Discord integration found for this workspace');
    }

    const updated = await this.discordService.updateConfig(workspaceId, config);

    return {
      connected: true,
      name: updated.name,
      guildName: updated.guildName,
      guildId: updated.guildId,
      defaultChannelName: updated.defaultChannelName,
      status: updated.status,
      quietHoursConfig: updated.quietHoursConfig,
      rateLimitPerMinute: updated.rateLimitPerMinute,
      mentionConfig: updated.mentionConfig,
      messageCount: updated.messageCount,
      errorCount: updated.errorCount,
      lastMessageAt: updated.lastMessageAt?.toISOString?.() || undefined,
      connectedAt: updated.connectedAt?.toISOString?.() || undefined,
    };
  }

  /**
   * DELETE /api/integrations/discord/disconnect?workspaceId=...
   * Disconnect Discord integration
   */
  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect Discord integration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 204, description: 'Discord disconnected' })
  async disconnect(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<void> {
    const integration = await this.discordService.getIntegration(workspaceId);
    if (!integration) {
      throw new NotFoundException('No Discord integration found for this workspace');
    }

    await this.discordService.disconnect(workspaceId);
  }
}
