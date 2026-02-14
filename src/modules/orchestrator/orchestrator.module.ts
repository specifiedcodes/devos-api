/**
 * OrchestratorModule
 * Story 11.1: Orchestrator State Machine Core
 *
 * Provides the autonomous pipeline state machine with:
 * - PipelineStateMachineService: Core state machine logic
 * - PipelineStateStore: Redis persistence
 * - PipelineRecoveryService: Crash recovery on startup
 * - OrchestratorController: REST API endpoints
 */
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelineStateHistory } from './entities/pipeline-state-history.entity';
import { PipelineStateMachineService } from './services/pipeline-state-machine.service';
import { PipelineStateStore } from './services/pipeline-state-store.service';
import { PipelineRecoveryService } from './services/pipeline-recovery.service';
import { OrchestratorController } from './orchestrator.controller';
import { AgentQueueModule } from '../agent-queue/agent-queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PipelineStateHistory]),
    forwardRef(() => AgentQueueModule),
  ],
  controllers: [OrchestratorController],
  providers: [
    PipelineStateMachineService,
    PipelineStateStore,
    PipelineRecoveryService,
  ],
  exports: [PipelineStateMachineService],
})
export class OrchestratorModule {}
