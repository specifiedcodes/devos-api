/**
 * SlackEventsController
 * Story 21.1: Slack OAuth Integration (AC3)
 * Story 21.2: Slack Interactive Components (AC5) - Enhanced interaction handling + slash commands
 *
 * Handles incoming Slack Events API requests including url_verification challenge,
 * event callbacks, interactive component payloads, and slash commands.
 */

import {
  Controller,
  Post,
  Headers,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SlackOAuthService } from '../../../notifications/services/slack-oauth.service';
import { SlackIntegration } from '../../../../database/entities/slack-integration.entity';
import { RedisService } from '../../../redis/redis.service';
import { SlackInteractionHandlerService } from '../services/slack-interaction-handler.service';

@Controller('api/integrations/slack')
@ApiTags('Integrations - Slack Events')
export class SlackEventsController {
  private readonly logger = new Logger(SlackEventsController.name);
  private readonly signingSecretConfigured: boolean;

  constructor(
    private readonly oauthService: SlackOAuthService,
    @InjectRepository(SlackIntegration)
    private readonly integrationRepo: Repository<SlackIntegration>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly interactionHandler: SlackInteractionHandlerService,
  ) {
    this.signingSecretConfigured = !!this.configService.get<string>('SLACK_SIGNING_SECRET');
  }

  /**
   * POST /api/integrations/slack/events
   * Handles Slack Events API callbacks.
   * - url_verification: Responds with challenge for Slack App configuration
   * - event_callback: Processes subscribed events (app_uninstalled, tokens_revoked)
   */
  @Post('events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Slack Events API callbacks' })
  @ApiResponse({ status: 200, description: 'Event acknowledged' })
  @ApiResponse({ status: 401, description: 'Invalid Slack signature' })
  @ApiResponse({ status: 503, description: 'Slack signing secret not configured' })
  async handleEvent(
    @Headers('x-slack-signature') signature: string,
    @Headers('x-slack-request-timestamp') timestamp: string,
    @Body() body: any,
    @Req() req: any,
  ): Promise<any> {
    if (!this.signingSecretConfigured) {
      throw new ServiceUnavailableException('Slack signing secret not configured');
    }

    // Get raw body for signature verification
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body);

    // Verify signature
    if (!this.verifyRequest(signature, timestamp, rawBody)) {
      throw new UnauthorizedException('Invalid Slack signature');
    }

    // Handle url_verification challenge
    if (body.type === 'url_verification') {
      this.logger.log('Slack URL verification challenge received');
      return { challenge: body.challenge };
    }

    // Handle event_callback
    if (body.type === 'event_callback') {
      const event = body.event;
      const teamId = body.team_id;

      this.logger.log(`Slack event received: ${event?.type} from team ${teamId}`);

      switch (event?.type) {
        case 'app_uninstalled':
          await this.handleAppUninstalled(teamId);
          break;

        case 'tokens_revoked':
          await this.handleTokensRevoked(teamId);
          break;

        case 'member_joined_channel':
        case 'member_left_channel':
          // Log for future channel membership tracking
          this.logger.log(`Slack ${event.type}: user ${event.user} in channel ${event.channel}`);
          break;

        default:
          this.logger.log(`Unhandled Slack event type: ${event?.type}`);
          break;
      }
    }

    return { ok: true };
  }

  /**
   * POST /api/integrations/slack/interactions
   * Handles Slack Interactive Components (button clicks, modal submissions).
   * Payload is URL-encoded with a 'payload' field containing JSON.
   * Story 21.2: Routes to SlackInteractionHandlerService for processing.
   */
  @Post('interactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Slack interactive components' })
  @ApiResponse({ status: 200, description: 'Interaction acknowledged' })
  @ApiResponse({ status: 401, description: 'Invalid Slack signature' })
  async handleInteraction(
    @Headers('x-slack-signature') signature: string,
    @Headers('x-slack-request-timestamp') timestamp: string,
    @Body() body: any,
    @Req() req: any,
  ): Promise<any> {
    if (!this.signingSecretConfigured) {
      throw new ServiceUnavailableException('Slack signing secret not configured');
    }

    // Get raw body for signature verification
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body);

    // Verify signature
    if (!this.verifyRequest(signature, timestamp, rawBody)) {
      throw new UnauthorizedException('Invalid Slack signature');
    }

    // Parse the payload if it's URL-encoded
    let payload: any;
    try {
      if (typeof body.payload === 'string') {
        payload = JSON.parse(body.payload);
      } else {
        payload = body;
      }
    } catch {
      this.logger.warn('Failed to parse Slack interaction payload');
      return { ok: true };
    }

    this.logger.log(`Slack interaction received: ${payload.type} from team ${payload.team?.id}`);

    // Deduplication check - use trigger_id, callback_id, or a composite of team+user+action for fallback
    const interactionId = payload.trigger_id || payload.callback_id
      || `${payload.team?.id || 'unknown'}:${payload.user?.id || 'unknown'}:${payload.actions?.[0]?.action_id || 'none'}:${Math.floor(Date.now() / 1000)}`;
    const dedupeKey = `slack-interaction:${interactionId}`;
    const isDuplicate = await this.redisService.get(dedupeKey);
    if (isDuplicate) {
      return { ok: true };
    }
    await this.redisService.set(dedupeKey, '1', 60);

    // Route to handler (async - acknowledge within 3 seconds)
    switch (payload.type) {
      case 'block_actions':
        // Process async, return immediately
        this.interactionHandler.handleBlockActions(payload).catch(err =>
          this.logger.error('Block action handler error', err.stack),
        );
        break;

      case 'view_submission':
        this.interactionHandler.handleViewSubmission(payload).catch(err =>
          this.logger.error('View submission handler error', err.stack),
        );
        break;

      default:
        this.logger.log(`Unhandled interaction type: ${payload.type}`);
    }

    return { ok: true };
  }

  /**
   * POST /api/integrations/slack/commands
   * Handles Slack slash commands (/devos).
   * Story 21.2: AC5 - New endpoint for slash commands.
   */
  @Post('commands')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Slack slash commands' })
  @ApiResponse({ status: 200, description: 'Command response returned' })
  @ApiResponse({ status: 401, description: 'Invalid Slack signature' })
  async handleSlashCommand(
    @Headers('x-slack-signature') signature: string,
    @Headers('x-slack-request-timestamp') timestamp: string,
    @Body() body: any,
    @Req() req: any,
  ): Promise<any> {
    if (!this.signingSecretConfigured) {
      throw new ServiceUnavailableException('Slack signing secret not configured');
    }

    // Get raw body for signature verification
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body);

    // Verify signature
    if (!this.verifyRequest(signature, timestamp, rawBody)) {
      throw new UnauthorizedException('Invalid Slack signature');
    }

    this.logger.log(`Slack command received: ${body.command} ${body.text} from team ${body.team_id}`);

    // Route to handler
    return this.interactionHandler.handleSlashCommand(body);
  }

  /**
   * Verify Slack request signature.
   */
  private verifyRequest(signature: string, timestamp: string, rawBody: string): boolean {
    if (!signature || !timestamp) {
      return false;
    }

    return this.oauthService.verifySignature(signature, timestamp, rawBody);
  }

  /**
   * Handle app_uninstalled event - set integration status to 'disconnected'.
   */
  private async handleAppUninstalled(teamId: string): Promise<void> {
    this.logger.warn(`Slack app uninstalled for team ${teamId}`);

    const integration = await this.integrationRepo.findOne({ where: { teamId } });
    if (integration) {
      await this.integrationRepo.update(
        { id: integration.id },
        { status: 'disconnected' },
      );
      await this.redisService.del(`slack-integration:${integration.workspaceId}`);
    }
  }

  /**
   * Handle tokens_revoked event - set integration status to 'revoked'.
   */
  private async handleTokensRevoked(teamId: string): Promise<void> {
    this.logger.warn(`Slack tokens revoked for team ${teamId}`);

    const integration = await this.integrationRepo.findOne({ where: { teamId } });
    if (integration) {
      await this.integrationRepo.update(
        { id: integration.id },
        { status: 'revoked' },
      );
      await this.redisService.del(`slack-integration:${integration.workspaceId}`);
    }
  }
}
