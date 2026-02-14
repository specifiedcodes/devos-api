/**
 * OrchestratorModule
 * Story 11.1: Orchestrator State Machine Core
 * Story 11.2: Claude Code CLI Container Setup
 * Story 11.3: Agent-to-CLI Execution Pipeline
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
 *
 * Agent-to-CLI Execution Pipeline (Story 11.3):
 * - PipelineJobHandlerService: Main pipeline job handler
 * - TaskContextAssemblerService: Task context assembly for agents
 * - PipelineBranchManagerService: Git branch management
 * - CLIOutputStreamService: Real-time output streaming
 * - SessionHealthMonitorService: Session health monitoring
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
import { CliSessionsModule } from '../cli-sessions/cli-sessions.module';
import { CLIKeyBridgeService } from './services/cli-key-bridge.service';
import { CLISessionConfigService } from './services/cli-session-config.service';
import { WorkspaceManagerService } from './services/workspace-manager.service';
import { GitConfigService } from './services/git-config.service';
import { CLISessionLifecycleService } from './services/cli-session-lifecycle.service';
// Story 11.3: Agent-to-CLI Execution Pipeline services
import { PipelineJobHandlerService } from './services/pipeline-job-handler.service';
import { TaskContextAssemblerService } from './services/task-context-assembler.service';
import { PipelineBranchManagerService } from './services/pipeline-branch-manager.service';
import { CLIOutputStreamService } from './services/cli-output-stream.service';
import { SessionHealthMonitorService } from './services/session-health-monitor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PipelineStateHistory]),
    forwardRef(() => AgentQueueModule),
    BYOKModule,
    CliSessionsModule,
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
    // Story 11.3: Agent-to-CLI Execution Pipeline services
    PipelineJobHandlerService,
    TaskContextAssemblerService,
    PipelineBranchManagerService,
    CLIOutputStreamService,
    SessionHealthMonitorService,
  ],
  exports: [
    PipelineStateMachineService,
    CLISessionLifecycleService,
    PipelineJobHandlerService,
  ],
})
export class OrchestratorModule {}
