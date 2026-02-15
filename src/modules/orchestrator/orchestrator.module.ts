/**
 * OrchestratorModule
 * Story 11.1: Orchestrator State Machine Core
 * Story 11.2: Claude Code CLI Container Setup
 * Story 11.3: Agent-to-CLI Execution Pipeline
 * Story 11.4: Dev Agent CLI Integration
 * Story 11.5: QA Agent CLI Integration
 * Story 11.6: Planner Agent CLI Integration
 * Story 11.7: DevOps Agent CLI Integration
 * Story 11.8: Multi-Agent Handoff Chain
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
 *
 * Dev Agent CLI Integration (Story 11.4):
 * - DevAgentPipelineExecutorService: Full dev agent workflow orchestration
 * - DevAgentGitOpsService: Git commit/push operations
 * - DevAgentTestExtractorService: Test result extraction
 * - DevAgentPRCreatorService: Pull request creation via GitHub API
 *
 * QA Agent CLI Integration (Story 11.5):
 * - QAAgentPipelineExecutorService: Full QA agent workflow orchestration
 * - QATestRunnerService: Test suite execution and result comparison
 * - QAStaticAnalyzerService: Lint and type check execution
 * - QASecurityScannerService: npm audit and secret scanning
 * - QAAcceptanceCriteriaValidatorService: Acceptance criteria verification
 * - QAReportGeneratorService: QA report assembly and verdict determination
 * - QAPRReviewerService: PR review submission via GitHub API
 *
 * Planner Agent CLI Integration (Story 11.6):
 * - PlannerAgentPipelineExecutorService: Full planner agent workflow orchestration
 * - PlannerDocumentValidatorService: BMAD template document validation
 * - PlannerSprintStatusUpdaterService: Sprint status YAML management
 * - PlannerGitOpsService: Git staging/commit/push for planning documents
 *
 * DevOps Agent CLI Integration (Story 11.7):
 * - DevOpsAgentPipelineExecutorService: Full DevOps agent deployment orchestration
 * - DevOpsPRMergerService: PR merge via GitHub API
 * - DevOpsDeploymentTriggerService: Platform detection and deployment trigger
 * - DevOpsDeploymentMonitorService: Deployment progress monitoring
 * - DevOpsSmokeTestRunnerService: CLI-based smoke test execution
 * - DevOpsRollbackHandlerService: Rollback and incident reporting
 *
 * Multi-Agent Handoff Chain (Story 11.8):
 * - HandoffCoordinatorService: Central handoff coordination
 * - HandoffContextAssemblerService: Context assembly between agents
 * - CoordinationRulesEngineService: Rule validation engine
 * - StoryDependencyManagerService: Story dependency tracking
 * - HandoffQueueService: Max parallel agent queue
 * - HandoffHistoryService: Audit trail persistence
 */
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelineStateHistory } from './entities/pipeline-state-history.entity';
import { HandoffHistory } from './entities/handoff-history.entity';
import { PipelineStateMachineService } from './services/pipeline-state-machine.service';
import { PipelineStateStore } from './services/pipeline-state-store.service';
import { PipelineRecoveryService } from './services/pipeline-recovery.service';
import { OrchestratorController } from './orchestrator.controller';
import { AgentQueueModule } from '../agent-queue/agent-queue.module';
import { BYOKModule } from '../byok/byok.module';
import { CliSessionsModule } from '../cli-sessions/cli-sessions.module';
import { IntegrationsModule } from '../integrations/integrations.module';
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
// Story 11.4: Dev Agent CLI Integration services
import { DevAgentPipelineExecutorService } from './services/dev-agent-pipeline-executor.service';
import { DevAgentGitOpsService } from './services/dev-agent-git-ops.service';
import { DevAgentTestExtractorService } from './services/dev-agent-test-extractor.service';
import { DevAgentPRCreatorService } from './services/dev-agent-pr-creator.service';
// Story 11.5: QA Agent CLI Integration services
import { QAAgentPipelineExecutorService } from './services/qa-agent-pipeline-executor.service';
import { QATestRunnerService } from './services/qa-test-runner.service';
import { QAStaticAnalyzerService } from './services/qa-static-analyzer.service';
import { QASecurityScannerService } from './services/qa-security-scanner.service';
import { QAAcceptanceCriteriaValidatorService } from './services/qa-acceptance-validator.service';
import { QAReportGeneratorService } from './services/qa-report-generator.service';
import { QAPRReviewerService } from './services/qa-pr-reviewer.service';
// Story 11.6: Planner Agent CLI Integration services
import { PlannerAgentPipelineExecutorService } from './services/planner-agent-pipeline-executor.service';
import { PlannerDocumentValidatorService } from './services/planner-document-validator.service';
import { PlannerSprintStatusUpdaterService } from './services/planner-sprint-status-updater.service';
import { PlannerGitOpsService } from './services/planner-git-ops.service';
// Story 11.7: DevOps Agent CLI Integration services
import { DevOpsAgentPipelineExecutorService } from './services/devops-agent-pipeline-executor.service';
import { DevOpsPRMergerService } from './services/devops-pr-merger.service';
import { DevOpsDeploymentTriggerService } from './services/devops-deployment-trigger.service';
import { DevOpsDeploymentMonitorService } from './services/devops-deployment-monitor.service';
import { DevOpsSmokeTestRunnerService } from './services/devops-smoke-test-runner.service';
import { DevOpsRollbackHandlerService } from './services/devops-rollback-handler.service';
// Story 11.8: Multi-Agent Handoff Chain services
import { HandoffCoordinatorService } from './services/handoff-coordinator.service';
import { HandoffContextAssemblerService } from './services/handoff-context-assembler.service';
import { CoordinationRulesEngineService } from './services/coordination-rules-engine.service';
import { StoryDependencyManagerService } from './services/story-dependency-manager.service';
import { HandoffQueueService } from './services/handoff-queue.service';
import { HandoffHistoryService } from './services/handoff-history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PipelineStateHistory, HandoffHistory]),
    forwardRef(() => AgentQueueModule),
    BYOKModule,
    CliSessionsModule,
    IntegrationsModule,
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
    // Story 11.4: Dev Agent CLI Integration services
    DevAgentPipelineExecutorService,
    DevAgentGitOpsService,
    DevAgentTestExtractorService,
    DevAgentPRCreatorService,
    // Story 11.5: QA Agent CLI Integration services
    QAAgentPipelineExecutorService,
    QATestRunnerService,
    QAStaticAnalyzerService,
    QASecurityScannerService,
    QAAcceptanceCriteriaValidatorService,
    QAReportGeneratorService,
    QAPRReviewerService,
    // Story 11.6: Planner Agent CLI Integration services
    PlannerAgentPipelineExecutorService,
    PlannerDocumentValidatorService,
    PlannerSprintStatusUpdaterService,
    PlannerGitOpsService,
    // Story 11.7: DevOps Agent CLI Integration services
    DevOpsAgentPipelineExecutorService,
    DevOpsPRMergerService,
    DevOpsDeploymentTriggerService,
    DevOpsDeploymentMonitorService,
    DevOpsSmokeTestRunnerService,
    DevOpsRollbackHandlerService,
    // Story 11.8: Multi-Agent Handoff Chain services
    HandoffCoordinatorService,
    HandoffContextAssemblerService,
    CoordinationRulesEngineService,
    StoryDependencyManagerService,
    HandoffQueueService,
    HandoffHistoryService,
  ],
  exports: [
    PipelineStateMachineService,
    CLISessionLifecycleService,
    PipelineJobHandlerService,
    DevAgentPipelineExecutorService,
    QAAgentPipelineExecutorService,
    PlannerAgentPipelineExecutorService,
    DevOpsAgentPipelineExecutorService,
    HandoffCoordinatorService,
  ],
})
export class OrchestratorModule {}
