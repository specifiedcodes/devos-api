import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { Counter, Gauge } from 'prom-client';
import { DataSource } from 'typeorm';
import { MetricsService } from '../metrics.service';

/**
 * BusinessMetricsService
 * Story 14.1: Prometheus Metrics Exporter (AC3)
 *
 * Listens to EventEmitter2 events for business operations and
 * periodically polls the database for gauge metrics.
 */
@Injectable()
export class BusinessMetricsService {
  private readonly logger = new Logger(BusinessMetricsService.name);

  private readonly projectsCreated: Counter;
  private readonly activeUsers: Gauge;
  private readonly aiApiCost: Counter;
  private readonly deployments: Counter;
  private readonly spendCapEvents: Counter;
  private readonly workspacesTotal: Gauge;

  constructor(
    private readonly metricsService: MetricsService,
    private readonly dataSource: DataSource,
  ) {
    const registry = this.metricsService.getRegistry();

    this.projectsCreated = new Counter({
      name: 'devos_projects_created_total',
      help: 'Total number of projects created',
      registers: [registry],
    });

    this.activeUsers = new Gauge({
      name: 'devos_active_users_total',
      help: 'Number of active users',
      registers: [registry],
    });

    this.aiApiCost = new Counter({
      name: 'devos_ai_api_cost_usd_total',
      help: 'Total AI API cost in USD',
      labelNames: ['provider', 'model'],
      registers: [registry],
    });

    this.deployments = new Counter({
      name: 'devos_deployments_total',
      help: 'Total number of deployments',
      labelNames: ['platform', 'result'],
      registers: [registry],
    });

    this.spendCapEvents = new Counter({
      name: 'devos_spend_cap_events_total',
      help: 'Total number of spend cap events',
      labelNames: ['event_type'],
      registers: [registry],
    });

    this.workspacesTotal = new Gauge({
      name: 'devos_workspaces_total',
      help: 'Total number of workspaces',
      registers: [registry],
    });
  }

  @OnEvent('project.created')
  handleProjectCreated(): void {
    this.projectsCreated.inc();
  }

  @OnEvent('usage:cost_update')
  handleCostUpdate(payload: {
    provider?: string;
    model?: string;
    cost?: number;
  }): void {
    if (payload.cost && payload.cost > 0) {
      this.aiApiCost.inc(
        {
          provider: payload.provider || 'unknown',
          model: payload.model || 'unknown',
        },
        payload.cost,
      );
    }
  }

  @OnEvent('deployment.completed')
  handleDeploymentCompleted(payload: {
    platform?: string;
    result?: string;
  }): void {
    this.deployments.inc({
      platform: payload.platform || 'unknown',
      result: payload.result || 'success',
    });
  }

  @OnEvent('cost:threshold_reached')
  handleSpendCapEvent(payload: { event_type?: string }): void {
    this.spendCapEvents.inc({
      event_type: payload.event_type || 'warning',
    });
  }

  /**
   * Periodic gauge updates - queries database every 60 seconds
   */
  @Interval(60000)
  async updateGauges(): Promise<void> {
    try {
      await this.updateActiveUsers();
      await this.updateWorkspaceCount();
    } catch (error) {
      this.logger.warn('Failed to update business metric gauges', error);
    }
  }

  private async updateActiveUsers(): Promise<void> {
    try {
      // Count users who have been active in the last 24 hours
      const result = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "users" WHERE "lastLoginAt" > NOW() - INTERVAL '24 hours'`,
      );
      const count = parseInt(result?.[0]?.count || '0', 10);
      this.activeUsers.set(count);
    } catch {
      // Table might not have lastLoginAt column; set to 0
      this.activeUsers.set(0);
    }
  }

  private async updateWorkspaceCount(): Promise<void> {
    try {
      const result = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "workspaces"`,
      );
      const count = parseInt(result?.[0]?.count || '0', 10);
      this.workspacesTotal.set(count);
    } catch {
      this.workspacesTotal.set(0);
    }
  }
}
