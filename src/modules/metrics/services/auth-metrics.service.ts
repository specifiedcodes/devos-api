import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Counter, Gauge } from 'prom-client';
import { MetricsService } from '../metrics.service';

/**
 * AuthMetricsService
 * Story 14.1: Prometheus Metrics Exporter (AC3)
 *
 * Listens to EventEmitter2 auth events and records Prometheus metrics.
 * Also exposes public methods for direct metric recording if events
 * are not emitted by the auth module.
 */
@Injectable()
export class AuthMetricsService {
  private readonly authAttempts: Counter;
  private readonly activeSessions: Gauge;

  constructor(private readonly metricsService: MetricsService) {
    const registry = this.metricsService.getRegistry();

    this.authAttempts = new Counter({
      name: 'devos_auth_attempts_total',
      help: 'Total number of authentication attempts',
      labelNames: ['result'],
      registers: [registry],
    });

    this.activeSessions = new Gauge({
      name: 'devos_auth_active_sessions',
      help: 'Number of active JWT sessions',
      registers: [registry],
    });
  }

  @OnEvent('auth.login.success')
  handleLoginSuccess(): void {
    this.authAttempts.inc({ result: 'success' });
  }

  @OnEvent('auth.login.failure')
  handleLoginFailure(): void {
    this.authAttempts.inc({ result: 'failure' });
  }

  @OnEvent('auth.2fa.required')
  handle2faRequired(): void {
    this.authAttempts.inc({ result: '2fa_required' });
  }

  @OnEvent('auth.session.created')
  handleSessionCreated(): void {
    this.activeSessions.inc();
  }

  @OnEvent('auth.session.destroyed')
  handleSessionDestroyed(): void {
    this.activeSessions.dec();
  }

  /**
   * Direct method to record auth attempt (fallback if events not emitted)
   */
  recordAuthAttempt(result: 'success' | 'failure' | '2fa_required'): void {
    this.authAttempts.inc({ result });
  }

  /**
   * Direct method to set active sessions count
   */
  setActiveSessions(count: number): void {
    this.activeSessions.set(count);
  }
}
