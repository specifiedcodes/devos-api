import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { AccountDeletion } from '../../../database/entities/account-deletion.entity';
import { User } from '../../../database/entities/user.entity';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @InjectRepository(AccountDeletion)
    private accountDeletionRepository: Repository<AccountDeletion>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Daily cron job to process hard deletes for accounts past 30-day grace period
   * Runs at 2:00 AM every day
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async processHardDeletes(): Promise<void> {
    this.logger.log('Starting hard delete cleanup job');

    // Find deletion records ready for hard delete
    const deletionsToProcess = await this.accountDeletionRepository.find({
      where: {
        hard_delete_scheduled_at: LessThanOrEqual(new Date()),
        completed: false,
      },
    });

    this.logger.log(`Found ${deletionsToProcess.length} accounts to hard delete`);

    let successCount = 0;
    let errorCount = 0;

    for (const deletion of deletionsToProcess) {
      try {
        // Hard delete user record (cascade will handle related data)
        await this.userRepository.delete({ id: deletion.user_id });

        // Mark deletion as completed
        deletion.completed = true;
        await this.accountDeletionRepository.save(deletion);

        this.logger.log(`Hard deleted user: ${deletion.user_id}`);
        successCount++;
      } catch (error) {
        this.logger.error(
          `Failed to hard delete user: ${deletion.user_id}`,
          error instanceof Error ? error.stack : String(error),
        );
        errorCount++;
      }
    }

    this.logger.log(
      `Hard delete cleanup completed. Success: ${successCount}, Errors: ${errorCount}`,
    );
  }
}
