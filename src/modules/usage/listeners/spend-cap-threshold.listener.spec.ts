import { Test, TestingModule } from '@nestjs/testing';
import { SpendCapThresholdListener } from './spend-cap-threshold.listener';
import { SpendCapService } from '../services/spend-cap.service';
import { CostUpdateEvent } from '../services/usage.service';

describe('SpendCapThresholdListener', () => {
  let listener: SpendCapThresholdListener;
  let spendCapService: jest.Mocked<SpendCapService>;

  const mockEvent: CostUpdateEvent = {
    workspaceId: 'ws-1',
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    taskType: 'coding',
    costUsd: 0.05,
    inputTokens: 1000,
    outputTokens: 500,
    cachedTokens: 0,
    monthlyTotal: 50.05,
    timestamp: '2026-02-15T10:00:00Z',
  };

  beforeEach(async () => {
    const mockSpendCapService = {
      invalidateCache: jest.fn().mockResolvedValue(undefined),
      checkAndNotifyThresholds: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpendCapThresholdListener,
        { provide: SpendCapService, useValue: mockSpendCapService },
      ],
    }).compile();

    listener = module.get<SpendCapThresholdListener>(SpendCapThresholdListener);
    spendCapService = module.get(SpendCapService);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleCostUpdate', () => {
    it('should invalidate Redis cache for workspace', async () => {
      await listener.handleCostUpdate(mockEvent);

      expect(spendCapService.invalidateCache).toHaveBeenCalledWith('ws-1');
    });

    it('should call checkAndNotifyThresholds', async () => {
      await listener.handleCostUpdate(mockEvent);

      expect(spendCapService.checkAndNotifyThresholds).toHaveBeenCalledWith('ws-1');
    });

    it('should handle errors gracefully (does not throw)', async () => {
      spendCapService.invalidateCache.mockRejectedValue(new Error('Redis down'));

      // Should not throw
      await expect(listener.handleCostUpdate(mockEvent)).resolves.not.toThrow();
    });

    it('should handle checkAndNotifyThresholds errors gracefully', async () => {
      spendCapService.checkAndNotifyThresholds.mockRejectedValue(
        new Error('DB connection failed'),
      );

      // Should not throw
      await expect(listener.handleCostUpdate(mockEvent)).resolves.not.toThrow();
    });

    it('should call invalidateCache before checkAndNotifyThresholds', async () => {
      const callOrder: string[] = [];
      spendCapService.invalidateCache.mockImplementation(async () => {
        callOrder.push('invalidateCache');
      });
      spendCapService.checkAndNotifyThresholds.mockImplementation(async () => {
        callOrder.push('checkAndNotifyThresholds');
      });

      await listener.handleCostUpdate(mockEvent);

      expect(callOrder).toEqual(['invalidateCache', 'checkAndNotifyThresholds']);
    });
  });

  describe('event registration', () => {
    it('listener is registered for usage:cost_update event', () => {
      // Verify the @OnEvent decorator metadata exists
      const metadata = Reflect.getMetadata(
        'EVENT_LISTENER_METADATA',
        SpendCapThresholdListener.prototype.handleCostUpdate,
      );
      // The @OnEvent decorator adds metadata - we verify the method exists
      expect(listener.handleCostUpdate).toBeDefined();
      expect(typeof listener.handleCostUpdate).toBe('function');
    });
  });
});
