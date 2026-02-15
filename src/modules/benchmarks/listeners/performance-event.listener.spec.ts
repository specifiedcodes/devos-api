/**
 * PerformanceEventListener Tests
 *
 * Story 13-8: Model Performance Benchmarks
 *
 * Tests for auto-recording baseline performance records from usage events.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PerformanceEventListener } from './performance-event.listener';
import { BenchmarkService } from '../services/benchmark.service';
import { CostUpdateEvent } from '../../usage/services/usage.service';

describe('PerformanceEventListener', () => {
  let listener: PerformanceEventListener;
  let benchmarkService: jest.Mocked<BenchmarkService>;

  const mockCostEvent: CostUpdateEvent = {
    workspaceId: 'ws-1',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    taskType: 'coding',
    costUsd: 0.045,
    inputTokens: 5000,
    outputTokens: 2000,
    cachedTokens: 0,
    monthlyTotal: 10.5,
    timestamp: '2026-02-16T12:00:00.000Z',
  };

  beforeEach(async () => {
    const mockBenchmarkService = {
      recordPerformance: jest.fn().mockResolvedValue({ id: 'uuid-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceEventListener,
        { provide: BenchmarkService, useValue: mockBenchmarkService },
      ],
    }).compile();

    listener = module.get<PerformanceEventListener>(PerformanceEventListener);
    benchmarkService = module.get(BenchmarkService);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  it('should create baseline performance record from cost event', async () => {
    await listener.handleCostUpdate(mockCostEvent);

    expect(benchmarkService.recordPerformance).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        model: 'claude-sonnet-4-5-20250929',
        provider: 'anthropic',
        taskType: 'coding',
        inputTokens: 5000,
        outputTokens: 2000,
        cost: 0.045,
      }),
    );
  });

  it('should set success to true for usage events', async () => {
    await listener.handleCostUpdate(mockCostEvent);

    expect(benchmarkService.recordPerformance).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        success: true,
      }),
    );
  });

  it('should set qualityScore to undefined (not available from event)', async () => {
    await listener.handleCostUpdate(mockCostEvent);

    const callArgs = benchmarkService.recordPerformance.mock.calls[0][1];
    // qualityScore is not provided in the DTO (undefined), which the service converts to null
    expect(callArgs.qualityScore).toBeUndefined();
  });

  it('should handle errors gracefully (does not throw)', async () => {
    benchmarkService.recordPerformance.mockRejectedValue(
      new Error('DB connection lost'),
    );

    // Should not throw
    await expect(
      listener.handleCostUpdate(mockCostEvent),
    ).resolves.not.toThrow();
  });

  it('should handle null taskType by defaulting to unknown', async () => {
    const eventWithNullTask: CostUpdateEvent = {
      ...mockCostEvent,
      taskType: null,
    };

    await listener.handleCostUpdate(eventWithNullTask);

    expect(benchmarkService.recordPerformance).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        taskType: 'unknown',
      }),
    );
  });

  it('should generate a requestId for the baseline record', async () => {
    await listener.handleCostUpdate(mockCostEvent);

    const callArgs = benchmarkService.recordPerformance.mock.calls[0][1];
    expect(callArgs.requestId).toBeDefined();
    expect(typeof callArgs.requestId).toBe('string');
    expect(callArgs.requestId.length).toBeGreaterThan(0);
  });

  it('should set latencyMs to 0 (not available from cost event)', async () => {
    await listener.handleCostUpdate(mockCostEvent);

    expect(benchmarkService.recordPerformance).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        latencyMs: 0,
      }),
    );
  });
});
