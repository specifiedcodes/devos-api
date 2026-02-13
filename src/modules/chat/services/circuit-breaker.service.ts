/**
 * CircuitBreakerService
 * Story 9.8: Agent Response Time Optimization
 *
 * Implements timeout handling and circuit breaker pattern for agent responses.
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ChatMetricsService } from './chat-metrics.service';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

/**
 * Timeout context for fallback handling
 */
export interface TimeoutContext {
  requestId: string;
  requestType: 'chat' | 'stream' | 'status';
  agentId: string;
  timeoutMs: number;
  partialData?: string;
}

/**
 * Fallback response structure
 */
export interface FallbackResponse {
  type: 'graceful' | 'partial' | 'cached' | 'error';
  message: string;
  originalRequestId: string;
  willRetry: boolean;
  retryAt?: Date;
  metadata: {
    timeoutMs: number;
    fallbackReason: string;
    cachedAt?: Date;
  };
}

/**
 * Circuit breaker state for an agent
 */
interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
  openedAt: number | null;
  halfOpenSuccessCount: number; // Track successful requests in HALF_OPEN state
}

/**
 * Circuit breaker configuration
 */
const CIRCUIT_CONFIG = {
  failureThreshold: 5,      // Open after 5 failures
  resetTimeout: 30000,       // 30s before trying again
  halfOpenMaxRequests: 3,    // Test requests in half-open
};

/**
 * Timeout thresholds (ms)
 */
const TIMEOUT_THRESHOLDS = {
  chat: 10000,       // 10s for chat responses
  stream: 3000,      // 3s to start streaming
  status: 5000,      // 5s for status queries
};

/**
 * Fallback messages
 */
const FALLBACK_MESSAGES = {
  chat: "I'm still processing your request. This is taking longer than expected. Please wait...",
  stream: 'Response was partially received. ',
  status: 'Unable to get current status. Using cached information.',
};

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits: Map<string, CircuitBreakerState> = new Map();

  constructor(
    @Inject(forwardRef(() => ChatMetricsService))
    private readonly metricsService: ChatMetricsService,
  ) {}

  /**
   * Execute operation with timeout
   */
  async withTimeout<T>(
    operation: Promise<T>,
    timeout: number,
    fallback: () => T,
  ): Promise<T> {
    return Promise.race([
      operation,
      new Promise<T>((_, reject) =>
        setTimeout(() => {
          this.metricsService.recordError('timeout');
          reject(new Error('Operation timed out'));
        }, timeout),
      ),
    ]).catch(() => {
      return fallback();
    });
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    agentId: string,
    operation: () => Promise<T>,
    fallback: () => T,
  ): Promise<T> {
    const circuit = this.getOrCreateCircuit(agentId);

    // Check current state
    if (circuit.state === CircuitState.OPEN) {
      // Check if reset timeout has passed
      if (this.shouldAttemptReset(circuit)) {
        this.transitionTo(agentId, CircuitState.HALF_OPEN);
      } else {
        this.logger.debug(`Circuit open for ${agentId}, using fallback`);
        return fallback();
      }
    }

    try {
      const result = await operation();
      this.recordSuccess(agentId);
      return result;
    } catch (error: any) {
      this.recordFailure(agentId);
      this.logger.warn(`Operation failed for ${agentId}: ${error.message}`);
      return fallback();
    }
  }

  /**
   * Handle timeout with appropriate fallback strategy
   */
  async handleTimeout(context: TimeoutContext): Promise<FallbackResponse> {
    const { requestId, requestType, agentId, timeoutMs, partialData } = context;

    // Record timeout in metrics
    this.recordTimeout(agentId, requestType);

    switch (requestType) {
      case 'chat':
        return {
          type: 'graceful',
          message: FALLBACK_MESSAGES.chat,
          originalRequestId: requestId,
          willRetry: true,
          retryAt: new Date(Date.now() + 5000),
          metadata: {
            timeoutMs,
            fallbackReason: 'chat_timeout',
          },
        };

      case 'stream':
        return {
          type: 'partial',
          message: FALLBACK_MESSAGES.stream + (partialData || ''),
          originalRequestId: requestId,
          willRetry: false,
          metadata: {
            timeoutMs,
            fallbackReason: 'stream_timeout',
          },
        };

      case 'status':
        return {
          type: 'cached',
          message: FALLBACK_MESSAGES.status,
          originalRequestId: requestId,
          willRetry: true,
          metadata: {
            timeoutMs,
            fallbackReason: 'status_timeout',
            cachedAt: new Date(),
          },
        };

      default:
        return {
          type: 'error',
          message: 'Request timed out',
          originalRequestId: requestId,
          willRetry: false,
          metadata: {
            timeoutMs,
            fallbackReason: 'unknown_timeout',
          },
        };
    }
  }

  /**
   * Record timeout as a failure
   */
  recordTimeout(agentId: string, type: string): void {
    this.recordFailure(agentId);
    this.metricsService.recordError(`timeout_${type}`);
  }

  /**
   * Get current circuit state for an agent
   */
  getState(agentId: string): CircuitState {
    const circuit = this.circuits.get(agentId);
    return circuit?.state || CircuitState.CLOSED;
  }

  /**
   * Get failure count for an agent
   */
  getFailureCount(agentId: string): number {
    const circuit = this.circuits.get(agentId);
    return circuit?.failureCount || 0;
  }

  /**
   * Get overall circuit breaker statistics
   */
  getStats(): {
    totalCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    closedCircuits: number;
  } {
    let open = 0;
    let halfOpen = 0;
    let closed = 0;

    for (const circuit of this.circuits.values()) {
      switch (circuit.state) {
        case CircuitState.OPEN:
          open++;
          break;
        case CircuitState.HALF_OPEN:
          halfOpen++;
          break;
        case CircuitState.CLOSED:
          closed++;
          break;
      }
    }

    return {
      totalCircuits: this.circuits.size,
      openCircuits: open,
      halfOpenCircuits: halfOpen,
      closedCircuits: closed,
    };
  }

  /**
   * Force circuit to open state (for testing)
   */
  forceOpen(agentId: string): void {
    const circuit = this.getOrCreateCircuit(agentId);
    circuit.state = CircuitState.OPEN;
    circuit.openedAt = Date.now();
  }

  /**
   * Force circuit to half-open state (for testing)
   */
  forceHalfOpen(agentId: string): void {
    const circuit = this.getOrCreateCircuit(agentId);
    circuit.state = CircuitState.HALF_OPEN;
  }

  /**
   * Simulate reset timeout passing (for testing)
   */
  simulateResetTimeout(agentId: string): void {
    const circuit = this.getOrCreateCircuit(agentId);
    if (circuit.state === CircuitState.OPEN) {
      circuit.openedAt = Date.now() - CIRCUIT_CONFIG.resetTimeout - 1;
      if (this.shouldAttemptReset(circuit)) {
        this.transitionTo(agentId, CircuitState.HALF_OPEN);
      }
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.circuits.clear();
    this.logger.log('All circuit breakers reset');
  }

  /**
   * Reset specific circuit breaker
   */
  reset(agentId: string): void {
    this.circuits.delete(agentId);
    this.logger.log(`Circuit breaker reset for ${agentId}`);
  }

  /**
   * Get or create circuit breaker state for agent
   */
  private getOrCreateCircuit(agentId: string): CircuitBreakerState {
    let circuit = this.circuits.get(agentId);
    if (!circuit) {
      circuit = {
        state: CircuitState.CLOSED,
        failureCount: 0,
        lastFailureTime: null,
        openedAt: null,
        halfOpenSuccessCount: 0,
      };
      this.circuits.set(agentId, circuit);
    }
    return circuit;
  }

  /**
   * Record successful operation
   * In HALF_OPEN state, require multiple successes before closing
   */
  private recordSuccess(agentId: string): void {
    const circuit = this.getOrCreateCircuit(agentId);

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Increment half-open success count
      circuit.halfOpenSuccessCount++;

      this.logger.debug(
        `Half-open success ${circuit.halfOpenSuccessCount}/${CIRCUIT_CONFIG.halfOpenMaxRequests} for ${agentId}`,
      );

      // Only close circuit after required number of successful test requests
      if (circuit.halfOpenSuccessCount >= CIRCUIT_CONFIG.halfOpenMaxRequests) {
        this.transitionTo(agentId, CircuitState.CLOSED);
      }
    }

    // Reset failure count on success
    circuit.failureCount = 0;
  }

  /**
   * Record failed operation
   */
  private recordFailure(agentId: string): void {
    const circuit = this.getOrCreateCircuit(agentId);
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state opens the circuit
      this.transitionTo(agentId, CircuitState.OPEN);
    } else if (
      circuit.state === CircuitState.CLOSED &&
      circuit.failureCount >= CIRCUIT_CONFIG.failureThreshold
    ) {
      // Threshold reached, open the circuit
      this.transitionTo(agentId, CircuitState.OPEN);
    }
  }

  /**
   * Transition circuit to new state
   */
  private transitionTo(agentId: string, newState: CircuitState): void {
    const circuit = this.getOrCreateCircuit(agentId);
    const oldState = circuit.state;

    circuit.state = newState;

    if (newState === CircuitState.OPEN) {
      circuit.openedAt = Date.now();
      circuit.halfOpenSuccessCount = 0;
      this.logger.warn(`Circuit opened for ${agentId}`);
    } else if (newState === CircuitState.CLOSED) {
      circuit.failureCount = 0;
      circuit.openedAt = null;
      circuit.halfOpenSuccessCount = 0;
      this.logger.log(`Circuit closed for ${agentId}`);
    } else if (newState === CircuitState.HALF_OPEN) {
      circuit.halfOpenSuccessCount = 0;
      this.logger.log(`Circuit half-open for ${agentId}`);
    }

    this.logger.debug(`Circuit ${agentId}: ${oldState} -> ${newState}`);
  }

  /**
   * Check if we should attempt to reset an open circuit
   */
  private shouldAttemptReset(circuit: CircuitBreakerState): boolean {
    if (circuit.state !== CircuitState.OPEN || !circuit.openedAt) {
      return false;
    }

    const timeSinceOpen = Date.now() - circuit.openedAt;
    return timeSinceOpen >= CIRCUIT_CONFIG.resetTimeout;
  }
}
