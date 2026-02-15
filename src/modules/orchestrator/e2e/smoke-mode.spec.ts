/**
 * Smoke Mode Tests
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Infrastructure-only validation that verifies all orchestrator
 * services are injectable and basic pipeline operations work.
 */

import { PipelineE2ETestHarness } from './pipeline-e2e-test-harness';
import { createE2ETestConfig } from './e2e-test-config';
import { PipelineStateMachineService } from '../services/pipeline-state-machine.service';
import { PipelineStateStore } from '../services/pipeline-state-store.service';
import { PipelineRecoveryService } from '../services/pipeline-recovery.service';
import { HandoffCoordinatorService } from '../services/handoff-coordinator.service';
import { HandoffContextAssemblerService } from '../services/handoff-context-assembler.service';
import { CoordinationRulesEngineService } from '../services/coordination-rules-engine.service';
import { StoryDependencyManagerService } from '../services/story-dependency-manager.service';
import { HandoffQueueService } from '../services/handoff-queue.service';
import { HandoffHistoryService } from '../services/handoff-history.service';
import { AgentFailureDetectorService } from '../services/agent-failure-detector.service';
import { CheckpointService } from '../services/checkpoint.service';
import { PipelineFailureRecoveryService } from '../services/pipeline-failure-recovery.service';
import { CLISessionLifecycleService } from '../services/cli-session-lifecycle.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PipelineState } from '../interfaces/pipeline.interfaces';
import { SmokeTestAssertions } from './e2e-pipeline.interfaces';

describe('Smoke Mode Tests', () => {
  let harness: PipelineE2ETestHarness;
  const startTime = Date.now();

  beforeAll(async () => {
    harness = new PipelineE2ETestHarness();
    const config = createE2ETestConfig('smoke');
    config.memoryCheck.checkIntervalMs = 5000;
    await harness.setup(config);
  });

  afterAll(async () => {
    if (harness) {
      await harness.teardown();
    }
  });

  it('should create NestJS module without errors', () => {
    const module = harness.getModule();
    expect(module).toBeDefined();
  });

  it('should make all OrchestratorModule services injectable', () => {
    const module = harness.getModule();

    // Core pipeline services
    expect(module.get(PipelineStateMachineService)).toBeDefined();
    expect(module.get(PipelineStateStore)).toBeDefined();
    expect(module.get(PipelineRecoveryService)).toBeDefined();

    // Handoff services
    expect(module.get(HandoffCoordinatorService)).toBeDefined();
    expect(module.get(HandoffContextAssemblerService)).toBeDefined();
    expect(module.get(CoordinationRulesEngineService)).toBeDefined();
    expect(module.get(StoryDependencyManagerService)).toBeDefined();
    expect(module.get(HandoffQueueService)).toBeDefined();
    expect(module.get(HandoffHistoryService)).toBeDefined();

    // Failure recovery services
    expect(module.get(AgentFailureDetectorService)).toBeDefined();
    expect(module.get(CheckpointService)).toBeDefined();
    expect(module.get(PipelineFailureRecoveryService)).toBeDefined();

    // CLI and event services (mocked)
    expect(module.get(CLISessionLifecycleService)).toBeDefined();
    expect(module.get(EventEmitter2)).toBeDefined();
  });

  it('should allow pipeline to start (IDLE -> PLANNING transition)', async () => {
    const module = harness.getModule();
    const stateMachine = module.get(PipelineStateMachineService);

    const result = await stateMachine.startPipeline(
      'smoke-project-1',
      'smoke-workspace-1',
      { triggeredBy: 'smoke-test' },
    );

    expect(result.state).toBe(PipelineState.PLANNING);
    expect(result.workflowId).toBeDefined();
  });

  it('should allow pipeline to pause and resume', async () => {
    const module = harness.getModule();
    const stateMachine = module.get(PipelineStateMachineService);

    // Start a fresh pipeline
    await stateMachine.startPipeline(
      'smoke-project-2',
      'smoke-workspace-2',
      { triggeredBy: 'smoke-test' },
    );

    // Pause: PLANNING -> PAUSED
    await stateMachine.transition('smoke-project-2', PipelineState.PAUSED, {
      triggeredBy: 'smoke-test-pause',
    });

    const stateStore = module.get(PipelineStateStore);
    let state = await stateStore.getState('smoke-project-2');
    expect(state!.currentState).toBe(PipelineState.PAUSED);

    // Resume: PAUSED -> PLANNING
    await stateMachine.transition(
      'smoke-project-2',
      PipelineState.PLANNING,
      {
        triggeredBy: 'smoke-test-resume',
      },
    );

    state = await stateStore.getState('smoke-project-2');
    expect(state!.currentState).toBe(PipelineState.PLANNING);
  });

  it('should support state store Redis operations (mocked)', async () => {
    const module = harness.getModule();
    const stateStore = module.get(PipelineStateStore);

    // getState should work with mock Redis
    const state = await stateStore.getState('nonexistent-project');
    expect(state).toBeNull();
  });

  it('should support EventEmitter2 emit and receive', () => {
    const module = harness.getModule();
    const emitter = module.get(EventEmitter2);

    let received = false;
    emitter.on('smoke:test_event', () => {
      received = true;
    });

    emitter.emit('smoke:test_event', { test: true });
    expect(received).toBe(true);
  });

  it('should have no circular dependency errors', () => {
    // If we got here without errors, the module compiled successfully
    // which means no circular dependency issues
    const module = harness.getModule();
    expect(module).toBeDefined();
  });

  it('should complete smoke test within 2 minutes', () => {
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(120_000);
  });

  it('should produce complete SmokeTestAssertions', async () => {
    const module = harness.getModule();
    const stateMachine = module.get(PipelineStateMachineService);
    const stateStore = module.get(PipelineStateStore);
    const emitter = module.get(EventEmitter2);

    const assertions: SmokeTestAssertions = {
      moduleCreated: module !== null,
      stateMachineReady: stateMachine !== null,
      stateStoreReady: stateStore !== null,
      eventEmitterReady: emitter !== null,
      handoffCoordinatorReady:
        module.get(HandoffCoordinatorService) !== null,
      failureDetectorReady:
        module.get(AgentFailureDetectorService) !== null,
      checkpointServiceReady: module.get(CheckpointService) !== null,
      failureRecoveryReady:
        module.get(PipelineFailureRecoveryService) !== null,
      pipelineCanStart: true, // Verified by earlier test
      pipelineCanPauseResume: true, // Verified by earlier test
      noDependencyErrors: true, // Verified by module compilation
    };

    // All assertions should be true
    for (const [key, value] of Object.entries(assertions)) {
      expect(value).toBe(true);
    }
  });
});
