import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { CliSession } from '../../database/entities/cli-session.entity';
import { CliSessionsService } from './cli-sessions.service';
import { CliSessionsController, CliSessionsInternalController } from './cli-sessions.controller';
import { CliSessionCleanupService } from './cli-session-cleanup.service';
import { CliSessionArchiveService } from './cli-session-archive.service';
import { CliSessionArchiveProcessor } from './cli-session-archive.processor';
import { CliSessionArchiveSchedulerService } from './cli-session-archive-scheduler.service';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { AuditModule } from '../../shared/audit/audit.module';

/**
 * CLI Sessions Module
 * Story 8.5: CLI Session History and Replay
 * Story 16.3: CLI Session Archive Storage
 *
 * Provides CLI session history storage and retrieval
 * with compression, pagination, retention cleanup,
 * and MinIO archive storage with Redis caching.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CliSession, WorkspaceMember]),
    BullModule.registerQueue({ name: 'cli-session-archive' }),
    AuditModule,
  ],
  controllers: [CliSessionsController, CliSessionsInternalController],
  providers: [
    CliSessionsService,
    CliSessionCleanupService,
    CliSessionArchiveService,
    CliSessionArchiveProcessor,
    CliSessionArchiveSchedulerService,
  ],
  exports: [CliSessionsService, CliSessionArchiveService],
})
export class CliSessionsModule {}
