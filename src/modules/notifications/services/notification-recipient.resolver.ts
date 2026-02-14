/**
 * NotificationRecipientResolver
 * Story 10.5: Notification Triggers
 *
 * Resolves notification recipients based on workspace, project, or user context.
 * Filters recipients to only those with active push subscriptions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { PushSubscription } from '../../../database/entities/push-subscription.entity';
import { Project } from '../../../database/entities/project.entity';
import { NotificationRecipient } from '../events/notification.events';

@Injectable()
export class NotificationRecipientResolver {
  private readonly logger = new Logger(NotificationRecipientResolver.name);

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptionRepo: Repository<PushSubscription>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly workspacesService: WorkspacesService,
  ) {}

  /**
   * Get all active subscribers in a workspace
   */
  async forWorkspace(workspaceId: string): Promise<NotificationRecipient[]> {
    try {
      // Get all workspace members
      const members = await this.workspacesService.getMembers(workspaceId);

      // Get all subscriptions for this workspace
      const subscriptions = await this.subscriptionRepo.find({
        where: { workspaceId },
      });

      // Create set of user IDs with active subscriptions
      const subscribedUserIds = new Set(subscriptions.map((s) => s.userId));

      // Filter members to only those with subscriptions
      const recipients: NotificationRecipient[] = members
        .filter((member) => subscribedUserIds.has(member.userId))
        .map((member) => ({
          userId: member.userId,
          workspaceId,
        }));

      this.logger.debug(
        `Resolved ${recipients.length} recipients for workspace ${workspaceId}`,
      );

      return recipients;
    } catch (error) {
      this.logger.error(
        `Failed to resolve workspace recipients: ${workspaceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return [];
    }
  }

  /**
   * Get subscribers assigned to specific project
   * Looks up the project's workspace and returns all workspace members with subscriptions
   */
  async forProject(projectId: string): Promise<NotificationRecipient[]> {
    try {
      // Look up the project to get its workspace ID
      const project = await this.projectRepo.findOne({
        where: { id: projectId },
        select: ['id', 'workspaceId'],
      });

      if (!project) {
        this.logger.warn(`Project not found for recipient resolution: ${projectId}`);
        return [];
      }

      // Resolve recipients via the project's workspace
      return this.forWorkspace(project.workspaceId);
    } catch (error) {
      this.logger.error(
        `Failed to resolve project recipients: ${projectId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return [];
    }
  }

  /**
   * Get single user subscriptions (for agent messages)
   */
  async forUser(userId: string, workspaceId: string): Promise<NotificationRecipient[]> {
    try {
      const subscriptions = await this.subscriptionRepo.find({
        where: { userId, workspaceId },
      });

      if (subscriptions.length === 0) {
        this.logger.debug(`No subscriptions found for user ${userId}`);
        return [];
      }

      // Return single recipient (dedupe multiple subscriptions)
      return [{ userId, workspaceId }];
    } catch (error) {
      this.logger.error(
        `Failed to resolve user recipient: ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return [];
    }
  }

  /**
   * Check if user has any active subscriptions
   */
  async hasSubscription(userId: string, workspaceId?: string): Promise<boolean> {
    try {
      const where: any = { userId };
      if (workspaceId) {
        where.workspaceId = workspaceId;
      }

      const count = await this.subscriptionRepo.count({ where });
      return count > 0;
    } catch (error) {
      this.logger.error(
        `Failed to check subscription for user: ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }
}
