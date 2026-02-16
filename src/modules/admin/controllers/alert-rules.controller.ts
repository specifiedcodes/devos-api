import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  Request,
  NotFoundException,
  ForbiddenException,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { PlatformAdmin } from '../decorators/platform-admin.decorator';
import { AlertRule } from '../../../database/entities/alert-rule.entity';
import { AlertHistory } from '../../../database/entities/alert-history.entity';
import { RedisService } from '../../redis/redis.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import {
  CreateAlertRuleDto,
  UpdateAlertRuleDto,
  AlertHistoryQueryDto,
  SilenceAlertDto,
  ResolveAlertDto,
} from '../dto/alert-rule.dto';

/**
 * AlertRulesController
 * Story 14.8: Alert Rules & Notifications (AC5)
 *
 * Admin API for managing alert rules and alert history.
 * All endpoints require @PlatformAdmin() decorator.
 */
@Controller('api/admin/alerts')
export class AlertRulesController {
  private readonly logger = new Logger(AlertRulesController.name);

  constructor(
    @InjectRepository(AlertRule)
    private readonly alertRuleRepository: Repository<AlertRule>,
    @InjectRepository(AlertHistory)
    private readonly alertHistoryRepository: Repository<AlertHistory>,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /api/admin/alerts/rules
   * List all alert rules with optional enabled filter and last fired timestamp.
   */
  @Get('rules')
  @PlatformAdmin()
  async listRules(
    @Query('enabled') enabled?: string,
  ) {
    const where: FindOptionsWhere<AlertRule> = {};
    if (enabled === 'true') where.enabled = true;
    if (enabled === 'false') where.enabled = false;

    const rules = await this.alertRuleRepository.find({
      where,
      order: { createdAt: 'ASC' },
    });

    // Get last fired timestamp per rule using a single batch query
    // instead of N+1 individual queries
    const ruleIds = rules.map((r) => r.id);
    const lastFiredMap = new Map<string, Date>();

    if (ruleIds.length > 0) {
      const lastFiredResults = await this.alertHistoryRepository
        .createQueryBuilder('ah')
        .select('ah.alertRuleId', 'alertRuleId')
        .addSelect('MAX(ah.firedAt)', 'lastFiredAt')
        .where('ah.alertRuleId IN (:...ruleIds)', { ruleIds })
        .andWhere('ah.status = :status', { status: 'fired' })
        .groupBy('ah.alertRuleId')
        .getRawMany();

      for (const row of lastFiredResults) {
        lastFiredMap.set(row.alertRuleId, row.lastFiredAt);
      }
    }

    const rulesWithLastFired = rules.map((rule) => ({
      ...rule,
      lastFiredAt: lastFiredMap.get(rule.id) || null,
    }));

    return rulesWithLastFired;
  }

  /**
   * GET /api/admin/alerts/rules/:id
   * Get a single alert rule.
   */
  @Get('rules/:id')
  @PlatformAdmin()
  async getRule(@Param('id') id: string) {
    const rule = await this.alertRuleRepository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }
    return rule;
  }

  /**
   * POST /api/admin/alerts/rules
   * Create a new alert rule.
   */
  @Post('rules')
  @PlatformAdmin()
  async createRule(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CreateAlertRuleDto,
    @Request() req: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;

    const rule = this.alertRuleRepository.create({
      ...dto,
      createdBy: adminId || 'admin',
    });

    const saved = await this.alertRuleRepository.save(rule);

    this.logAudit(
      adminId,
      AuditAction.ADMIN_ALERT_RULE_CREATED,
      'alert_rule',
      saved.id,
      { ruleName: saved.name, ruleType: saved.ruleType },
      req,
    );

    return saved;
  }

  /**
   * PUT /api/admin/alerts/rules/:id
   * Update an alert rule.
   * System rules cannot have condition/threshold modified.
   */
  @Put('rules/:id')
  @PlatformAdmin()
  async updateRule(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateAlertRuleDto,
    @Request() req: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;

    const rule = await this.alertRuleRepository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }

    // System rules: only allow changes to enabled, channels, cooldownSeconds, metadata
    if (rule.createdBy === 'system') {
      const dtoAny = dto as Record<string, any>;
      const ruleAny = rule as Record<string, any>;
      const restrictedFields = ['condition', 'threshold', 'operator', 'ruleType'];
      for (const field of restrictedFields) {
        if (dtoAny[field] !== undefined && dtoAny[field] !== ruleAny[field]) {
          throw new ForbiddenException(
            `Cannot modify ${field} on system-created rules. Only enable/disable and channels can be changed.`,
          );
        }
      }
    }

    Object.assign(rule, dto);
    const saved = await this.alertRuleRepository.save(rule);

    this.logAudit(
      adminId,
      AuditAction.ADMIN_ALERT_RULE_UPDATED,
      'alert_rule',
      saved.id,
      { ruleName: saved.name, changes: Object.keys(dto) },
      req,
    );

    return saved;
  }

  /**
   * DELETE /api/admin/alerts/rules/:id
   * Delete a custom alert rule. System rules cannot be deleted.
   */
  @Delete('rules/:id')
  @PlatformAdmin()
  async deleteRule(@Param('id') id: string, @Request() req: any) {
    const adminId = req?.user?.userId || req?.user?.id;

    const rule = await this.alertRuleRepository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }

    if (rule.createdBy === 'system') {
      throw new ForbiddenException(
        'Cannot delete system-created rules. Use toggle to disable instead.',
      );
    }

    await this.alertRuleRepository.remove(rule);

    this.logAudit(
      adminId,
      AuditAction.ADMIN_ALERT_RULE_DELETED,
      'alert_rule',
      id,
      { ruleName: rule.name },
      req,
    );

    return { message: 'Alert rule deleted' };
  }

  /**
   * PATCH /api/admin/alerts/rules/:id/toggle
   * Toggle enabled/disabled state of an alert rule.
   */
  @Patch('rules/:id/toggle')
  @PlatformAdmin()
  async toggleRule(@Param('id') id: string, @Request() req: any) {
    const adminId = req?.user?.userId || req?.user?.id;

    const rule = await this.alertRuleRepository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }

    rule.enabled = !rule.enabled;
    const saved = await this.alertRuleRepository.save(rule);

    this.logAudit(
      adminId,
      AuditAction.ADMIN_ALERT_RULE_TOGGLED,
      'alert_rule',
      saved.id,
      { ruleName: saved.name, enabled: saved.enabled },
      req,
    );

    return saved;
  }

  /**
   * GET /api/admin/alerts/history
   * List paginated alert history with filters.
   */
  @Get('history')
  @PlatformAdmin()
  async listHistory(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AlertHistoryQueryDto,
    @Request() req?: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const qb = this.alertHistoryRepository
      .createQueryBuilder('ah')
      .leftJoinAndSelect('ah.alertRule', 'rule');

    if (query.severity) {
      qb.andWhere('ah.severity = :severity', { severity: query.severity });
    }

    if (query.status) {
      qb.andWhere('ah.status = :status', { status: query.status });
    }

    if (query.ruleId) {
      qb.andWhere('ah.alertRuleId = :ruleId', { ruleId: query.ruleId });
    }

    if (query.startDate) {
      qb.andWhere('ah.firedAt >= :startDate', {
        startDate: new Date(query.startDate),
      });
    }

    if (query.endDate) {
      qb.andWhere('ah.firedAt <= :endDate', {
        endDate: new Date(query.endDate),
      });
    }

    // Default: last 7 days if no date filters
    if (!query.startDate && !query.endDate) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      qb.andWhere('ah.firedAt >= :defaultStart', {
        defaultStart: sevenDaysAgo,
      });
    }

    const [items, total] = await qb
      .orderBy('ah.firedAt', 'DESC')
      .take(limit)
      .skip(skip)
      .getManyAndCount();

    this.logAudit(
      adminId,
      AuditAction.ADMIN_ALERT_HISTORY_VIEWED,
      'alert_history',
      'list',
      { filters: query },
      req,
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * POST /api/admin/alerts/history/:id/acknowledge
   * Acknowledge a fired alert.
   */
  @Post('history/:id/acknowledge')
  @PlatformAdmin()
  async acknowledgeAlert(@Param('id') id: string, @Request() req: any) {
    const adminId = req?.user?.userId || req?.user?.id;

    const alert = await this.alertHistoryRepository.findOne({
      where: { id },
    });
    if (!alert) {
      throw new NotFoundException('Alert history entry not found');
    }

    // Only fired alerts can be acknowledged
    if (alert.status !== 'fired') {
      throw new ForbiddenException(
        `Cannot acknowledge alert with status "${alert.status}". Only fired alerts can be acknowledged.`,
      );
    }

    alert.status = 'acknowledged';
    alert.acknowledgedBy = adminId;
    alert.acknowledgedAt = new Date();

    const saved = await this.alertHistoryRepository.save(alert);

    this.logAudit(
      adminId,
      AuditAction.ADMIN_ALERT_ACKNOWLEDGED,
      'alert_history',
      id,
      { alertName: alert.alertName },
      req,
    );

    return saved;
  }

  /**
   * POST /api/admin/alerts/rules/:id/silence
   * Silence an alert rule for a specified duration.
   */
  @Post('rules/:id/silence')
  @PlatformAdmin()
  async silenceRule(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: SilenceAlertDto,
    @Request() req: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;

    const rule = await this.alertRuleRepository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }

    const silenceTtlSeconds = dto.durationMinutes * 60;
    const silenceKey = `alert:silence:${id}`;
    await this.redisService.set(silenceKey, 'silenced', silenceTtlSeconds);

    const silenceExpiresAt = new Date(
      Date.now() + silenceTtlSeconds * 1000,
    ).toISOString();

    this.logAudit(
      adminId,
      AuditAction.ADMIN_ALERT_RULE_SILENCED,
      'alert_rule',
      id,
      { ruleName: rule.name, durationMinutes: dto.durationMinutes, silenceExpiresAt },
      req,
    );

    return {
      message: `Alert rule "${rule.name}" silenced for ${dto.durationMinutes} minutes`,
      silenceExpiresAt,
    };
  }

  /**
   * POST /api/admin/alerts/history/:id/resolve
   * Manually resolve an alert.
   */
  @Post('history/:id/resolve')
  @PlatformAdmin()
  async resolveAlert(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: ResolveAlertDto,
    @Request() req: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;

    const alert = await this.alertHistoryRepository.findOne({
      where: { id },
    });
    if (!alert) {
      throw new NotFoundException('Alert history entry not found');
    }

    // Only fired or acknowledged alerts can be manually resolved
    if (alert.status !== 'fired' && alert.status !== 'acknowledged') {
      throw new ForbiddenException(
        `Cannot resolve alert with status "${alert.status}". Only fired or acknowledged alerts can be resolved.`,
      );
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    if (dto.note) {
      alert.resolutionNote = dto.note;
    }

    const saved = await this.alertHistoryRepository.save(alert);

    this.logAudit(
      adminId,
      AuditAction.ADMIN_ALERT_RESOLVED,
      'alert_history',
      id,
      { alertName: alert.alertName, note: dto.note },
      req,
    );

    return saved;
  }

  /**
   * Fire-and-forget audit logging helper.
   */
  private logAudit(
    adminId: string,
    action: AuditAction,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, any>,
    req: any,
  ): void {
    this.auditService
      .log('platform', adminId, action, resourceType, resourceId, {
        ...metadata,
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
      })
      .catch((err) => {
        void err;
      });
  }
}
