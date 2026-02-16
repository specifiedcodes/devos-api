/**
 * NotificationPreferencesController
 * Story 10.6: Configurable Notification Preferences
 *
 * RESTful endpoints for managing notification preferences:
 * - GET /notification-preferences - Get current user's preferences
 * - PATCH /notification-preferences - Update preferences
 * - GET /notification-preferences/quiet-hours/status - Get quiet hours status
 */

import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Logger,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationPreferencesService } from '../services/notification-preferences.service';
import { QuietHoursService } from '../services/quiet-hours.service';
import {
  UpdateNotificationPreferencesDto,
  NotificationPreferencesResponseDto,
  QuietHoursStatusDto,
} from '../dto/notification-preferences.dto';

@Controller('api/v1/workspaces/:workspaceId/notification-preferences')
@ApiTags('Notification Preferences')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
export class NotificationPreferencesController {
  private readonly logger = new Logger(NotificationPreferencesController.name);

  constructor(
    private readonly preferencesService: NotificationPreferencesService,
    private readonly quietHoursService: QuietHoursService,
  ) {}

  /**
   * Get notification preferences for current user in workspace
   */
  @Get()
  @ApiOperation({ summary: 'Get notification preferences for current user' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns notification preferences',
    type: NotificationPreferencesResponseDto,
  })
  async getPreferences(
    @Param('workspaceId') workspaceId: string,
    @Request() req: any,
  ): Promise<NotificationPreferencesResponseDto> {
    const userId = req.user.sub || req.user.userId || req.user.id;
    this.logger.debug(
      `Getting preferences for user ${userId} in workspace ${workspaceId}`,
    );

    const preferences = await this.preferencesService.getPreferences(
      userId,
      workspaceId,
    );

    return this.toResponseDto(preferences);
  }

  /**
   * Update notification preferences for current user in workspace
   * Rate limited to prevent abuse (max 10 updates per minute)
   */
  @Patch()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns updated notification preferences',
    type: NotificationPreferencesResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request (e.g., attempting to disable critical notifications)',
  })
  async updatePreferences(
    @Param('workspaceId') workspaceId: string,
    @Request() req: any,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    const userId = req.user.sub || req.user.userId || req.user.id;
    this.logger.debug(
      `Updating preferences for user ${userId} in workspace ${workspaceId}`,
    );

    const updated = await this.preferencesService.updatePreferences(
      userId,
      workspaceId,
      dto,
    );

    return this.toResponseDto(updated);
  }

  /**
   * Get current quiet hours status
   */
  @Get('quiet-hours/status')
  @ApiOperation({ summary: 'Check if currently in quiet hours' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns quiet hours status',
    type: QuietHoursStatusDto,
  })
  async getQuietHoursStatus(
    @Param('workspaceId') workspaceId: string,
    @Request() req: any,
  ): Promise<QuietHoursStatusDto> {
    const userId = req.user.sub || req.user.userId || req.user.id;
    this.logger.debug(
      `Getting quiet hours status for user ${userId} in workspace ${workspaceId}`,
    );

    const preferences = await this.preferencesService.getPreferences(
      userId,
      workspaceId,
    );

    return this.quietHoursService.getStatus(userId, preferences);
  }

  /**
   * Convert entity to response DTO
   */
  private toResponseDto(entity: any): NotificationPreferencesResponseDto {
    return {
      id: entity.id,
      userId: entity.userId,
      workspaceId: entity.workspaceId,
      enabled: entity.enabled,
      pushEnabled: entity.pushEnabled,
      soundEnabled: entity.soundEnabled,
      soundVolume: Number(entity.soundVolume),
      soundFile: entity.soundFile,
      dndEnabled: entity.dndEnabled,
      dndSchedule: entity.dndSchedule,
      agentSettings: entity.agentSettings,
      typeSettings: entity.typeSettings,
      eventSettings: entity.eventSettings,
      channelPreferences: entity.channelPreferences,
      perTypeChannelOverrides: entity.perTypeChannelOverrides,
      inAppEnabled: entity.inAppEnabled,
      emailEnabled: entity.emailEnabled,
      quietHours: entity.quietHours,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
