import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sprint, SprintStatus } from '../../../database/entities/sprint.entity';
import { SprintMetricsService } from '../services/sprint-metrics.service';

@Injectable()
export class MetricsScheduler {
  private readonly logger = new Logger(MetricsScheduler.name);
  private isRunning = false;
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_DELAY_MS = 100;

  constructor(
    @InjectRepository(Sprint)
    private readonly sprintRepository: Repository<Sprint>,
    private readonly sprintMetricsService: SprintMetricsService,
  ) {}

  @Cron('59 23 * * *', {
    name: 'dailySprintMetricsSnapshot',
    timeZone: 'UTC',
  })
  async handleDailyMetricsSnapshot(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Daily metrics snapshot already running, skipping');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting daily sprint metrics snapshot');

    try {
      let processed = 0;
      let errors = 0;
      let offset = 0;

      while (true) {
        const batch = await this.sprintRepository.find({
          where: { status: SprintStatus.ACTIVE },
          skip: offset,
          take: this.BATCH_SIZE,
        });

        if (batch.length === 0) {
          break;
        }

        this.logger.log(`Processing batch of ${batch.length} sprints (offset: ${offset})`);

        for (const sprint of batch) {
          try {
            await this.sprintMetricsService.snapshotDailyMetrics(sprint.id);
            processed++;
          } catch (error) {
            this.logger.error(
              `Failed to snapshot metrics for sprint ${sprint.id}`,
              error instanceof Error ? error.stack : String(error),
            );
            errors++;
          }
        }

        offset += this.BATCH_SIZE;

        if (batch.length === this.BATCH_SIZE) {
          await this.delay(this.BATCH_DELAY_MS);
        }
      }

      this.logger.log(`Daily sprint metrics snapshot completed: ${processed} processed, ${errors} errors`);
    } catch (error) {
      this.logger.error(
        'Failed to complete daily sprint metrics snapshot',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }

  async triggerManualSnapshot(): Promise<{ processed: number; errors: number }> {
    this.logger.log('Manual sprint metrics snapshot triggered');

    let processed = 0;
    let errors = 0;
    let offset = 0;

    while (true) {
      const batch = await this.sprintRepository.find({
        where: { status: SprintStatus.ACTIVE },
        skip: offset,
        take: this.BATCH_SIZE,
      });

      if (batch.length === 0) {
        break;
      }

      for (const sprint of batch) {
        try {
          await this.sprintMetricsService.snapshotDailyMetrics(sprint.id);
          processed++;
        } catch (error) {
          this.logger.error(
            `Failed to snapshot metrics for sprint ${sprint.id}`,
            error instanceof Error ? error.stack : String(error),
          );
          errors++;
        }
      }

      offset += this.BATCH_SIZE;

      if (batch.length === this.BATCH_SIZE) {
        await this.delay(this.BATCH_DELAY_MS);
      }
    }

    return { processed, errors };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
