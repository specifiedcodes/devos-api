/**
 * CircuitBreakerService Tests
 * Story 9.8: Agent Response Time Optimization
 *
 * Unit tests for timeout handling and circuit breaker pattern.
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  CircuitBreakerService,
  CircuitState,
  TimeoutContext,
} from './circuit-breaker.service';
import { ChatMetricsService } from './chat-metrics.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;
  let metricsService: jest.Mocked<ChatMetricsService>;

  beforeEach(async () => {
    const mockMetricsService = {
      recordError: jest.fn(),
      recordResponseTime: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        {
          provide: ChatMetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
    metricsService = module.get(ChatMetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.resetAll(); // Reset circuit breaker state
  });

  describe('withTimeout', () => {
    it('should return result if operation completes within timeout', async () => {
      const operation = () =>
        new Promise<string>((resolve) => setTimeout(() => resolve('success'), 50));
      const fallback = () => 'fallback';

      const result = await service.withTimeout(operation(), 1000, fallback);

      expect(result).toBe('success');
    });

    it('should return fallback if operation times out', async () => {
      const operation = () =>
        new Promise<string>((resolve) => setTimeout(() => resolve('success'), 2000));
      const fallback = () => 'timeout-fallback';

      const result = await service.withTimeout(operation(), 100, fallback);

      expect(result).toBe('timeout-fallback');
    });

    it('should record timeout in metrics', async () => {
      const operation = () =>
        new Promise<string>((resolve) => setTimeout(() => resolve('success'), 2000));
      const fallback = () => 'fallback';

      await service.withTimeout(operation(), 100, fallback);

      expect(metricsService.recordError).toHaveBeenCalledWith('timeout');
    });
  });

  describe('execute', () => {
    it('should execute operation when circuit is closed', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const fallback = jest.fn().mockReturnValue('fallback');

      const result = await service.execute('agent-123', operation, fallback);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should use fallback when circuit is open', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const fallback = jest.fn().mockReturnValue('fallback');

      // Force circuit to open state
      service.forceOpen('agent-123');

      const result = await service.execute('agent-123', operation, fallback);

      expect(result).toBe('fallback');
      expect(operation).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
    });

    it('should open circuit after failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fail'));
      const fallback = jest.fn().mockReturnValue('fallback');

      // Execute multiple failing operations (threshold is 5)
      for (let i = 0; i < 5; i++) {
        await service.execute('agent-123', operation, fallback);
      }

      const state = service.getState('agent-123');
      expect(state).toBe(CircuitState.OPEN);
    });

    it('should record success and reset failure count', async () => {
      const failingOp = jest.fn().mockRejectedValue(new Error('fail'));
      const successOp = jest.fn().mockResolvedValue('success');
      const fallback = jest.fn().mockReturnValue('fallback');

      // Some failures
      for (let i = 0; i < 3; i++) {
        await service.execute('agent-123', failingOp, fallback);
      }

      // Then success
      await service.execute('agent-123', successOp, fallback);

      // Circuit should still be closed (failures reset)
      const state = service.getState('agent-123');
      expect(state).toBe(CircuitState.CLOSED);
    });
  });

  describe('handleTimeout', () => {
    it('should return graceful message for chat timeout', async () => {
      const context: TimeoutContext = {
        requestId: 'req-123',
        requestType: 'chat',
        agentId: 'agent-123',
        timeoutMs: 10000,
      };

      const response = await service.handleTimeout(context);

      expect(response.type).toBe('graceful');
      expect(response.message).toContain('processing');
      expect(response.willRetry).toBe(true);
    });

    it('should return partial response for stream timeout', async () => {
      const context: TimeoutContext = {
        requestId: 'req-123',
        requestType: 'stream',
        agentId: 'agent-123',
        timeoutMs: 5000,
        partialData: 'Partial response so far...',
      };

      const response = await service.handleTimeout(context);

      expect(response.type).toBe('partial');
      expect(response.message).toContain('Partial');
    });

    it('should return cached fallback for status timeout', async () => {
      const context: TimeoutContext = {
        requestId: 'req-123',
        requestType: 'status',
        agentId: 'agent-123',
        timeoutMs: 5000,
      };

      const response = await service.handleTimeout(context);

      expect(response.type).toBe('cached');
    });
  });

  describe('circuit state transitions', () => {
    it('should transition from CLOSED to OPEN after failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fail'));
      const fallback = jest.fn().mockReturnValue('fallback');

      expect(service.getState('agent-123')).toBe(CircuitState.CLOSED);

      // Trigger threshold failures
      for (let i = 0; i < 5; i++) {
        await service.execute('agent-123', operation, fallback);
      }

      expect(service.getState('agent-123')).toBe(CircuitState.OPEN);
    });

    it('should transition from OPEN to HALF_OPEN after reset timeout', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fail'));
      const fallback = jest.fn().mockReturnValue('fallback');

      // Force circuit open
      for (let i = 0; i < 5; i++) {
        await service.execute('agent-123', operation, fallback);
      }

      // Simulate reset timeout passing
      service.simulateResetTimeout('agent-123');

      expect(service.getState('agent-123')).toBe(CircuitState.HALF_OPEN);
    });

    it('should transition from HALF_OPEN to CLOSED after multiple successes', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const fallback = jest.fn().mockReturnValue('fallback');

      // Force half-open state
      service.forceHalfOpen('agent-123');

      // Circuit breaker requires halfOpenMaxRequests (3) successful test requests
      // before transitioning to CLOSED state
      await service.execute('agent-123', operation, fallback);
      expect(service.getState('agent-123')).toBe(CircuitState.HALF_OPEN);

      await service.execute('agent-123', operation, fallback);
      expect(service.getState('agent-123')).toBe(CircuitState.HALF_OPEN);

      await service.execute('agent-123', operation, fallback);
      expect(service.getState('agent-123')).toBe(CircuitState.CLOSED);
    });

    it('should transition from HALF_OPEN to OPEN on failure', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fail'));
      const fallback = jest.fn().mockReturnValue('fallback');

      // Force half-open state
      service.forceHalfOpen('agent-123');

      await service.execute('agent-123', operation, fallback);

      expect(service.getState('agent-123')).toBe(CircuitState.OPEN);
    });
  });

  describe('recordTimeout', () => {
    it('should record timeout and increment failure count', () => {
      service.recordTimeout('agent-123', 'chat');

      // Should count as a failure
      const failureCount = service.getFailureCount('agent-123');
      expect(failureCount).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return circuit breaker statistics', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const fallback = jest.fn().mockReturnValue('fallback');

      // Execute some operations
      await service.execute('agent-123', operation, fallback);
      await service.execute('agent-456', operation, fallback);

      const stats = service.getStats();

      expect(stats).toHaveProperty('totalCircuits');
      expect(stats).toHaveProperty('openCircuits');
      expect(stats).toHaveProperty('halfOpenCircuits');
    });
  });

  describe('resetAll', () => {
    it('should reset all circuit breakers', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fail'));
      const fallback = jest.fn().mockReturnValue('fallback');

      // Create some open circuits
      for (let i = 0; i < 5; i++) {
        await service.execute('agent-1', operation, fallback);
        await service.execute('agent-2', operation, fallback);
      }

      service.resetAll();

      expect(service.getState('agent-1')).toBe(CircuitState.CLOSED);
      expect(service.getState('agent-2')).toBe(CircuitState.CLOSED);
    });
  });
});
