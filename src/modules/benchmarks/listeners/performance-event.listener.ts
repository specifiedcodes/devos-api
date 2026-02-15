/**
 * PerformanceEventListener
 *
 * Story 13-8: Model Performance Benchmarks
 *
 * Listens for usage:cost_update events from UsageService and
 * auto-creates baseline ModelPerformance records.
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BenchmarkService } from '../services/benchmark.service';
import { CostUpdateEvent } from '../../usage/services/usage.service';
import * as crypto from 'crypto';

@Injectable()
export class PerformanceEventListener {
  private readonly logger = new Logger(PerformanceEventListener.name);

  constructor(private readonly benchmarkService: BenchmarkService) {}

  /**
   * Handle cost update events by creating baseline performance records.
   *
   * - success: true (if usage was recorded, the request succeeded)
   * - qualityScore: null (not available from cost event)
   * - latencyMs: 0 (not available from cost event; explicit POST overrides)
   * - requestId: generated UUID (no explicit requestId from cost event)
   */
  @OnEvent('usage:cost_update')
  async handleCostUpdate(event: CostUpdateEvent): Promise<void> {
    try {
      await this.benchmarkService.recordPerformance(event.workspaceId, {
        requestId: crypto.randomUUID(),
        model: event.model,
        provider: event.provider,
        taskType: event.taskType || 'unknown',
        success: true,
        latencyMs: 0,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cost: event.costUsd,
      });

      this.logger.debug(
        `Auto-recorded baseline performance for model=${event.model}, task=${event.taskType}`,
      );
    } catch (error) {
      // Listener errors should not break usage recording
      this.logger.warn(
        `Failed to auto-record performance from cost event: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
