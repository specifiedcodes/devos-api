/**
 * OrchestratorModule
 * Story 11.1: Orchestrator State Machine Core
 * Story 11.2: Claude Code CLI Container Setup
 *
 * Provides the autonomous pipeline state machine with:
 * - PipelineStateMachineService: Core state machine logic
 * - PipelineStateStore: Redis persistence
 * - PipelineRecoveryService: Crash recovery on startup
 * - OrchestratorController: REST API endpoints
 *
 * CLI Container Setup (Story 11.2):
 * - CLIKeyBridgeService: BYOK key integration for CLI sessions
 * - CLISessionConfigService: Session configuration management
 * - WorkspaceManagerService: Workspace directory management
 * - GitConfigService: Git configuration and authentication
 * - CLISessionLifecycleService: Full CLI session lifecycle coordination
 */
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelineStateHistory } from './entities/pipeline-state-history.entity';
import { PipelineStateMachineService } from './services/pipeline-state-machine.service';
import { PipelineStateStore } from './services/pipeline-state-store.service';
import { PipelineRecoveryService } from './services/pipeline-recovery.service';
import { OrchestratorController } from './orchestrator.controller';
import { AgentQueueModule } from '../agent-queue/agent-queue.module';
import { BYOKModule } from '../byok/byok.module';
import { CLIKeyBridgeService } from './services/cli-key-bridge.service';
import { CLISessionConfigService } from './services/cli-session-config.service';
import { WorkspaceManagerService } from './services/workspace-manager.service';
import { GitConfigService } from './services/git-config.service';
import { CLISessionLifecycleService } from './services/cli-session-lifecycle.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PipelineStateHistory]),
    forwardRef(() => AgentQueueModule),
    BYOKModule,
  ],
  controllers: [OrchestratorController],
  providers: [
    PipelineStateMachineService,
    PipelineStateStore,
    PipelineRecoveryService,
    // Story 11.2: CLI Container Setup services
    CLIKeyBridgeService,
    CLISessionConfigService,
    WorkspaceManagerService,
    GitConfigService,
    CLISessionLifecycleService,
  ],
  exports: [
    PipelineStateMachineService,
    CLISessionLifecycleService,
  ],
})
export class OrchestratorModule {}
