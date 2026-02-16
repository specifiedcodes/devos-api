import { Test, TestingModule } from '@nestjs/testing';
import { SsoEnforcementScheduler } from './sso-enforcement.scheduler';
import { SsoEnforcementService } from './sso-enforcement.service';
import { SsoEnforcementPolicy } from '../../../database/entities/sso-enforcement-policy.entity';

describe('SsoEnforcementScheduler', () => {
  let scheduler: SsoEnforcementScheduler;
  let enforcementService: jest.Mocked<SsoEnforcementService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoEnforcementScheduler,
        {
          provide: SsoEnforcementService,
          useValue: {
            processGracePeriodExpiry: jest.fn(),
            findPoliciesInGracePeriod: jest.fn(),
          },
        },
      ],
    }).compile();

    scheduler = module.get<SsoEnforcementScheduler>(SsoEnforcementScheduler);
    enforcementService = module.get(SsoEnforcementService) as jest.Mocked<SsoEnforcementService>;
  });

  describe('handleGracePeriodExpiry', () => {
    it('should call processGracePeriodExpiry and log result', async () => {
      enforcementService.processGracePeriodExpiry.mockResolvedValue(3);

      await scheduler.handleGracePeriodExpiry();

      expect(enforcementService.processGracePeriodExpiry).toHaveBeenCalled();
    });

    it('should not throw on service error', async () => {
      enforcementService.processGracePeriodExpiry.mockRejectedValue(new Error('DB error'));

      await expect(scheduler.handleGracePeriodExpiry()).resolves.not.toThrow();
    });

    it('should handle zero transitioned policies gracefully', async () => {
      enforcementService.processGracePeriodExpiry.mockResolvedValue(0);

      await expect(scheduler.handleGracePeriodExpiry()).resolves.not.toThrow();
    });
  });

  describe('handleGracePeriodReminders', () => {
    it('should identify policies at notification thresholds', async () => {
      const now = new Date();
      const futureEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
      const policies = [
        {
          workspaceId: 'ws-1',
          gracePeriodEnd: futureEnd,
        } as SsoEnforcementPolicy,
      ];

      enforcementService.findPoliciesInGracePeriod.mockResolvedValue(policies);

      await expect(scheduler.handleGracePeriodReminders()).resolves.not.toThrow();
      expect(enforcementService.findPoliciesInGracePeriod).toHaveBeenCalled();
    });

    it('should not throw on service error', async () => {
      enforcementService.findPoliciesInGracePeriod.mockRejectedValue(new Error('DB error'));

      await expect(scheduler.handleGracePeriodReminders()).resolves.not.toThrow();
    });

    it('should handle empty policies list', async () => {
      enforcementService.findPoliciesInGracePeriod.mockResolvedValue([]);

      await expect(scheduler.handleGracePeriodReminders()).resolves.not.toThrow();
    });

    it('should skip policies without gracePeriodEnd', async () => {
      const policies = [
        {
          workspaceId: 'ws-1',
          gracePeriodEnd: null,
        } as SsoEnforcementPolicy,
      ];

      enforcementService.findPoliciesInGracePeriod.mockResolvedValue(policies);

      await expect(scheduler.handleGracePeriodReminders()).resolves.not.toThrow();
    });
  });
});
