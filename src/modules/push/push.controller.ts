/**
 * Push Notification Controller
 * Story 10.4: Push Notifications Setup
 * Story 16.7: VAPID Key Web Push Setup (admin endpoints)
 *
 * REST API endpoints for push notification management:
 * - GET /api/v1/push/config - Get VAPID public key
 * - POST /api/v1/push/subscriptions - Create subscription
 * - DELETE /api/v1/push/subscriptions - Remove subscription
 * - GET /api/v1/push/subscriptions/me - Get user's subscriptions
 * - GET /api/v1/push/admin/vapid-status - VAPID key status (admin)
 * - GET /api/v1/push/admin/stats - Push statistics (admin)
 * - POST /api/v1/push/admin/cleanup - Trigger manual cleanup (admin)
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PushNotificationService } from './push.service';
import { VapidKeyService } from './services/vapid-key.service';
import { PushSubscriptionCleanupService, CleanupResult } from './services/push-subscription-cleanup.service';
import {
  CreatePushSubscriptionDto,
  PushSubscriptionResponseDto,
  PushConfigResponseDto,
  VapidKeyStatusResponseDto,
  PushStatsResponseDto,
} from './push.dto';

@ApiTags('Push Notifications')
@Controller('api/v1/push')
export class PushController {
  constructor(
    private readonly pushService: PushNotificationService,
    private readonly vapidKeyService: VapidKeyService,
    private readonly cleanupService: PushSubscriptionCleanupService,
  ) {}

  /**
   * Get push notification configuration (public endpoint)
   */
  @Get('config')
  @ApiOperation({ summary: 'Get push notification configuration' })
  @ApiResponse({
    status: 200,
    description: 'Push configuration retrieved',
    type: PushConfigResponseDto,
  })
  getConfig(): PushConfigResponseDto {
    const publicKey = this.pushService.getPublicKey();

    return {
      vapidPublicKey: publicKey || '',
      supported: this.pushService.isEnabled(),
    };
  }

  /**
   * Create a push subscription
   */
  @Post('subscriptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or update a push subscription' })
  @ApiQuery({ name: 'workspaceId', required: true, description: 'Workspace ID' })
  @ApiResponse({
    status: 201,
    description: 'Subscription created',
    type: PushSubscriptionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid subscription data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'User does not have access to workspace' })
  async createSubscription(
    @Request() req: any,
    @Query('workspaceId') workspaceId: string,
    @Body() dto: CreatePushSubscriptionDto,
  ): Promise<PushSubscriptionResponseDto> {
    if (!workspaceId) {
      throw new BadRequestException('workspaceId is required');
    }

    if (!this.pushService.isEnabled()) {
      throw new BadRequestException('Push notifications are not configured');
    }

    const userId = req.user.sub || req.user.userId;
    const user = req.user;

    // Validate user has access to the workspace
    // Single workspace check
    if (user.workspaceId && user.workspaceId !== workspaceId) {
      throw new BadRequestException('You do not have access to this workspace');
    }

    // Multi-workspace check
    if (user.workspaces && Array.isArray(user.workspaces) && !user.workspaces.includes(workspaceId)) {
      throw new BadRequestException('You do not have access to this workspace');
    }

    const subscription = await this.pushService.createSubscription(
      userId,
      workspaceId,
      dto.endpoint,
      dto.keys,
      dto.userAgent,
      dto.deviceName,
      dto.expirationTime,
    );

    return {
      id: subscription.id,
      userId: subscription.userId,
      workspaceId: subscription.workspaceId,
      endpoint: subscription.endpoint,
      deviceName: subscription.deviceName,
      createdAt: subscription.createdAt,
      lastUsedAt: subscription.lastUsedAt,
    };
  }

  /**
   * Delete a push subscription
   */
  @Delete('subscriptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a push subscription' })
  @ApiQuery({ name: 'endpoint', required: true, description: 'Subscription endpoint URL' })
  @ApiResponse({ status: 204, description: 'Subscription deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async deleteSubscription(
    @Request() req: any,
    @Query('endpoint') endpoint: string,
  ): Promise<void> {
    if (!endpoint) {
      throw new BadRequestException('endpoint is required');
    }

    const userId = req.user.sub || req.user.userId;
    const deleted = await this.pushService.deleteSubscription(endpoint, userId);

    if (!deleted) {
      throw new NotFoundException('Subscription not found');
    }
  }

  /**
   * Get user's push subscriptions
   */
  @Get('subscriptions/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user's push subscriptions" })
  @ApiResponse({
    status: 200,
    description: 'User subscriptions retrieved',
    type: [PushSubscriptionResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserSubscriptions(
    @Request() req: any,
  ): Promise<PushSubscriptionResponseDto[]> {
    const userId = req.user.sub || req.user.userId;
    const subscriptions = await this.pushService.getUserSubscriptions(userId);

    return subscriptions.map(sub => ({
      id: sub.id,
      userId: sub.userId,
      workspaceId: sub.workspaceId,
      endpoint: sub.endpoint,
      deviceName: sub.deviceName,
      createdAt: sub.createdAt,
      lastUsedAt: sub.lastUsedAt,
    }));
  }

  /**
   * Delete a specific subscription by ID
   */
  @Delete('subscriptions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a push subscription by ID' })
  @ApiResponse({ status: 204, description: 'Subscription deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async deleteSubscriptionById(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<void> {
    if (!id) {
      throw new BadRequestException('id is required');
    }

    const userId = req.user.sub || req.user.userId;
    const deleted = await this.pushService.deleteSubscriptionById(id, userId);

    if (!deleted) {
      throw new NotFoundException('Subscription not found');
    }
  }

  /**
   * Verify the requesting user has admin/owner privileges.
   * Checks isPlatformAdmin flag or workspace role from JWT.
   * TODO: Replace with @PlatformAdmin() decorator when admin module is imported.
   */
  private assertAdminAccess(req: any): void {
    const user = req.user;
    const isAdmin =
      user?.isPlatformAdmin === true ||
      user?.role === 'admin' ||
      user?.role === 'owner';

    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
  }

  /**
   * Get VAPID key status (admin endpoint)
   */
  @Get('admin/vapid-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get VAPID key configuration status (admin)' })
  @ApiResponse({
    status: 200,
    description: 'VAPID key status retrieved',
    type: VapidKeyStatusResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  getVapidStatus(@Request() req: any): VapidKeyStatusResponseDto {
    this.assertAdminAccess(req);
    return this.vapidKeyService.getKeyStatus();
  }

  /**
   * Get push subscription statistics (admin endpoint)
   */
  @Get('admin/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get push subscription statistics (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Push subscription statistics',
    type: PushStatsResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getStats(@Request() req: any): Promise<PushStatsResponseDto> {
    this.assertAdminAccess(req);
    const subscriptionStats = await this.cleanupService.getSubscriptionStats();
    const deliveryStats = this.pushService.getDeliveryStats();
    const lastCleanup = this.cleanupService.getLastCleanupResult();

    return {
      subscriptions: subscriptionStats,
      delivery: deliveryStats,
      lastCleanup: lastCleanup || undefined,
    };
  }

  /**
   * Trigger manual subscription cleanup (admin endpoint)
   */
  @Post('admin/cleanup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger manual push subscription cleanup (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Cleanup completed',
  })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async triggerCleanup(@Request() req: any): Promise<CleanupResult> {
    this.assertAdminAccess(req);
    return this.cleanupService.handleWeeklyCleanup();
  }
}
