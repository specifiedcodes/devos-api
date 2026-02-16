import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as os from 'os';
import { AlertRule } from '../../../database/entities/alert-rule.entity';
import { AlertHistory } from '../../../database/entities/alert-history.entity';
import { HealthCheckService } from '../../health/health.service';
import { RedisService } from '../../redis/redis.service';

/**
 * AlertRuleEngine Service
 * Story 14.8: Alert Rules & Notifications (AC3)
 *
 * Evaluates alert rules against current system state on a scheduled interval.
 * Tracks breach durations, cooldown periods, and silence windows in Redis.
 */
@Injectable()
export class AlertRuleEngine {
  private readonly logger = new Logger(AlertRuleEngine.name);

  constructor(
    @InjectRepository(AlertRule)
    private readonly alertRuleRepository: Repository<AlertRule>,
    @InjectRepository(AlertHistory)
    private readonly alertHistoryRepository: Repository<AlertHistory>,
    private readonly healthCheckService: HealthCheckService,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Evaluate all enabled alert rules every 60 seconds.
   */
  @Cron('0 * * * * *')
  async evaluateRules(): Promise<void> {
    try {
      const rules = await this.alertRuleRepository.find({
        where: { enabled: true },
      });

      for (const rule of rules) {
        try {
          await this.evaluateRule(rule);
        } catch (error) {
          this.logger.warn(
            `Error evaluating rule "${rule.name}" (${rule.id}): ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to evaluate alert rules: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Evaluate a single alert rule.
   */
  private async evaluateRule(rule: AlertRule): Promise<void> {
    // Check if rule is silenced
    const silenceKey = `alert:silence:${rule.id}`;
    const isSilenced = await this.redisService.get(silenceKey);
    if (isSilenced) {
      return;
    }

    // Resolve current value
    const currentValue = await this.resolveValue(rule.condition);

    // Compare against threshold
    const breached = this.compareValues(currentValue, rule.operator, rule.threshold);

    const breachKey = `alert:breach:${rule.id}`;
    const cooldownKey = `alert:cooldown:${rule.id}`;

    if (breached) {
      // Track breach start time
      const existingBreach = await this.redisService.get(breachKey);
      const now = Date.now();

      if (!existingBreach) {
        // First breach - start tracking
        await this.redisService.set(
          breachKey,
          String(now),
          rule.durationSeconds * 2 || 600,
        );
        return;
      }

      const breachStart = parseInt(existingBreach, 10);
      const breachDurationMs = now - breachStart;
      const breachDurationSec = breachDurationMs / 1000;

      // Check if breach duration threshold met
      if (breachDurationSec < rule.durationSeconds) {
        return;
      }

      // Check cooldown
      const inCooldown = await this.redisService.get(cooldownKey);
      if (inCooldown) {
        return;
      }

      // Fire alert
      const alert = this.alertHistoryRepository.create({
        alertRuleId: rule.id,
        alertName: rule.name,
        severity: rule.severity,
        status: 'fired',
        message: `Alert: ${rule.name} - ${rule.condition} ${rule.operator} ${rule.threshold} (current: ${currentValue})`,
        context: {
          condition: rule.condition,
          operator: rule.operator,
          threshold: rule.threshold,
          currentValue: String(currentValue),
          breachDurationSeconds: Math.round(breachDurationSec),
        },
      });

      const saved = await this.alertHistoryRepository.save(alert);

      // Set cooldown
      await this.redisService.set(
        cooldownKey,
        String(now),
        rule.cooldownSeconds,
      );

      // Emit event
      this.eventEmitter.emit('alert.fired', { alert: saved, rule });

      this.logger.warn(
        `Alert FIRED: "${rule.name}" [${rule.severity}] - ${rule.condition} ${rule.operator} ${rule.threshold} (current: ${currentValue})`,
      );
    } else {
      // Condition cleared - check if we need to auto-resolve
      const existingBreach = await this.redisService.get(breachKey);
      if (existingBreach) {
        // Clear breach tracking
        await this.redisService.del(breachKey);

        // Check if there's an active fired alert for this rule and auto-resolve it
        const activeAlert = await this.alertHistoryRepository.findOne({
          where: {
            alertRuleId: rule.id,
            status: 'fired',
          },
          order: { firedAt: 'DESC' },
        });

        if (activeAlert) {
          const autoResolved = this.alertHistoryRepository.create({
            alertRuleId: rule.id,
            alertName: rule.name,
            severity: rule.severity,
            status: 'auto_resolved',
            message: `Auto-resolved: ${rule.name} - condition no longer breached (current: ${currentValue})`,
            context: {
              condition: rule.condition,
              operator: rule.operator,
              threshold: rule.threshold,
              currentValue: String(currentValue),
              previousAlertId: activeAlert.id,
            },
          });

          await this.alertHistoryRepository.save(autoResolved);

          this.logger.log(
            `Alert AUTO-RESOLVED: "${rule.name}" - condition cleared`,
          );
        }
      }
    }
  }

  /**
   * Resolve the current value for a condition string.
   * Supports dot-notation for health checks and Redis-cached metrics.
   */
  async resolveValue(condition: string): Promise<string | number> {
    try {
      if (condition.startsWith('health.')) {
        return await this.resolveHealthValue(condition);
      }

      if (condition.startsWith('metric.')) {
        return await this.resolveMetricValue(condition);
      }

      return 0;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve value for condition "${condition}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /**
   * Resolve health check values from HealthCheckService.
   */
  private async resolveHealthValue(condition: string): Promise<string> {
    const health = await this.healthCheckService.checkHealth();
    const parts = condition.split('.');

    // health.overall.status
    if (parts[1] === 'overall' && parts[2] === 'status') {
      return health.status;
    }

    // health.<service>.status (e.g., health.database.status)
    if (parts.length >= 3 && parts[2] === 'status') {
      const serviceName = parts[1];
      const service = health.services?.[serviceName];
      if (service) {
        return service.status;
      }
    }

    return 'unknown';
  }

  /**
   * Resolve metric values from Redis cache.
   */
  private async resolveMetricValue(condition: string): Promise<number> {
    const metricName = condition.replace('metric.', '');

    // Special case: process memory percentage
    if (metricName === 'process_memory_percent') {
      const memUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      return (memUsage.rss / totalMemory) * 100;
    }

    // Check Redis for cached metric value
    const redisKey = `metric:${metricName}`;
    const value = await this.redisService.get(redisKey);

    if (value !== null) {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }

    return 0;
  }

  /**
   * Compare current value against threshold using the specified operator.
   * Handles both numeric and string comparisons.
   */
  compareValues(
    current: string | number,
    operator: string,
    threshold: string,
  ): boolean {
    // Health status string mapping for comparison
    const statusMap: Record<string, number> = {
      healthy: 2,
      degraded: 1,
      unhealthy: 0,
    };

    let currentNum: number;
    let thresholdNum: number;

    // Check if both values are health status strings
    if (
      typeof current === 'string' &&
      statusMap[current] !== undefined &&
      statusMap[threshold] !== undefined
    ) {
      currentNum = statusMap[current];
      thresholdNum = statusMap[threshold];
    } else if (typeof current === 'string') {
      // String equality comparison
      if (operator === 'eq') return current === threshold;
      if (operator === 'neq') return current !== threshold;

      // Try numeric comparison
      currentNum = parseFloat(current);
      thresholdNum = parseFloat(threshold);
      if (isNaN(currentNum) || isNaN(thresholdNum)) {
        return false;
      }
    } else {
      currentNum = current;
      thresholdNum = parseFloat(threshold);
      if (isNaN(thresholdNum)) return false;
    }

    switch (operator) {
      case 'gt':
        return currentNum > thresholdNum;
      case 'gte':
        return currentNum >= thresholdNum;
      case 'lt':
        return currentNum < thresholdNum;
      case 'lte':
        return currentNum <= thresholdNum;
      case 'eq':
        return currentNum === thresholdNum;
      case 'neq':
        return currentNum !== thresholdNum;
      default:
        return false;
    }
  }
}
