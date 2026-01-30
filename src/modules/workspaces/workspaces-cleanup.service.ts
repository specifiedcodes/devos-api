import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { WorkspaceInvitation, InvitationStatus } from '../../database/entities/workspace-invitation.entity';

/**
 * Background service for cleaning up expired invitations
 */
@Injectable()
export class WorkspacesCleanupService {
  private readonly logger = new Logger(WorkspacesCleanupService.name);

  constructor(
    @InjectRepository(WorkspaceInvitation)
    private readonly invitationRepository: Repository<WorkspaceInvitation>,
  ) {}

  /**
   * Cleanup expired invitations daily at midnight
   * Marks pending invitations that are past their expiry date as EXPIRED
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredInvitations(): Promise<void> {
    try {
      this.logger.log('Starting expired invitations cleanup...');

      const result = await this.invitationRepository.update(
        {
          status: InvitationStatus.PENDING,
          expiresAt: LessThan(new Date()),
        },
        {
          status: InvitationStatus.EXPIRED,
        },
      );

      this.logger.log(
        `Expired invitations cleanup complete. Marked ${result.affected || 0} invitations as expired.`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to cleanup expired invitations',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Cleanup old invitations (older than 90 days) weekly
   * Permanently deletes accepted, revoked, and expired invitations older than 90 days
   */
  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOldInvitations(): Promise<void> {
    try {
      this.logger.log('Starting old invitations cleanup...');

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const result = await this.invitationRepository.delete({
        status: InvitationStatus.ACCEPTED,
        createdAt: LessThan(ninetyDaysAgo),
      });

      const revokedResult = await this.invitationRepository.delete({
        status: InvitationStatus.REVOKED,
        createdAt: LessThan(ninetyDaysAgo),
      });

      const expiredResult = await this.invitationRepository.delete({
        status: InvitationStatus.EXPIRED,
        createdAt: LessThan(ninetyDaysAgo),
      });

      const totalDeleted =
        (result.affected || 0) +
        (revokedResult.affected || 0) +
        (expiredResult.affected || 0);

      this.logger.log(
        `Old invitations cleanup complete. Deleted ${totalDeleted} invitation records.`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to cleanup old invitations',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
