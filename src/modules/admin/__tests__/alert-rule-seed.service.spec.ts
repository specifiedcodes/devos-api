import { AlertRuleSeedService } from '../services/alert-rule-seed.service';

describe('AlertRuleSeedService', () => {
  let service: AlertRuleSeedService;
  let mockAlertRuleRepository: any;

  beforeEach(() => {
    mockAlertRuleRepository = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((data: any) => data),
      save: jest.fn((data: any) => Promise.resolve(data)),
    };

    service = new AlertRuleSeedService(mockAlertRuleRepository);
  });

  describe('onModuleInit / seedDefaultRules', () => {
    it('should seed 10 pre-configured rules on first startup', async () => {
      await service.onModuleInit();
      expect(mockAlertRuleRepository.create).toHaveBeenCalledTimes(10);
      expect(mockAlertRuleRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should skip seeding if system rules already exist', async () => {
      mockAlertRuleRepository.count.mockResolvedValue(10);
      await service.onModuleInit();
      expect(mockAlertRuleRepository.create).not.toHaveBeenCalled();
      expect(mockAlertRuleRepository.save).not.toHaveBeenCalled();
    });

    it('should check for existing system rules', async () => {
      await service.onModuleInit();
      expect(mockAlertRuleRepository.count).toHaveBeenCalledWith({
        where: { createdBy: 'system' },
      });
    });

    it('should create all rules with createdBy = system', async () => {
      await service.onModuleInit();
      const createdRules = mockAlertRuleRepository.create.mock.calls;
      for (const call of createdRules) {
        expect(call[0].createdBy).toBe('system');
      }
    });

    it('should create all rules enabled by default', async () => {
      await service.onModuleInit();
      const createdRules = mockAlertRuleRepository.create.mock.calls;
      for (const call of createdRules) {
        expect(call[0].enabled).toBe(true);
      }
    });

    it('should create rules with correct severities and thresholds', async () => {
      await service.onModuleInit();
      const createdRules = mockAlertRuleRepository.create.mock.calls.map((c: any) => c[0]);

      // Check API Down rule
      const apiDown = createdRules.find((r: any) => r.name === 'API Down');
      expect(apiDown).toBeDefined();
      expect(apiDown.severity).toBe('critical');
      expect(apiDown.threshold).toBe('unhealthy');
      expect(apiDown.durationSeconds).toBe(180);

      // Check High Error Rate rule
      const highError = createdRules.find((r: any) => r.name === 'High Error Rate');
      expect(highError).toBeDefined();
      expect(highError.severity).toBe('critical');
      expect(highError.threshold).toBe('5');

      // Check Memory High rule
      const memHigh = createdRules.find((r: any) => r.name === 'Memory High');
      expect(memHigh).toBeDefined();
      expect(memHigh.severity).toBe('warning');
      expect(memHigh.threshold).toBe('90');
    });

    it('should handle errors gracefully during seeding', async () => {
      mockAlertRuleRepository.save.mockRejectedValue(new Error('DB error'));
      // Should not throw
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });
});
