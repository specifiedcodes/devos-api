import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { MetricsService } from './metrics.service';

/**
 * MetricsController
 * Story 14.1: Prometheus Metrics Exporter
 *
 * Exposes GET /metrics endpoint returning Prometheus text format.
 * No authentication required (Prometheus scraper needs unauthenticated access).
 * Excluded from rate limiting (frequent scraping).
 */
@Controller('metrics')
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    const metrics = await this.metricsService.getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(metrics);
  }
}
