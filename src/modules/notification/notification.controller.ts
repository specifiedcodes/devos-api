import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { Notification } from '../../database/entities/notification.entity';

@Controller('api/v1/notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get unread notifications for current user' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Workspace ID to filter notifications' })
  @ApiResponse({
    status: 200,
    description: 'Unread notifications retrieved successfully',
  })
  async getUnreadNotifications(
    @Request() req: any,
    @Query('workspaceId') queryWorkspaceId?: string,
  ): Promise<Notification[]> {
    const workspaceId =
      queryWorkspaceId || req.user.workspaceId || req.headers['x-workspace-id'];
    const userId = req.user.id;

    if (!workspaceId) {
      throw new BadRequestException(
        'workspaceId is required (pass as query parameter or x-workspace-id header)',
      );
    }

    return this.notificationService.getUnreadNotifications(
      workspaceId,
      userId,
    );
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - notification does not belong to user',
  })
  async markAsRead(
    @Param('id') notificationId: string,
    @Request() req: any,
  ): Promise<void> {
    await this.notificationService.markAsRead(notificationId, req.user.id);
  }
}
