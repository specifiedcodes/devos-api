import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CliSession } from '../../database/entities/cli-session.entity';
import { CliSessionsService } from './cli-sessions.service';
import { CliSessionsController, CliSessionsInternalController } from './cli-sessions.controller';
import { CliSessionCleanupService } from './cli-session-cleanup.service';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { AuditModule } from '../../shared/audit/audit.module';

/**
 * CLI Sessions Module
 * Story 8.5: CLI Session History and Replay
 *
 * Provides CLI session history storage and retrieval
 * with compression, pagination, and retention cleanup.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CliSession, WorkspaceMember]),
    AuditModule,
  ],
  controllers: [CliSessionsController, CliSessionsInternalController],
  providers: [CliSessionsService, CliSessionCleanupService],
  exports: [CliSessionsService],
})
export class CliSessionsModule {}
