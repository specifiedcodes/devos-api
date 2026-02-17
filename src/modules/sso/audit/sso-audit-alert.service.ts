import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SsoAuditAlertRule } from '../../../database/entities/sso-audit-alert-rule.entity';
import { SsoAuditEvent } from '../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../redis/redis.service';
import {
  CreateAlertRuleParams,
  UpdateAlertRuleParams,
  AlertRuleEvaluationResult,
} from '../interfaces/audit.interfaces';
import { SSO_AUDIT_CONSTANTS } from '../constants/audit.constants';

@Injectable()
export class SsoAuditAlertService {
  private readonly logger = new Logger(SsoAuditAlertService.name);

  constructor(
    @InjectRepository(SsoAuditAlertRule)
    private readonly alertRuleRepository: Repository<SsoAuditAlertRule>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Create a new alert rule
   */
  async createAlertRule(params: CreateAlertRuleParams): Promise<SsoAuditAlertRule> {
    // Validate rule count does not exceed max
    const existingCount = await this.alertRuleRepository.count({
      where: { workspaceId: params.workspaceId },
    });

    if (existingCount >= SSO_AUDIT_CONSTANTS.MAX_ALERT_RULES_PER_WORKSPACE) {
      throw new BadRequestException(
        `Maximum of ${SSO_AUDIT_CONSTANTS.MAX_ALERT_RULES_PER_WORKSPACE} alert rules per workspace reached`,
      );
    }

    const rule = this.alertRuleRepository.create({
      workspaceId: params.workspaceId,
      name: params.name,
      description: params.description || null,
      eventTypes: params.eventTypes,
      threshold: params.threshold,
      windowMinutes: params.windowMinutes,
      notificationChannels: params.notificationChannels,
      cooldownMinutes: params.cooldownMinutes || 30,
      createdBy: params.actorId,
    });

    return this.alertRuleRepository.save(rule);
  }

  /**
   * Update an alert rule
   */
  async updateAlertRule(params: UpdateAlertRuleParams): Promise<SsoAuditAlertRule> {
    const rule = await this.alertRuleRepository.findOne({
      where: { id: params.ruleId },
    });

    if (!rule) {
      throw new NotFoundException(`Alert rule ${params.ruleId} not found`);
    }

    if (rule.workspaceId !== params.workspaceId) {
      throw new NotFoundException(`Alert rule ${params.ruleId} not found in this workspace`);
    }

    if (params.name !== undefined) rule.name = params.name;
    if (params.description !== undefined) rule.description = params.description || null;
    if (params.eventTypes !== undefined) rule.eventTypes = params.eventTypes;
    if (params.threshold !== undefined) rule.threshold = params.threshold;
    if (params.windowMinutes !== undefined) rule.windowMinutes = params.windowMinutes;
    if (params.notificationChannels !== undefined) rule.notificationChannels = params.notificationChannels;
    if (params.isActive !== undefined) rule.isActive = params.isActive;
    if (params.cooldownMinutes !== undefined) rule.cooldownMinutes = params.cooldownMinutes;

    return this.alertRuleRepository.save(rule);
  }

  /**
   * Delete an alert rule
   */
  async deleteAlertRule(ruleId: string, workspaceId: string, actorId: string): Promise<void> {
    const rule = await this.alertRuleRepository.findOne({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new NotFoundException(`Alert rule ${ruleId} not found`);
    }

    if (rule.workspaceId !== workspaceId) {
      throw new NotFoundException(`Alert rule ${ruleId} not found in this workspace`);
    }

    await this.alertRuleRepository.remove(rule);

    // Clean up Redis counter keys
    const counterPattern = `${SSO_AUDIT_CONSTANTS.REDIS_ALERT_COUNTER_PREFIX}${ruleId}:*`;
    const keys = await this.redisService.scanKeys(counterPattern);
    if (keys.length > 0) {
      await this.redisService.del(...keys);
    }

    // Clean up cooldown key
    const cooldownKey = `${SSO_AUDIT_CONSTANTS.REDIS_ALERT_COOLDOWN_PREFIX}${ruleId}`;
    await this.redisService.del(cooldownKey);
  }

  /**
   * List alert rules for a workspace
   */
  async listAlertRules(workspaceId: string): Promise<SsoAuditAlertRule[]> {
    return this.alertRuleRepository.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get a single alert rule
   */
  async getAlertRule(ruleId: string, workspaceId: string): Promise<SsoAuditAlertRule> {
    const rule = await this.alertRuleRepository.findOne({
      where: { id: ruleId, workspaceId },
    });

    if (!rule) {
      throw new NotFoundException(`Alert rule ${ruleId} not found`);
    }

    return rule;
  }

  /**
   * Evaluate alert rules against a new audit event
   */
  async evaluateAlertRules(event: SsoAuditEvent): Promise<AlertRuleEvaluationResult[]> {
    const rules = await this.alertRuleRepository.find({
      where: { workspaceId: event.workspaceId, isActive: true },
    });

    const results: AlertRuleEvaluationResult[] = [];

    for (const rule of rules) {
      if (!rule.eventTypes.includes(event.eventType)) {
        continue;
      }

      const windowKey = Math.floor(Date.now() / (rule.windowMinutes * 60 * 1000));
      const counterKey = `${SSO_AUDIT_CONSTANTS.REDIS_ALERT_COUNTER_PREFIX}${rule.id}:${windowKey}`;

      // Increment counter
      const count = await this.redisService.increment(counterKey, 1);
      const eventCount = count || 1;

      // Set expiry on the counter key
      await this.redisService.expire(counterKey, rule.windowMinutes * 60);

      const result: AlertRuleEvaluationResult = {
        ruleId: rule.id,
        triggered: false,
        eventCount,
        threshold: rule.threshold,
        windowMinutes: rule.windowMinutes,
      };

      if (eventCount >= rule.threshold) {
        // Check cooldown
        const cooldownKey = `${SSO_AUDIT_CONSTANTS.REDIS_ALERT_COOLDOWN_PREFIX}${rule.id}`;
        const inCooldown = await this.redisService.get(cooldownKey);

        if (!inCooldown) {
          // Set cooldown
          await this.redisService.set(cooldownKey, '1', rule.cooldownMinutes * 60);

          // Update database
          rule.lastTriggeredAt = new Date();
          rule.triggerCount += 1;
          await this.alertRuleRepository.save(rule);

          result.triggered = true;
          this.logger.warn(
            `Alert rule "${rule.name}" triggered for workspace ${event.workspaceId}: ${eventCount} events in ${rule.windowMinutes} min window`,
          );
        }
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Initialize default alert rules for a workspace
   */
  async initializeDefaultAlertRules(workspaceId: string, actorId: string): Promise<void> {
    const existingCount = await this.alertRuleRepository.count({
      where: { workspaceId },
    });

    if (existingCount > 0) {
      return; // Already has rules
    }

    for (const defaultRule of SSO_AUDIT_CONSTANTS.DEFAULT_ALERT_RULES) {
      await this.createAlertRule({
        workspaceId,
        name: defaultRule.name,
        description: defaultRule.description,
        eventTypes: [...defaultRule.eventTypes],
        threshold: defaultRule.threshold,
        windowMinutes: defaultRule.windowMinutes,
        notificationChannels: [],
        cooldownMinutes: defaultRule.cooldownMinutes,
        actorId,
      });
    }
  }
}
