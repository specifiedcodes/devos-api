import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AlertRulesController } from '../controllers/alert-rules.controller';
import { AlertRule } from '../../../database/entities/alert-rule.entity';

describe('AlertRulesController', () => {
  let controller: AlertRulesController;
  let mockAlertRuleRepository: any;
  let mockAlertHistoryRepository: any;
  let mockRedisService: any;
  let mockAuditService: any;

  const mockRule: Partial<AlertRule> = {
    id: 'rule-1',
    name: 'Test Rule',
    ruleType: 'threshold',
    condition: 'metric.http_error_rate_percent',
    operator: 'gt',
    threshold: '5',
    durationSeconds: 300,
    severity: 'critical',
    channels: ['in_app'],
    enabled: true,
    cooldownSeconds: 3600,
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCustomRule: Partial<AlertRule> = {
    ...mockRule,
    id: 'rule-2',
    name: 'Custom Rule',
    createdBy: 'admin-1',
  };

  const mockReq = {
    user: { userId: 'admin-1' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
  };

  beforeEach(() => {
    mockAlertRuleRepository = {
      find: jest.fn().mockResolvedValue([mockRule]),
      findOne: jest.fn().mockResolvedValue(mockRule),
      create: jest.fn((data: any) => ({ ...data, id: 'new-rule-1' })),
      save: jest.fn((data: any) => Promise.resolve({ ...data })),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    mockAlertHistoryRepository = {
      findOne: jest.fn().mockResolvedValue({ firedAt: new Date() }),
      save: jest.fn((data: any) => Promise.resolve({ ...data, id: data.id || 'history-1' })),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };

    mockRedisService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
      logAdminAction: jest.fn().mockResolvedValue(undefined),
    };

    controller = new AlertRulesController(
      mockAlertRuleRepository,
      mockAlertHistoryRepository,
      mockRedisService,
      mockAuditService,
    );
  });

  describe('GET /api/admin/alerts/rules', () => {
    it('should return all rules with last fired timestamps', async () => {
      const result = await controller.listRules(undefined);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('lastFiredAt');
    });

    it('should filter by enabled=true', async () => {
      await controller.listRules('true');
      expect(mockAlertRuleRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { enabled: true },
        }),
      );
    });
  });

  describe('GET /api/admin/alerts/rules/:id', () => {
    it('should return single rule', async () => {
      const result = await controller.getRule('rule-1');
      expect(result).toEqual(mockRule);
    });

    it('should return 404 for unknown rule', async () => {
      mockAlertRuleRepository.findOne.mockResolvedValue(null);
      await expect(controller.getRule('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /api/admin/alerts/rules', () => {
    it('should create new rule with admin userId', async () => {
      const dto = {
        name: 'New Rule',
        ruleType: 'threshold' as const,
        condition: 'metric.test',
        operator: 'gt' as const,
        threshold: '10',
        severity: 'warning' as const,
        channels: ['in_app'],
      };
      const result = await controller.createRule(dto, mockReq);
      expect(mockAlertRuleRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...dto,
          createdBy: 'admin-1',
        }),
      );
      expect(result).toBeDefined();
    });

    it('should log audit action on creation', async () => {
      const dto = {
        name: 'New Rule',
        ruleType: 'threshold' as const,
        condition: 'metric.test',
        operator: 'gt' as const,
        threshold: '10',
        severity: 'warning' as const,
        channels: ['in_app'],
      };
      await controller.createRule(dto, mockReq);
      expect(mockAuditService.log).toHaveBeenCalled();
    });
  });

  describe('PUT /api/admin/alerts/rules/:id', () => {
    it('should update rule fields', async () => {
      mockAlertRuleRepository.findOne.mockResolvedValue({ ...mockCustomRule });
      const dto = { name: 'Updated Rule' };
      const result = await controller.updateRule('rule-2', dto, mockReq);
      expect(result.name).toBe('Updated Rule');
    });

    it('should prevent modifying system rule condition', async () => {
      mockAlertRuleRepository.findOne.mockResolvedValue({ ...mockRule });
      const dto = { condition: 'metric.new_condition' };
      await expect(
        controller.updateRule('rule-1', dto, mockReq),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('DELETE /api/admin/alerts/rules/:id', () => {
    it('should delete custom rule', async () => {
      mockAlertRuleRepository.findOne.mockResolvedValue({ ...mockCustomRule });
      const result = await controller.deleteRule('rule-2', mockReq);
      expect(result).toEqual({ message: 'Alert rule deleted' });
      expect(mockAlertRuleRepository.remove).toHaveBeenCalled();
    });

    it('should return 403 for system rule', async () => {
      mockAlertRuleRepository.findOne.mockResolvedValue({ ...mockRule });
      await expect(
        controller.deleteRule('rule-1', mockReq),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('PATCH /api/admin/alerts/rules/:id/toggle', () => {
    it('should toggle enabled state', async () => {
      mockAlertRuleRepository.findOne.mockResolvedValue({
        ...mockRule,
        enabled: true,
      });
      const result = await controller.toggleRule('rule-1', mockReq);
      expect(result.enabled).toBe(false);
    });
  });

  describe('GET /api/admin/alerts/history', () => {
    it('should return paginated alert history', async () => {
      const result = await controller.listHistory(
        { page: 1, limit: 50 } as any,
        mockReq,
      );
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
    });

    it('should filter by severity', async () => {
      const qb = mockAlertHistoryRepository.createQueryBuilder();
      await controller.listHistory(
        { severity: 'critical', page: 1, limit: 50 } as any,
        mockReq,
      );
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('should filter by status', async () => {
      const qb = mockAlertHistoryRepository.createQueryBuilder();
      await controller.listHistory(
        { status: 'fired', page: 1, limit: 50 } as any,
        mockReq,
      );
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('should filter by ruleId', async () => {
      const qb = mockAlertHistoryRepository.createQueryBuilder();
      await controller.listHistory(
        { ruleId: 'rule-1', page: 1, limit: 50 } as any,
        mockReq,
      );
      expect(qb.andWhere).toHaveBeenCalled();
    });
  });

  describe('POST /api/admin/alerts/history/:id/acknowledge', () => {
    it('should update status to acknowledged', async () => {
      const alert = {
        id: 'alert-1',
        alertName: 'Test',
        status: 'fired',
      };
      mockAlertHistoryRepository.findOne = jest.fn().mockResolvedValue({ ...alert });
      const result = await controller.acknowledgeAlert('alert-1', mockReq);
      expect(result.status).toBe('acknowledged');
      expect(result.acknowledgedBy).toBe('admin-1');
    });

    it('should record adminId and timestamp', async () => {
      const alert = {
        id: 'alert-1',
        alertName: 'Test',
        status: 'fired',
      };
      mockAlertHistoryRepository.findOne = jest.fn().mockResolvedValue({ ...alert });
      const result = await controller.acknowledgeAlert('alert-1', mockReq);
      expect(result.acknowledgedBy).toBe('admin-1');
      expect(result.acknowledgedAt).toBeInstanceOf(Date);
    });
  });

  describe('POST /api/admin/alerts/rules/:id/silence', () => {
    it('should store silence in Redis with TTL', async () => {
      await controller.silenceRule('rule-1', { durationMinutes: 60 } as any, mockReq);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'alert:silence:rule-1',
        'silenced',
        3600, // 60 * 60
      );
    });

    it('should return confirmation with silence expiry timestamp', async () => {
      const result = await controller.silenceRule('rule-1', { durationMinutes: 60 } as any, mockReq);
      expect(result).toHaveProperty('silenceExpiresAt');
      expect(result).toHaveProperty('message');
    });
  });

  describe('POST /api/admin/alerts/history/:id/resolve', () => {
    it('should update status with note', async () => {
      const alert = {
        id: 'alert-1',
        alertName: 'Test',
        status: 'fired',
      };
      mockAlertHistoryRepository.findOne = jest.fn().mockResolvedValue({ ...alert });
      const result = await controller.resolveAlert(
        'alert-1',
        { note: 'Fixed the issue' } as any,
        mockReq,
      );
      expect(result.status).toBe('resolved');
      expect(result.resolutionNote).toBe('Fixed the issue');
      expect(result.resolvedAt).toBeInstanceOf(Date);
    });
  });

  describe('Audit logging', () => {
    it('should log appropriate audit actions', async () => {
      mockAlertRuleRepository.findOne.mockResolvedValue({ ...mockCustomRule });
      await controller.deleteRule('rule-2', mockReq);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.alert_rule_deleted',
        'alert_rule',
        'rule-2',
        expect.any(Object),
      );
    });
  });
});
