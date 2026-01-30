import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../database/entities/notification.entity';

export interface CreateNotificationDto {
  workspaceId: string;
  userId?: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  /**
   * Create a notification
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({
      workspaceId: dto.workspaceId,
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      message: dto.message,
      metadata: dto.metadata || {},
    });

    const saved = await this.notificationRepository.save(notification);

    this.logger.log(
      `Notification created: ${dto.type} for workspace ${dto.workspaceId}`,
    );

    return saved;
  }

  /**
   * Get unread notifications for a user
   */
  async getUnreadNotifications(
    workspaceId: string,
    userId: string,
  ): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: {
        workspaceId,
        userId,
        readAt: null as any,
      },
      order: {
        createdAt: 'DESC',
      },
      take: 50, // Limit to 50 most recent
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    await this.notificationRepository.update(
      { id: notificationId },
      { readAt: new Date() },
    );
  }

  /**
   * Get all notifications for a workspace (for owners/admins)
   */
  async getWorkspaceNotifications(
    workspaceId: string,
    limit: number = 100,
  ): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: {
        workspaceId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: limit,
    });
  }
}
