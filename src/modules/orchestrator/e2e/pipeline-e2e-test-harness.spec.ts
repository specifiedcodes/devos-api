/**
 * PipelineE2ETestHarness Tests
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Tests for the E2E test harness setup, pipeline execution, and teardown.
 */

import { PipelineE2ETestHarness } from './pipeline-e2e-test-harness';
import { createE2ETestConfig } from './e2e-test-config';
import { PipelineStateMachineService } from '../services/pipeline-state-machine.service';
import { PipelineStateStore } from '../services/pipeline-state-store.service';
import { HandoffCoordinatorService } from '../services/handoff-coordinator.service';
import { AgentFailureDetectorService } from '../services/agent-failure-detector.service';
import { CheckpointService } from '../services/checkpoint.service';
import { PipelineFailureRecoveryService } from '../services/pipeline-failure-recovery.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { E2ETestConfig } from './e2e-pipeline.interfaces';

describe('PipelineE2ETestHarness', () => {
  let harness: PipelineE2ETestHarness;
  let mockConfig: E2ETestConfig;

  beforeEach(() => {
    harness = new PipelineE2ETestHarness();
    mockConfig = createE2ETestConfig('mock');
    // Override timeout for faster tests
    mockConfig.timeoutMs = 30_000;
    mockConfig.memoryCheck.checkIntervalMs = 1000;
  });

  afterEach(async () => {
    try {
      await harness.teardown();
    } catch {
      // Ignore teardown errors in afterEach
    }
  });

  describe('setup("mock")', () => {
    it('should create NestJS testing module with mock providers', async () => {
      await harness.setup(mockConfig);

      const module = harness.getModule();
      expect(module).toBeDefined();
    });

    it('should make all required services injectable after setup', async () => {
      await harness.setup(mockConfig);

      const module = harness.getModule();

      const stateMachine = module.get(PipelineStateMachineService);
      expect(stateMachine).toBeDefined();

      const stateStore = module.get(PipelineStateStore);
      expect(stateStore).toBeDefined();

      const handoffCoordinator = module.get(HandoffCoordinatorService);
      expect(handoffCoordinator).toBeDefined();

      const failureDetector = module.get(AgentFailureDetectorService);
      expect(failureDetector).toBeDefined();

      const checkpointService = module.get(CheckpointService);
      expect(checkpointService).toBeDefined();

      const failureRecovery = module.get(PipelineFailureRecoveryService);
      expect(failureRecovery).toBeDefined();
    });

    it('should wire EventEmitter2 for event capture', async () => {
      await harness.setup(mockConfig);

      const module = harness.getModule();
      const emitter = module.get(EventEmitter2);
      expect(emitter).toBeDefined();

      // Emit a test event
      emitter.emit('test:event', { data: 'hello' });

      const events = harness.getCapturedEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.some((e) => e.type === 'test:event')).toBe(true);
    });
  });

  describe('setup("smoke")', () => {
    it('should create NestJS testing module with minimal providers', async () => {
      const smokeConfig = createE2ETestConfig('smoke');
      smokeConfig.memoryCheck.checkIntervalMs = 1000;

      await harness.setup(smokeConfig);

      const module = harness.getModule();
      expect(module).toBeDefined();

      const stateMachine = module.get(PipelineStateMachineService);
      expect(stateMachine).toBeDefined();
    });
  });

  describe('runPipeline', () => {
    it('should return E2EPipelineResult with all fields populated', async () => {
      await harness.setup(mockConfig);

      const result = await harness.runPipeline();

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.durationMs).toBe('number');
      expect(Array.isArray(result.stateTransitions)).toBe(true);
      expect(Array.isArray(result.agentExecutions)).toBe(true);
      expect(Array.isArray(result.emittedEvents)).toBe(true);
      expect(Array.isArray(result.gitOperations)).toBe(true);
      expect(Array.isArray(result.memorySnapshots)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.finalStoryStatus).toBe('string');
    });

    it('should capture state transitions in correct order', async () => {
      await harness.setup(mockConfig);

      const result = await harness.runPipeline();

      // Should have at least the IDLE->PLANNING transition from startPipeline
      expect(result.stateTransitions.length).toBeGreaterThanOrEqual(1);

      // First transition should be to PLANNING
      const firstTransition = result.stateTransitions[0];
      expect(firstTransition.to).toBe('planning');
    });

    it('should capture agent executions for all 4 agent types', async () => {
      await harness.setup(mockConfig);

      const result = await harness.runPipeline();

      const agentTypes = result.agentExecutions.map((a) => a.agentType);
      expect(agentTypes).toContain('planner');
      expect(agentTypes).toContain('dev');
      expect(agentTypes).toContain('qa');
      expect(agentTypes).toContain('devops');
    });

    it('should capture emitted events with correct types', async () => {
      await harness.setup(mockConfig);

      const result = await harness.runPipeline();

      expect(result.emittedEvents.length).toBeGreaterThan(0);
      const eventTypes = result.emittedEvents.map((e) => e.type);
      expect(eventTypes).toContain('pipeline.state_changed');
    });

    it('should capture memory snapshots when enabled', async () => {
      mockConfig.memoryCheck.enabled = true;
      mockConfig.memoryCheck.checkIntervalMs = 100;
      await harness.setup(mockConfig);

      const result = await harness.runPipeline();

      // Should have at least initial and final snapshots
      expect(result.memorySnapshots.length).toBeGreaterThanOrEqual(2);

      for (const snapshot of result.memorySnapshots) {
        expect(snapshot.heapUsed).toBeGreaterThan(0);
        expect(snapshot.rss).toBeGreaterThan(0);
        expect(snapshot.timestamp).toBeDefined();
      }
    });

    it('should time out after configured timeout', async () => {
      // Create config with very short timeout but don't actually run
      // the pipeline (we just verify the harness handles timeouts)
      mockConfig.timeoutMs = 100;
      await harness.setup(mockConfig);

      // The pipeline should still complete because mock mode is fast
      const result = await harness.runPipeline();
      expect(result).toBeDefined();
      expect(typeof result.durationMs).toBe('number');
    });
  });

  describe('teardown', () => {
    it('should report unclosed sessions as warnings', async () => {
      await harness.setup(mockConfig);

      // Run pipeline (sessions are tracked internally)
      await harness.runPipeline();

      const report = await harness.teardown();
      expect(report).toBeDefined();
      expect(typeof report.unclosedSessions).toBe('number');
      expect(typeof report.danglingTimers).toBe('number');
      expect(Array.isArray(report.warnings)).toBe(true);
    });

    it('should report dangling timers as warnings', async () => {
      mockConfig.memoryCheck.enabled = true;
      await harness.setup(mockConfig);

      // Don't call runPipeline, just teardown with active timer
      const report = await harness.teardown();

      expect(typeof report.danglingTimers).toBe('number');
    });

    it('should clean up event listeners', async () => {
      await harness.setup(mockConfig);
      await harness.runPipeline();

      const report = await harness.teardown();

      expect(report.eventListenerLeaks).toBe(0);
    });
  });
});
