import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertRule } from '../../../database/entities/alert-rule.entity';

/**
 * AlertRuleSeedService
 * Story 14.8: Alert Rules & Notifications (AC7)
 *
 * Seeds pre-configured alert rules on application startup if they don't already exist.
 * Idempotent: skips if system rules already exist.
 */
@Injectable()
export class AlertRuleSeedService implements OnModuleInit {
  private readonly logger = new Logger(AlertRuleSeedService.name);

  constructor(
    @InjectRepository(AlertRule)
    private readonly alertRuleRepository: Repository<AlertRule>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultRules();
  }

  /**
   * Seed default system alert rules if none exist.
   */
  async seedDefaultRules(): Promise<void> {
    try {
      const existingCount = await this.alertRuleRepository.count({
        where: { createdBy: 'system' },
      });

      if (existingCount > 0) {
        this.logger.log(
          `Skipping alert rule seeding: ${existingCount} system rules already exist`,
        );
        return;
      }

      const defaultRules: Partial<AlertRule>[] = [
        {
          name: 'API Down',
          description:
            'Fires when overall health check status is unhealthy for 3 minutes',
          ruleType: 'health_check',
          condition: 'health.overall.status',
          operator: 'eq',
          threshold: 'unhealthy',
          durationSeconds: 180,
          severity: 'critical',
          channels: ['in_app', 'email'],
          enabled: true,
          cooldownSeconds: 3600,
          createdBy: 'system',
        },
        {
          name: 'High Error Rate',
          description:
            'Fires when HTTP error rate exceeds 5% for 5 minutes',
          ruleType: 'threshold',
          condition: 'metric.http_error_rate_percent',
          operator: 'gt',
          threshold: '5',
          durationSeconds: 300,
          severity: 'critical',
          channels: ['in_app', 'email'],
          enabled: true,
          cooldownSeconds: 3600,
          createdBy: 'system',
        },
        {
          name: 'Slow API',
          description:
            'Fires when HTTP p95 latency exceeds 3000ms for 10 minutes',
          ruleType: 'threshold',
          condition: 'metric.http_p95_latency_ms',
          operator: 'gt',
          threshold: '3000',
          durationSeconds: 600,
          severity: 'warning',
          channels: ['in_app'],
          enabled: true,
          cooldownSeconds: 3600,
          createdBy: 'system',
        },
        {
          name: 'Queue Backup',
          description:
            'Fires when BullMQ waiting jobs exceed 200 for 10 minutes',
          ruleType: 'threshold',
          condition: 'metric.bullmq_waiting_jobs',
          operator: 'gt',
          threshold: '200',
          durationSeconds: 600,
          severity: 'warning',
          channels: ['in_app'],
          enabled: true,
          cooldownSeconds: 3600,
          createdBy: 'system',
        },
        {
          name: 'Database Saturated',
          description:
            'Fires when database health check is unhealthy for 5 minutes',
          ruleType: 'health_check',
          condition: 'health.database.status',
          operator: 'eq',
          threshold: 'unhealthy',
          durationSeconds: 300,
          severity: 'critical',
          channels: ['in_app', 'email'],
          enabled: true,
          cooldownSeconds: 3600,
          createdBy: 'system',
        },
        {
          name: 'WebSocket Drop',
          description:
            'Fires when overall health check status is degraded for 5 minutes',
          ruleType: 'health_check',
          condition: 'health.overall.status',
          operator: 'eq',
          threshold: 'degraded',
          durationSeconds: 300,
          severity: 'critical',
          channels: ['in_app', 'email'],
          enabled: true,
          cooldownSeconds: 3600,
          createdBy: 'system',
        },
        {
          name: 'Agent Failure Spike',
          description:
            'Fires immediately when agent failures in 30 min exceed 10',
          ruleType: 'threshold',
          condition: 'metric.agent_failures_30m',
          operator: 'gt',
          threshold: '10',
          durationSeconds: 0,
          severity: 'warning',
          channels: ['in_app'],
          enabled: true,
          cooldownSeconds: 3600,
          createdBy: 'system',
        },
        {
          name: 'Memory High',
          description:
            'Fires when process memory exceeds 90% for 10 minutes',
          ruleType: 'threshold',
          condition: 'metric.process_memory_percent',
          operator: 'gt',
          threshold: '90',
          durationSeconds: 600,
          severity: 'warning',
          channels: ['in_app'],
          enabled: true,
          cooldownSeconds: 3600,
          createdBy: 'system',
        },
        {
          name: 'Redis Down',
          description:
            'Fires when Redis health check is unhealthy for 3 minutes',
          ruleType: 'health_check',
          condition: 'health.redis.status',
          operator: 'eq',
          threshold: 'unhealthy',
          durationSeconds: 180,
          severity: 'critical',
          channels: ['in_app', 'email'],
          enabled: true,
          cooldownSeconds: 3600,
          createdBy: 'system',
        },
        {
          name: 'BullMQ Down',
          description:
            'Fires when BullMQ health check is unhealthy for 3 minutes',
          ruleType: 'health_check',
          condition: 'health.bullmq.status',
          operator: 'eq',
          threshold: 'unhealthy',
          durationSeconds: 180,
          severity: 'critical',
          channels: ['in_app', 'email'],
          enabled: true,
          cooldownSeconds: 3600,
          createdBy: 'system',
        },
      ];

      const entities = defaultRules.map((rule) =>
        this.alertRuleRepository.create(rule),
      );

      await this.alertRuleRepository.save(entities);

      this.logger.log(
        `Seeded ${defaultRules.length} default alert rules`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to seed default alert rules: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
