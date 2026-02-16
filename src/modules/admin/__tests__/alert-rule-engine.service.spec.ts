import { AlertRuleEngine } from '../services/alert-rule-engine.service';
import { AlertRule } from '../../../database/entities/alert-rule.entity';

describe('AlertRuleEngine', () => {
  let engine: AlertRuleEngine;
  let mockAlertRuleRepository: any;
  let mockAlertHistoryRepository: any;
  let mockHealthCheckService: any;
  let mockRedisService: any;
  let mockEventEmitter: any;

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
  };

  const mockHealthResult = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: 12345,
    version: '0.1.0',
    services: {
      database: { status: 'healthy', responseTimeMs: 10, lastChecked: new Date().toISOString() },
      redis: { status: 'healthy', responseTimeMs: 5, lastChecked: new Date().toISOString() },
      bullmq: { status: 'healthy', responseTimeMs: 15, lastChecked: new Date().toISOString() },
      neo4j: { status: 'degraded', responseTimeMs: 500, lastChecked: new Date().toISOString() },
    },
    summary: { total: 4, healthy: 3, degraded: 1, unhealthy: 0 },
  };

  beforeEach(() => {
    mockAlertRuleRepository = {
      find: jest.fn().mockResolvedValue([mockRule]),
      findOne: jest.fn(),
      create: jest.fn((data: any) => ({ ...data, id: 'history-1' })),
      save: jest.fn((data: any) => Promise.resolve({ ...data, id: data.id || 'history-1' })),
    };

    mockAlertHistoryRepository = {
      create: jest.fn((data: any) => ({ ...data, id: 'history-1' })),
      save: jest.fn((data: any) => Promise.resolve({ ...data, id: data.id || 'history-1' })),
      findOne: jest.fn().mockResolvedValue(null),
    };

    mockHealthCheckService = {
      checkHealth: jest.fn().mockResolvedValue(mockHealthResult),
    };

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    engine = new AlertRuleEngine(
      mockAlertRuleRepository,
      mockAlertHistoryRepository,
      mockHealthCheckService,
      mockRedisService,
      mockEventEmitter,
    );
  });

  describe('evaluateRules', () => {
    it('should fetch all enabled rules from repository', async () => {
      await engine.evaluateRules();
      expect(mockAlertRuleRepository.find).toHaveBeenCalledWith({
        where: { enabled: true },
      });
    });

    it('should skip disabled rules (only fetches enabled)', async () => {
      mockAlertRuleRepository.find.mockResolvedValue([]);
      await engine.evaluateRules();
      expect(mockAlertRuleRepository.find).toHaveBeenCalledWith({
        where: { enabled: true },
      });
    });

    it('should resolve health check conditions from HealthCheckService', async () => {
      const healthRule = {
        ...mockRule,
        condition: 'health.overall.status',
        operator: 'eq',
        threshold: 'unhealthy',
      };
      mockAlertRuleRepository.find.mockResolvedValue([healthRule]);
      await engine.evaluateRules();
      expect(mockHealthCheckService.checkHealth).toHaveBeenCalled();
    });

    it('should resolve metric conditions from Redis cached values', async () => {
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === 'metric:http_error_rate_percent') return '10';
        return null;
      });
      mockAlertRuleRepository.find.mockResolvedValue([mockRule]);
      await engine.evaluateRules();
      expect(mockRedisService.get).toHaveBeenCalled();
    });

    it('should track breach duration in Redis', async () => {
      // First call: no breach exists, start tracking
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === 'metric:http_error_rate_percent') return '10';
        return null; // no existing breach
      });
      mockAlertRuleRepository.find.mockResolvedValue([mockRule]);
      await engine.evaluateRules();
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `alert:breach:${mockRule.id}`,
        expect.any(String),
        expect.any(Number),
      );
    });

    it('should fire alert only after durationSeconds exceeded', async () => {
      const fiveMinutesAgo = Date.now() - 400000; // 400 seconds ago
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === 'metric:http_error_rate_percent') return '10';
        if (key === `alert:breach:${mockRule.id}`) return String(fiveMinutesAgo);
        if (key === `alert:cooldown:${mockRule.id}`) return null;
        if (key === `alert:silence:${mockRule.id}`) return null;
        return null;
      });
      mockAlertRuleRepository.find.mockResolvedValue([mockRule]);
      await engine.evaluateRules();
      expect(mockAlertHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          alertRuleId: 'rule-1',
          status: 'fired',
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'alert.fired',
        expect.objectContaining({ rule: mockRule }),
      );
    });

    it('should not fire alert during cooldown period', async () => {
      const fiveMinutesAgo = Date.now() - 400000;
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === 'metric:http_error_rate_percent') return '10';
        if (key === `alert:breach:${mockRule.id}`) return String(fiveMinutesAgo);
        if (key === `alert:cooldown:${mockRule.id}`) return String(Date.now());
        if (key === `alert:silence:${mockRule.id}`) return null;
        return null;
      });
      mockAlertRuleRepository.find.mockResolvedValue([mockRule]);
      await engine.evaluateRules();
      expect(mockAlertHistoryRepository.create).not.toHaveBeenCalled();
    });

    it('should create AlertHistory with status fired when alert triggers', async () => {
      const fiveMinutesAgo = Date.now() - 400000;
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === 'metric:http_error_rate_percent') return '10';
        if (key === `alert:breach:${mockRule.id}`) return String(fiveMinutesAgo);
        if (key === `alert:cooldown:${mockRule.id}`) return null;
        if (key === `alert:silence:${mockRule.id}`) return null;
        return null;
      });
      mockAlertRuleRepository.find.mockResolvedValue([mockRule]);
      await engine.evaluateRules();
      expect(mockAlertHistoryRepository.save).toHaveBeenCalled();
    });

    it('should emit alert.fired event', async () => {
      const fiveMinutesAgo = Date.now() - 400000;
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === 'metric:http_error_rate_percent') return '10';
        if (key === `alert:breach:${mockRule.id}`) return String(fiveMinutesAgo);
        if (key === `alert:cooldown:${mockRule.id}`) return null;
        if (key === `alert:silence:${mockRule.id}`) return null;
        return null;
      });
      mockAlertRuleRepository.find.mockResolvedValue([mockRule]);
      await engine.evaluateRules();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'alert.fired',
        expect.any(Object),
      );
    });

    it('should auto-resolve alert when condition clears', async () => {
      // Condition not breached (metric below threshold)
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === 'metric:http_error_rate_percent') return '2'; // below threshold
        if (key === `alert:breach:${mockRule.id}`) return String(Date.now() - 600000);
        if (key === `alert:silence:${mockRule.id}`) return null;
        return null;
      });
      mockAlertHistoryRepository.findOne.mockResolvedValue({
        id: 'prev-alert',
        alertRuleId: 'rule-1',
        status: 'fired',
      });
      mockAlertRuleRepository.find.mockResolvedValue([mockRule]);
      await engine.evaluateRules();
      expect(mockRedisService.del).toHaveBeenCalledWith(`alert:breach:${mockRule.id}`);
      expect(mockAlertHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'auto_resolved',
        }),
      );
    });

    it('should clear breach tracking when condition clears', async () => {
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === 'metric:http_error_rate_percent') return '2';
        if (key === `alert:breach:${mockRule.id}`) return String(Date.now());
        if (key === `alert:silence:${mockRule.id}`) return null;
        return null;
      });
      mockAlertRuleRepository.find.mockResolvedValue([mockRule]);
      await engine.evaluateRules();
      expect(mockRedisService.del).toHaveBeenCalledWith(`alert:breach:${mockRule.id}`);
    });

    it('should respect silence period (skip silenced rules)', async () => {
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === `alert:silence:${mockRule.id}`) return 'silenced';
        return null;
      });
      mockAlertRuleRepository.find.mockResolvedValue([mockRule]);
      await engine.evaluateRules();
      expect(mockHealthCheckService.checkHealth).not.toHaveBeenCalled();
    });

    it('should handle HealthCheckService errors gracefully', async () => {
      mockHealthCheckService.checkHealth.mockRejectedValue(new Error('Health check failed'));
      const healthRule = {
        ...mockRule,
        condition: 'health.overall.status',
        operator: 'eq',
        threshold: 'unhealthy',
      };
      mockAlertRuleRepository.find.mockResolvedValue([healthRule]);
      // Should not throw
      await expect(engine.evaluateRules()).resolves.toBeUndefined();
    });

    it('should handle Redis unavailability gracefully', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockAlertRuleRepository.find.mockResolvedValue([mockRule]);
      await expect(engine.evaluateRules()).resolves.toBeUndefined();
    });
  });

  describe('resolveValue', () => {
    it('should return correct health status for health.overall.status', async () => {
      const value = await engine.resolveValue('health.overall.status');
      expect(value).toBe('healthy');
    });

    it('should return correct health status for health.database.status', async () => {
      const value = await engine.resolveValue('health.database.status');
      expect(value).toBe('healthy');
    });

    it('should return correct health status for health.redis.status', async () => {
      const value = await engine.resolveValue('health.redis.status');
      expect(value).toBe('healthy');
    });

    it('should return numeric value for metric.http_error_rate_percent', async () => {
      mockRedisService.get.mockResolvedValue('7.5');
      const value = await engine.resolveValue('metric.http_error_rate_percent');
      expect(value).toBe(7.5);
    });

    it('should return numeric value for metric.bullmq_waiting_jobs', async () => {
      mockRedisService.get.mockResolvedValue('42');
      const value = await engine.resolveValue('metric.bullmq_waiting_jobs');
      expect(value).toBe(42);
    });

    it('should return 0 for unknown metric condition', async () => {
      mockRedisService.get.mockResolvedValue(null);
      const value = await engine.resolveValue('metric.unknown_metric');
      expect(value).toBe(0);
    });
  });

  describe('compareValues', () => {
    it('should correctly handle gt operator with numeric values', () => {
      expect(engine.compareValues(10, 'gt', '5')).toBe(true);
      expect(engine.compareValues(3, 'gt', '5')).toBe(false);
    });

    it('should correctly handle eq operator with string values (health status)', () => {
      expect(engine.compareValues('unhealthy', 'eq', 'unhealthy')).toBe(true);
      expect(engine.compareValues('healthy', 'eq', 'unhealthy')).toBe(false);
    });

    it('should handle lt, gte, lte, neq operators', () => {
      expect(engine.compareValues(3, 'lt', '5')).toBe(true);
      expect(engine.compareValues(5, 'gte', '5')).toBe(true);
      expect(engine.compareValues(5, 'lte', '5')).toBe(true);
      expect(engine.compareValues(3, 'neq', '5')).toBe(true);
    });

    it('should map health status strings to numeric for comparison', () => {
      // healthy=2, degraded=1, unhealthy=0
      expect(engine.compareValues('healthy', 'gt', 'degraded')).toBe(true);
      expect(engine.compareValues('unhealthy', 'lt', 'degraded')).toBe(true);
      expect(engine.compareValues('degraded', 'eq', 'degraded')).toBe(true);
    });
  });
});
