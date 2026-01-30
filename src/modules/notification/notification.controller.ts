import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
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
  @ApiResponse({
    status: 200,
    description: 'Unread notifications retrieved successfully',
  })
  async getUnreadNotifications(
    @Request() req: any,
  ): Promise<Notification[]> {
    const workspaceId = req.user.workspaceId;
    const userId = req.user.id;

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
  async markAsRead(@Param('id') notificationId: string): Promise<void> {
    await this.notificationService.markAsRead(notificationId);
  }
}
