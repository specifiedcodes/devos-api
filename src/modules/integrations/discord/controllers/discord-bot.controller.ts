/**
 * DiscordBotController
 * Story 21.4: Discord Bot (Optional) (AC5)
 *
 * REST endpoints for:
 * 1. Discord Interactions Endpoint (receives POST from Discord for slash commands)
 * 2. Bot configuration management (setup, update, disconnect)
 * 3. User link management (complete linking from web UI)
 * 4. Interaction log viewing
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
  Headers,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Logger,
  RawBodyRequest,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { DiscordBotGatewayService } from '../services/discord-bot-gateway.service';
import { DiscordUserLinkService } from '../services/discord-user-link.service';
import { DiscordCommandHandlerService } from '../services/discord-command-handler.service';
import {
  SetupDiscordBotDto,
  UpdateDiscordBotConfigDto,
  CompleteLinkDto,
} from '../dto/discord-bot.dto';
import { DiscordBotConfig } from '../../../../database/entities/discord-bot-config.entity';
import { DiscordUserLink } from '../../../../database/entities/discord-user-link.entity';
import { DiscordInteractionLog } from '../../../../database/entities/discord-interaction-log.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Controller('api/integrations/discord/bot')
@ApiTags('Integrations - Discord Bot')
export class DiscordBotController {
  private readonly logger = new Logger(DiscordBotController.name);

  constructor(
    private readonly botGatewayService: DiscordBotGatewayService,
    private readonly userLinkService: DiscordUserLinkService,
    private readonly commandHandlerService: DiscordCommandHandlerService,
    @InjectRepository(DiscordInteractionLog)
    private readonly logRepo: Repository<DiscordInteractionLog>,
  ) {}

  /**
   * POST /api/integrations/discord/bot/interactions
   * Discord Interactions Endpoint - receives slash command interactions.
   * Verifies Ed25519 signature, routes to command handler.
   * No JWT auth guard - Discord sends directly.
   */
  @Post('interactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Discord Interactions Endpoint' })
  @ApiResponse({ status: 200, description: 'Interaction response' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleInteraction(
    @Body() body: Record<string, any>,
    @Headers() headers: Record<string, string>,
  ): Promise<Record<string, any>> {
    const signature = headers['x-signature-ed25519'];
    const timestamp = headers['x-signature-timestamp'];

    if (!signature || !timestamp) {
      throw new UnauthorizedException('Missing signature headers');
    }

    // For PING interactions (type 1), respond with PONG
    if (body.type === 1) {
      // Verify signature if we can determine the guild
      // For initial PING from Discord during endpoint setup, just respond
      return { type: 1 };
    }

    // For APPLICATION_COMMAND interactions (type 2)
    if (body.type === 2) {
      const guildId = body.guild_id;
      if (!guildId) {
        throw new BadRequestException('Missing guild_id in interaction');
      }

      // Get bot config to find the public key for verification
      const botConfig = await this.botGatewayService.getBotConfig(guildId);
      if (botConfig?.publicKey) {
        const rawBody = JSON.stringify(body);
        const isValid = this.botGatewayService.verifyInteractionSignature(
          rawBody,
          signature,
          timestamp,
          botConfig.publicKey,
        );

        if (!isValid) {
          throw new UnauthorizedException('Invalid interaction signature');
        }
      }

      // Extract command data
      const discordUserId = body.member?.user?.id || body.user?.id || '';
      const commandData = body.data;
      const commandName = commandData?.options?.[0]?.name || commandData?.name || '';
      const subOptions = commandData?.options?.[0]?.options || [];

      // Parse options into a flat object
      const options: Record<string, string> = {};
      for (const opt of subOptions) {
        options[opt.name] = opt.value;
      }

      // Add username info
      const discordUsername = body.member?.user?.username || body.user?.username;
      if (discordUsername) {
        options.username = discordUsername;
      }

      return this.commandHandlerService.handleSlashCommand(
        guildId,
        discordUserId,
        commandName,
        options,
      );
    }

    // Unknown interaction type
    return { type: 1 };
  }

  /**
   * POST /api/integrations/discord/bot/setup?workspaceId=...
   * Setup Discord bot for a workspace.
   * Requires JWT auth + admin permission.
   */
  @Post('setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Setup Discord bot for workspace' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 201, description: 'Bot configured' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Bot already configured' })
  async setupBot(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: SetupDiscordBotDto,
    @Request() req: any,
  ): Promise<DiscordBotConfig> {
    const userId = req.user.sub || req.user.userId || req.user.id;

    return this.botGatewayService.setupBot({
      workspaceId,
      guildId: dto.guildId,
      botToken: dto.botToken,
      applicationId: dto.applicationId,
      publicKey: dto.publicKey,
      commandChannelId: dto.commandChannelId,
      commandChannelName: dto.commandChannelName,
      configuredBy: userId,
    });
  }

  /**
   * GET /api/integrations/discord/bot/config?workspaceId=...
   * Get bot configuration for a workspace.
   */
  @Get('config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Discord bot configuration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Bot configuration' })
  async getBotConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<DiscordBotConfig | { connected: false }> {
    const config = await this.botGatewayService.getBotConfigByWorkspace(workspaceId);
    if (!config) {
      return { connected: false };
    }

    // Redact sensitive fields
    return {
      ...config,
      botToken: '[REDACTED]',
      botTokenIv: '[REDACTED]',
    };
  }

  /**
   * PUT /api/integrations/discord/bot/config?workspaceId=...
   * Update bot configuration (enabled commands, channel restriction).
   */
  @Put('config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update Discord bot configuration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Configuration updated' })
  async updateBotConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateDiscordBotConfigDto,
  ): Promise<DiscordBotConfig> {
    const updated = await this.botGatewayService.updateBotConfig(workspaceId, dto);

    // Redact sensitive fields
    return {
      ...updated,
      botToken: '[REDACTED]',
      botTokenIv: '[REDACTED]',
    };
  }

  /**
   * DELETE /api/integrations/discord/bot/disconnect?workspaceId=...
   * Disconnect Discord bot.
   */
  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect Discord bot' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 204, description: 'Bot disconnected' })
  async disconnectBot(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<void> {
    await this.botGatewayService.disconnectBot(workspaceId);
  }

  /**
   * POST /api/integrations/discord/bot/complete-link
   * Complete Discord user linking from the web UI.
   */
  @Post('complete-link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Complete Discord user linking' })
  @ApiResponse({ status: 200, description: 'Link completed' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async completeLink(
    @Body() dto: CompleteLinkDto,
    @Request() req: any,
  ): Promise<{ success: boolean; discordUsername?: string }> {
    const userId = req.user.sub || req.user.userId || req.user.id;

    const link = await this.userLinkService.completeLinking(dto.linkToken, userId);

    return {
      success: true,
      discordUsername: link.discordUsername,
    };
  }

  /**
   * GET /api/integrations/discord/bot/user-links?workspaceId=...
   * List all Discord user links for a workspace.
   */
  @Get('user-links')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List Discord user links' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'User links list' })
  async listUserLinks(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<DiscordUserLink[]> {
    return this.userLinkService.listLinks(workspaceId);
  }

  /**
   * DELETE /api/integrations/discord/bot/user-links/:linkId?workspaceId=...
   * Remove a Discord user link.
   */
  @Delete('user-links/:linkId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove Discord user link' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 204, description: 'Link removed' })
  async unlinkUser(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ): Promise<void> {
    await this.userLinkService.unlinkById(workspaceId, linkId);
  }

  /**
   * GET /api/integrations/discord/bot/interaction-logs?workspaceId=...&limit=...&offset=...
   * Get bot interaction logs for a workspace.
   */
  @Get('interaction-logs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get bot interaction logs' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Interaction logs' })
  async getInteractionLogs(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('limit') limitParam?: string,
    @Query('offset') offsetParam?: string,
  ): Promise<{ items: DiscordInteractionLog[]; total: number }> {
    const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);
    const offset = Math.max(Number(offsetParam) || 0, 0);

    // NaN guard
    const safeLimit = Number.isNaN(limit) ? 20 : limit;
    const safeOffset = Number.isNaN(offset) ? 0 : offset;

    const [items, total] = await this.logRepo.findAndCount({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });

    return { items, total };
  }
}
