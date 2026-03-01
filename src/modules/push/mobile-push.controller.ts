/**
 * Mobile Push Controller
 * Story 22.7: Mobile Push Notifications
 *
 * REST API endpoints for mobile push notification management:
 * - POST /api/v1/push/mobile/register - Register mobile push token
 * - DELETE /api/v1/push/mobile/register - Unregister device
 * - GET /api/v1/push/mobile/devices - List user's registered devices
 * - GET /api/v1/push/mobile/preferences - Get notification preferences
 * - PUT /api/v1/push/mobile/preferences - Update notification preferences
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Param,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MobilePushService } from './services/mobile-push.service';
import {
  RegisterMobilePushTokenDto,
  MobilePushTokenResponseDto,
  UserDevicesResponseDto,
  MobileNotificationPreferencesResponseDto,
  UpdateMobileNotificationPreferencesDto,
} from './push.dto';

@ApiTags('Mobile Push Notifications')
@Controller('api/v1/push/mobile')
export class MobilePushController {
  constructor(private readonly mobilePushService: MobilePushService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Register or update mobile push token' })
  @ApiQuery({ name: 'workspaceId', required: true, description: 'Workspace ID' })
  @ApiResponse({
    status: 201,
    description: 'Push token registered',
    type: MobilePushTokenResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async registerToken(
    @Request() req: any,
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: RegisterMobilePushTokenDto,
  ): Promise<MobilePushTokenResponseDto> {
    const userId = req.user.sub || req.user.userId;
    const user = req.user;

    if (user.workspaceId && user.workspaceId !== workspaceId) {
      throw new BadRequestException('You do not have access to this workspace');
    }

    if (user.workspaces && Array.isArray(user.workspaces) && !user.workspaces.includes(workspaceId)) {
      throw new BadRequestException('You do not have access to this workspace');
    }

    if (!dto.expoPushToken.startsWith('ExponentPushToken[')) {
      throw new BadRequestException('Invalid Expo push token format');
    }

    await this.mobilePushService.registerToken(
      userId,
      workspaceId,
      dto.expoPushToken,
      dto.deviceId,
      dto.platform,
    );

    return {
      success: true,
      deviceId: dto.deviceId,
    };
  }

  @Delete('register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unregister mobile device' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ID to unregister' })
  @ApiQuery({ name: 'workspaceId', required: true, description: 'Workspace ID' })
  @ApiResponse({ status: 204, description: 'Device unregistered' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async unregisterDevice(
    @Request() req: any,
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('deviceId') deviceId: string,
  ): Promise<void> {
    if (!deviceId || deviceId.trim().length === 0) {
      throw new BadRequestException('deviceId is required');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) {
      throw new BadRequestException('deviceId contains invalid characters');
    }

    const userId = req.user.sub || req.user.userId;
    const user = req.user;

    if (user.workspaceId && user.workspaceId !== workspaceId) {
      throw new BadRequestException('You do not have access to this workspace');
    }

    if (user.workspaces && Array.isArray(user.workspaces) && !user.workspaces.includes(workspaceId)) {
      throw new BadRequestException('You do not have access to this workspace');
    }

    await this.mobilePushService.unregisterDevice(userId, deviceId);
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: "Get user's registered devices" })
  @ApiQuery({ name: 'workspaceId', required: true, description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Devices retrieved',
    type: UserDevicesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDevices(
    @Request() req: any,
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<UserDevicesResponseDto> {
    const userId = req.user.sub || req.user.userId;
    const tokens = await this.mobilePushService.getUserDevices(userId, workspaceId);

    return {
      devices: tokens.map((token) => ({
        id: token.id,
        deviceId: token.deviceId,
        platform: token.platform,
        lastUsedAt: token.lastUsedAt,
        isActive: token.isActive,
      })),
    };
  }

  @Get('preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get mobile notification preferences' })
  @ApiQuery({ name: 'workspaceId', required: true, description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Preferences retrieved',
    type: MobileNotificationPreferencesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPreferences(
    @Request() req: any,
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<MobileNotificationPreferencesResponseDto> {
    const userId = req.user.sub || req.user.userId;
    const preferences = await this.mobilePushService.getPreferences(userId, workspaceId);

    return {
      quietHoursStart: preferences.quietHoursStart,
      quietHoursEnd: preferences.quietHoursEnd,
      categoriesEnabled: preferences.categoriesEnabled as any,
      urgentOnlyInQuiet: preferences.urgentOnlyInQuiet,
    };
  }

  @Put('preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update mobile notification preferences' })
  @ApiQuery({ name: 'workspaceId', required: true, description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Preferences updated',
    type: MobileNotificationPreferencesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updatePreferences(
    @Request() req: any,
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateMobileNotificationPreferencesDto,
  ): Promise<MobileNotificationPreferencesResponseDto> {
    const userId = req.user.sub || req.user.userId;

    if (dto.quietHoursStart && !this.isValidTimeFormat(dto.quietHoursStart)) {
      throw new BadRequestException('quietHoursStart must be in HH:MM format');
    }

    if (dto.quietHoursEnd && !this.isValidTimeFormat(dto.quietHoursEnd)) {
      throw new BadRequestException('quietHoursEnd must be in HH:MM format');
    }

    const preferences = await this.mobilePushService.updatePreferences(userId, workspaceId, {
      quietHoursStart: dto.quietHoursStart,
      quietHoursEnd: dto.quietHoursEnd,
      categoriesEnabled: dto.categoriesEnabled,
      urgentOnlyInQuiet: dto.urgentOnlyInQuiet,
    });

    return {
      quietHoursStart: preferences.quietHoursStart,
      quietHoursEnd: preferences.quietHoursEnd,
      categoriesEnabled: preferences.categoriesEnabled as any,
      urgentOnlyInQuiet: preferences.urgentOnlyInQuiet,
    };
  }

  private isValidTimeFormat(time: string): boolean {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
  }
}
