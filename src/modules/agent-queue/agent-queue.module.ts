import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentQueueService } from './services/agent-queue.service';
import { AgentQueueController } from './controllers/agent-queue.controller';
import { AgentJobProcessor } from './processors/agent-job.processor';
import { AgentJob } from './entities/agent-job.entity';
import { AgentsModule } from '../agents/agents.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

/**
 * AgentQueueModule
 * Story 5.1: BullMQ Task Queue Setup
 * Story 5.3: Dev Agent Implementation - processor routing
 * Story 11.1: Pipeline state machine callback integration
 *
 * Provides task queue infrastructure for autonomous AI agent orchestration
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentJob]),
    BullModule.registerQueue({
      name: 'agent-tasks',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 7 * 24 * 3600, // 7 days
        },
        removeOnFail: {
          age: 30 * 24 * 3600, // 30 days
        },
      },
    }),
    forwardRef(() => AgentsModule),
    forwardRef(() => OrchestratorModule),
  ],
  controllers: [AgentQueueController],
  providers: [AgentQueueService, AgentJobProcessor],
  exports: [AgentQueueService],
})
export class AgentQueueModule {}
