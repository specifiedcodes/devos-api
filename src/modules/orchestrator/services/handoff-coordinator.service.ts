/**
 * HandoffCoordinatorService
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Central coordination service for agent-to-agent handoffs in the BMAD pipeline.
 * Orchestrates:
 * 1. Handoff chain routing (Planner -> Dev -> QA -> DevOps -> Complete)
 * 2. Context assembly between agents
 * 3. Coordination rule validation
 * 4. Story dependency management
 * 5. Handoff queue management
 * 6. Audit trail recording
 * 7. Real-time WebSocket event emission
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HandoffContextAssemblerService } from './handoff-context-assembler.service';
import { CoordinationRulesEngineService } from './coordination-rules-engine.service';
import { StoryDependencyManagerService } from './story-dependency-manager.service';
import { HandoffQueueService } from './handoff-queue.service';
import { HandoffHistoryService } from './handoff-history.service';
import { PipelineStateStore } from './pipeline-state-store.service';
import {
  HandoffParams,
  HandoffResult,
  QARejectionParams,
  StoryDependencyCheckParams,
  CoordinationStatus,
  ActiveAgentInfo,
  HANDOFF_CHAIN,
  QA_REJECTION_CHAIN_ENTRY,
  DEFAULT_MAX_PARALLEL_AGENTS,
  DEFAULT_MAX_QA_ITERATIONS,
  PlannerToDevHandoff,
  DevToQAHandoff,
  QAToDevOpsHandoff,
  DevOpsCompletionHandoff,
  HandoffEvent,
  StoryProgressEvent,
  StoryBlockedEvent,
  QARejectionEvent,
  EscalationEvent,
} from '../interfaces/handoff.interfaces';

@Injectable()
export class HandoffCoordinatorService {
  private readonly logger = new Logger(HandoffCoordinatorService.name);

  constructor(
    private readonly contextAssembler: HandoffContextAssemblerService,
    private readonly rulesEngine: CoordinationRulesEngineService,
    private readonly depManager: StoryDependencyManagerService,
    private readonly queueService: HandoffQueueService,
    private readonly historyService: HandoffHistoryService,
    private readonly stateStore: PipelineStateStore,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Process a phase completion and initiate the next agent handoff.
   * Called by PipelineStateMachineService.onPhaseComplete().
   */
  async processHandoff(params: HandoffParams): Promise<HandoffResult> {
    const startTime = Date.now();

    try {
      // 1. Determine next agent via HANDOFF_CHAIN constant
      const chainEntry = HANDOFF_CHAIN[params.completingAgentType];
      if (!chainEntry) {
        this.logger.warn(
          `No handoff chain entry for agent type: ${params.completingAgentType}`,
        );
        return {
          success: false,
          nextAgentType: null,
          nextPhase: null,
          handoffContext: {},
          queued: false,
          queuePosition: null,
          error: `Unrecognized agent type: ${params.completingAgentType}`,
        };
      }

      // 2. Check story dependencies
      const blockingStories = await this.depManager.getBlockingStories({
        workspaceId: params.workspaceId,
        storyId: params.storyId,
      });

      if (blockingStories.length > 0) {
        // Emit story_blocked event
        const blockedEvent: StoryBlockedEvent = {
          type: 'orchestrator:story_blocked',
          workspaceId: params.workspaceId,
          storyId: params.storyId,
          blockedBy: blockingStories,
          reason: `Blocked by stories: ${blockingStories.join(', ')}`,
          timestamp: new Date(),
        };
        this.eventEmitter.emit('orchestrator:story_blocked', blockedEvent);

        return {
          success: false,
          nextAgentType: chainEntry.toAgentType,
          nextPhase: chainEntry.toPhase,
          handoffContext: {},
          queued: true,
          queuePosition: null,
          error: `Story blocked by: ${blockingStories.join(', ')}`,
        };
      }

      // 3. Assemble handoff context
      const handoffContext = this.assembleContext(
        params.completingAgentType,
        params.phaseResult,
        params.pipelineMetadata,
      );

      // 4. Get current active agents for rule validation
      const activeAgents = await this.getActiveAgents(params.workspaceId);

      // 5. Validate coordination rules
      const ruleResult = await this.rulesEngine.validateHandoff({
        workspaceId: params.workspaceId,
        storyId: params.storyId,
        fromAgentType: params.completingAgentType,
        toAgentType: chainEntry.toAgentType,
        currentActiveAgents: activeAgents,
        qaVerdict: params.pipelineMetadata?.qaVerdict,
        completingAgentId: params.completingAgentId,
      });

      // 6. If violations with severity 'error'
      if (!ruleResult.allowed) {
        const isMaxAgents = ruleResult.violations.some(
          (v) => v.rule === 'max-parallel-agents',
        );

        if (isMaxAgents) {
          // Queue the handoff
          const queueId = await this.queueService.enqueueHandoff({
            workspaceId: params.workspaceId,
            handoff: params,
            priority: 2, // Default priority for new handoffs
          });

          return {
            success: false,
            nextAgentType: chainEntry.toAgentType,
            nextPhase: chainEntry.toPhase,
            handoffContext,
            queued: true,
            queuePosition: null,
            error: `Handoff queued (${queueId}): max parallel agents reached`,
          };
        }

        // Other rule violations
        const errorDescriptions = ruleResult.violations
          .filter((v) => v.severity === 'error')
          .map((v) => v.description);

        return {
          success: false,
          nextAgentType: null,
          nextPhase: null,
          handoffContext: {},
          queued: false,
          queuePosition: null,
          error: `Coordination violations: ${errorDescriptions.join('; ')}`,
        };
      }

      // 7. Emit orchestrator:handoff event
      const handoffEvent: HandoffEvent = {
        type: 'orchestrator:handoff',
        workspaceId: params.workspaceId,
        storyId: params.storyId,
        fromAgent: {
          type: params.completingAgentType,
          id: params.completingAgentId,
        },
        toAgent: {
          type: chainEntry.toAgentType,
          id: '', // Will be assigned by pipeline
        },
        handoffContext,
        timestamp: new Date(),
      };
      this.eventEmitter.emit('orchestrator:handoff', handoffEvent);

      // 8. Emit orchestrator:story_progress event
      const progressEvent: StoryProgressEvent = {
        type: 'orchestrator:story_progress',
        workspaceId: params.workspaceId,
        storyId: params.storyId,
        storyTitle: params.storyTitle,
        previousPhase: chainEntry.fromPhase,
        newPhase: chainEntry.toPhase,
        agentType: chainEntry.toAgentType,
        timestamp: new Date(),
      };
      this.eventEmitter.emit('orchestrator:story_progress', progressEvent);

      // 9. Record handoff in history
      const durationMs = Date.now() - startTime;
      await this.historyService.recordHandoff({
        workspaceId: params.workspaceId,
        storyId: params.storyId,
        fromAgentType: params.completingAgentType,
        fromAgentId: params.completingAgentId,
        toAgentType: chainEntry.toAgentType,
        toAgentId: '', // Assigned by pipeline
        fromPhase: chainEntry.fromPhase,
        toPhase: chainEntry.toPhase,
        handoffType:
          chainEntry.toAgentType === 'complete' ? 'completion' : 'normal',
        contextSummary: `${params.completingAgentType} -> ${chainEntry.toAgentType} for story ${params.storyId}`,
        iterationCount: 0,
        durationMs,
        metadata: { handoffContext },
      });

      // 10. If DevOps completion -> mark story complete and process dependencies
      if (params.completingAgentType === 'devops') {
        await this.depManager.markStoryComplete({
          workspaceId: params.workspaceId,
          storyId: params.storyId,
        });
      }

      // 11. Return success result
      return {
        success: true,
        nextAgentType: chainEntry.toAgentType,
        nextPhase: chainEntry.toPhase,
        handoffContext,
        queued: false,
        queuePosition: null,
        error: null,
      };
    } catch (error) {
      this.logger.error(
        `Handoff processing failed for story ${params.storyId}`,
        error,
      );
      return {
        success: false,
        nextAgentType: null,
        nextPhase: null,
        handoffContext: {},
        queued: false,
        queuePosition: null,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown handoff processing error',
      };
    }
  }

  /**
   * Handle a QA rejection by routing back to Dev Agent with feedback.
   */
  async processQARejection(
    params: QARejectionParams,
  ): Promise<HandoffResult> {
    const startTime = Date.now();

    try {
      // 1. Check iteration count against limit
      if (params.iterationCount > DEFAULT_MAX_QA_ITERATIONS) {
        // Emit escalation event
        const escalationEvent: EscalationEvent = {
          type: 'orchestrator:escalation',
          workspaceId: params.workspaceId,
          storyId: params.storyId,
          reason: `QA rejection cycle exceeded limit (${params.iterationCount}/${DEFAULT_MAX_QA_ITERATIONS})`,
          iterationCount: params.iterationCount,
          lastQAReport:
            params.qaResult?.qaReport?.summary || 'No report available',
          timestamp: new Date(),
        };
        this.eventEmitter.emit('orchestrator:escalation', escalationEvent);

        // Record escalation in history
        const durationMs = Date.now() - startTime;
        await this.historyService.recordHandoff({
          workspaceId: params.workspaceId,
          storyId: params.storyId,
          fromAgentType: 'qa',
          fromAgentId: '',
          toAgentType: 'user',
          toAgentId: '',
          fromPhase: 'qa',
          toPhase: 'paused',
          handoffType: 'escalation',
          contextSummary: `QA rejection escalated after ${params.iterationCount} iterations`,
          iterationCount: params.iterationCount,
          durationMs,
          metadata: { qaResult: params.qaResult },
        });

        return {
          success: false,
          nextAgentType: null,
          nextPhase: null,
          handoffContext: {},
          queued: false,
          queuePosition: null,
          error: `QA rejection cycle escalated to user after ${params.iterationCount} iterations`,
        };
      }

      // 2. Assemble rejection context
      const rejectionContext =
        this.contextAssembler.assembleQAToDevRejectionContext(
          params.qaResult,
          {
            ...params.previousMetadata,
            iterationCount: params.iterationCount,
          },
        );

      // 3. Emit qa_rejection event
      const rejectionEvent: QARejectionEvent = {
        type: 'orchestrator:qa_rejection',
        workspaceId: params.workspaceId,
        storyId: params.storyId,
        qaVerdict: params.qaResult?.verdict || 'FAIL',
        iterationCount: params.iterationCount,
        maxIterations: DEFAULT_MAX_QA_ITERATIONS,
        feedback:
          params.qaResult?.qaReport?.summary || 'No feedback available',
        timestamp: new Date(),
      };
      this.eventEmitter.emit('orchestrator:qa_rejection', rejectionEvent);

      // 4. Record rejection in history
      const durationMs = Date.now() - startTime;
      await this.historyService.recordHandoff({
        workspaceId: params.workspaceId,
        storyId: params.storyId,
        fromAgentType: 'qa',
        fromAgentId: '',
        toAgentType: 'dev',
        toAgentId: '',
        fromPhase: QA_REJECTION_CHAIN_ENTRY.fromPhase,
        toPhase: QA_REJECTION_CHAIN_ENTRY.toPhase,
        handoffType: 'rejection',
        contextSummary: `QA rejected (iteration ${params.iterationCount}): ${params.qaResult?.qaReport?.summary || 'No summary'}`,
        iterationCount: params.iterationCount,
        durationMs,
        metadata: { rejectionContext },
      });

      // 5. Return success routing to Dev Agent
      return {
        success: true,
        nextAgentType: 'dev',
        nextPhase: QA_REJECTION_CHAIN_ENTRY.toPhase,
        handoffContext: rejectionContext as Record<string, any>,
        queued: false,
        queuePosition: null,
        error: null,
      };
    } catch (error) {
      this.logger.error(
        `QA rejection processing failed for story ${params.storyId}`,
        error,
      );
      return {
        success: false,
        nextAgentType: null,
        nextPhase: null,
        handoffContext: {},
        queued: false,
        queuePosition: null,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown QA rejection processing error',
      };
    }
  }

  /**
   * Check if a story is blocked by dependencies and queue if needed.
   * Returns true if story can proceed, false if blocked.
   */
  async checkStoryDependencies(
    params: StoryDependencyCheckParams,
  ): Promise<boolean> {
    const blocking = await this.depManager.getBlockingStories({
      workspaceId: params.workspaceId,
      storyId: params.storyId,
    });
    return blocking.length === 0;
  }

  /**
   * Process the next queued handoff when agent capacity is available.
   * Called by PipelineStateMachineService.onAgentSlotFreed().
   */
  async processNextInQueue(
    workspaceId: string,
  ): Promise<HandoffResult | null> {
    try {
      const handoffParams =
        await this.queueService.processNextInQueue(workspaceId);
      if (!handoffParams) {
        return null;
      }

      this.logger.log(
        `Processing queued handoff for story ${handoffParams.storyId} in workspace ${workspaceId}`,
      );

      return this.processHandoff(handoffParams);
    } catch (error) {
      this.logger.error(
        `Failed to process queued handoff for workspace ${workspaceId}`,
        error,
      );
      return null;
    }
  }

  /**
   * Get current coordination status for a workspace.
   */
  async getCoordinationStatus(
    workspaceId: string,
  ): Promise<CoordinationStatus> {
    // Get active pipelines from state store
    const activePipelines =
      await this.stateStore.listActivePipelines(workspaceId);

    // Map to ActiveAgentInfo
    const activeHandoffs: ActiveAgentInfo[] = activePipelines
      .filter((p) => p.activeAgentId && p.activeAgentType)
      .map((p) => ({
        agentId: p.activeAgentId!,
        agentType: p.activeAgentType!,
        storyId: p.currentStoryId || '',
        phase: p.currentState,
        startedAt: p.stateEnteredAt,
      }));

    // Get queue depth
    const queuedHandoffs = await this.queueService.getQueueDepth(workspaceId);

    // Get blocked stories from dependency graph
    let blockedStories: string[] = [];
    try {
      const depGraph =
        await this.depManager.getDependencyGraph(workspaceId);
      blockedStories = depGraph.blockedStories;
    } catch (error) {
      this.logger.warn(
        `Failed to get dependency graph for workspace ${workspaceId}`,
        error,
      );
    }

    return {
      activeHandoffs,
      blockedStories,
      activeAgents: activeHandoffs.length,
      maxAgents: DEFAULT_MAX_PARALLEL_AGENTS,
      queuedHandoffs,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Assemble handoff context based on completing agent type.
   * Returns a strongly-typed handoff context union spread as Record.
   */
  private assembleContext(
    completingAgentType: string,
    phaseResult: Record<string, any>,
    metadata: Record<string, any>,
  ): PlannerToDevHandoff | DevToQAHandoff | QAToDevOpsHandoff | DevOpsCompletionHandoff | Record<string, any> {
    switch (completingAgentType) {
      case 'planner':
        return this.contextAssembler.assemblePlannerToDevContext(
          phaseResult,
          metadata,
        );
      case 'dev':
        return this.contextAssembler.assembleDevToQAContext(
          phaseResult,
          metadata,
        );
      case 'qa':
        return this.contextAssembler.assembleQAToDevOpsContext(
          phaseResult,
          metadata,
        );
      case 'devops':
        return this.contextAssembler.assembleDevOpsCompletionContext(
          phaseResult,
          metadata,
        );
      default:
        return {};
    }
  }

  /**
   * Get list of active agents from pipeline state store.
   */
  private async getActiveAgents(
    workspaceId: string,
  ): Promise<ActiveAgentInfo[]> {
    const pipelines =
      await this.stateStore.listActivePipelines(workspaceId);

    return pipelines
      .filter((p) => p.activeAgentId && p.activeAgentType)
      .map((p) => ({
        agentId: p.activeAgentId!,
        agentType: p.activeAgentType!,
        storyId: p.currentStoryId || '',
        phase: p.currentState,
        startedAt: p.stateEnteredAt,
      }));
  }
}
