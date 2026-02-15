import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Registry, collectDefaultMetrics } from 'prom-client';

/**
 * MetricsService
 * Story 14.1: Prometheus Metrics Exporter
 *
 * Manages the Prometheus registry with default metrics collection,
 * default labels, and metric prefix configuration.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly registry: Registry;

  constructor() {
    this.registry = new Registry();

    // Set default labels for all metrics
    this.registry.setDefaultLabels({
      service: 'devos-api',
      environment: process.env.NODE_ENV || 'development',
    });
  }

  onModuleInit() {
    // Collect default Node.js metrics (GC, event loop lag, memory, CPU)
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'devos_',
    });
  }

  async onModuleDestroy() {
    // Clear the registry to stop default metrics collection timers
    // and prevent "worker process has failed to exit gracefully" warnings in tests
    this.registry.clear();
  }

  /**
   * Returns the Prometheus registry instance for metric registration.
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Returns all registered metrics in Prometheus text format.
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Returns the content type for Prometheus metrics response.
   */
  getContentType(): string {
    return this.registry.contentType;
  }
}
