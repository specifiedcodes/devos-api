import {
  Controller,
  Get,
  Patch,
  Body,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationPreferencesService } from '../services/notification-preferences.service';
import {
  UpdateNotificationPreferencesDto,
  GetNotificationPreferencesDto,
  NotificationPreferencesResponseDto,
} from '../dto/notification-preferences.dto';

/**
 * NotificationPreferencesController
 * Story 9.9: Chat Notifications
 *
 * Handles notification preferences API endpoints
 */
@ApiTags('Notification Preferences')
@Controller('api/v1/users/me/notification-preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class NotificationPreferencesController {
  constructor(
    private readonly preferencesService: NotificationPreferencesService,
  ) {}

  /**
   * Get notification preferences for current user in a workspace
   */
  @Get()
  @ApiOperation({ summary: 'Get notification preferences' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification preferences retrieved successfully',
    type: NotificationPreferencesResponseDto,
  })
  async getPreferences(
    @Request() req: any,
    @Query('workspaceId') workspaceId: string,
  ): Promise<NotificationPreferencesResponseDto> {
    return this.preferencesService.getPreferences(req.user.userId, workspaceId);
  }

  /**
   * Update notification preferences for current user
   */
  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification preferences updated successfully',
    type: NotificationPreferencesResponseDto,
  })
  async updatePreferences(
    @Request() req: any,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    return this.preferencesService.updatePreferences(req.user.userId, dto);
  }
}
