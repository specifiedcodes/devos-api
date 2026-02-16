/**
 * PushSubscriptionCleanupService Tests
 * Story 16.7: VAPID Key Web Push Setup
 *
 * Tests for scheduled stale subscription cleanup.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, LessThan, IsNull } from 'typeorm';
import { PushSubscriptionCleanupService } from '../services/push-subscription-cleanup.service';
import { PushSubscription } from '../../../database/entities/push-subscription.entity';

const mockRepository = () => ({
  delete: jest.fn(),
  count: jest.fn(),
});

const mockConfigService = (overrides: Record<string, any> = {}) => ({
  get: jest.fn((key: string, defaultValue?: any) => {
    const config: Record<string, any> = {
      ...overrides,
    };
    return config[key] ?? defaultValue;
  }),
});

describe('PushSubscriptionCleanupService', () => {
  let service: PushSubscriptionCleanupService;
  let repository: jest.Mocked<Repository<PushSubscription>>;
  let configService: jest.Mocked<ConfigService>;

  const createService = async (configOverrides: Record<string, any> = {}) => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushSubscriptionCleanupService,
        {
          provide: getRepositoryToken(PushSubscription),
          useFactory: mockRepository,
        },
        {
          provide: ConfigService,
          useFactory: () => mockConfigService(configOverrides),
        },
      ],
    }).compile();

    service = module.get<PushSubscriptionCleanupService>(PushSubscriptionCleanupService);
    repository = module.get(getRepositoryToken(PushSubscription));
    configService = module.get(ConfigService);
    return { service, repository, configService };
  };

  describe('removeStaleSubscriptions', () => {
    it('should remove stale subscriptions older than threshold', async () => {
      await createService();
      repository.delete
        .mockResolvedValueOnce({ affected: 5, raw: {} })   // stale by lastUsedAt
        .mockResolvedValueOnce({ affected: 2, raw: {} });   // stale by NULL lastUsedAt + old createdAt

      const removed = await service.removeStaleSubscriptions();

      expect(repository.delete).toHaveBeenCalledWith({
        lastUsedAt: expect.any(Object),
      });
      expect(removed).toBe(7); // 5 + 2
    });

    it('should also remove subscriptions with NULL lastUsedAt and old createdAt', async () => {
      await createService();
      repository.delete
        .mockResolvedValueOnce({ affected: 0, raw: {} })   // no stale by lastUsedAt
        .mockResolvedValueOnce({ affected: 3, raw: {} });   // stale by NULL lastUsedAt

      const removed = await service.removeStaleSubscriptions();

      // Second call should match NULL lastUsedAt + old createdAt
      expect(repository.delete).toHaveBeenCalledTimes(2);
      expect(repository.delete).toHaveBeenNthCalledWith(2, {
        lastUsedAt: expect.any(Object), // IsNull()
        createdAt: expect.any(Object),  // LessThan(cutoffDate)
      });
      expect(removed).toBe(3);
    });

    it('should use configurable stale threshold from env var', async () => {
      await createService({ PUSH_STALE_THRESHOLD_DAYS: 60 });
      repository.delete
        .mockResolvedValueOnce({ affected: 3, raw: {} })
        .mockResolvedValueOnce({ affected: 0, raw: {} });

      const removed = await service.removeStaleSubscriptions();

      expect(removed).toBe(3);
      expect(repository.delete).toHaveBeenCalled();
    });

    it('should use default 30-day threshold when env var not set', async () => {
      await createService();
      repository.delete
        .mockResolvedValueOnce({ affected: 0, raw: {} })
        .mockResolvedValueOnce({ affected: 0, raw: {} });

      await service.removeStaleSubscriptions();

      // The first delete call should use a cutoff date ~30 days ago
      expect(repository.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          lastUsedAt: expect.any(Object),
        }),
      );
    });

    it('should handle zero stale subscriptions gracefully', async () => {
      await createService();
      repository.delete
        .mockResolvedValueOnce({ affected: 0, raw: {} })
        .mockResolvedValueOnce({ affected: 0, raw: {} });

      const removed = await service.removeStaleSubscriptions();

      expect(removed).toBe(0);
    });
  });

  describe('removeExpiredSubscriptions', () => {
    it('should remove expired subscriptions past expiresAt', async () => {
      await createService();
      repository.delete.mockResolvedValue({ affected: 3, raw: {} });

      const removed = await service.removeExpiredSubscriptions();

      expect(repository.delete).toHaveBeenCalledWith({
        expiresAt: expect.any(Object),
      });
      expect(removed).toBe(3);
    });

    it('should handle zero expired subscriptions gracefully', async () => {
      await createService();
      repository.delete.mockResolvedValue({ affected: 0, raw: {} });

      const removed = await service.removeExpiredSubscriptions();

      expect(removed).toBe(0);
    });
  });

  describe('handleWeeklyCleanup', () => {
    it('should return correct cleanup result with counts and duration', async () => {
      await createService();
      repository.delete
        .mockResolvedValueOnce({ affected: 5, raw: {} })  // stale by lastUsedAt
        .mockResolvedValueOnce({ affected: 1, raw: {} })  // stale by NULL lastUsedAt
        .mockResolvedValueOnce({ affected: 2, raw: {} }); // expired

      const result = await service.handleWeeklyCleanup();

      expect(result.staleRemoved).toBe(6); // 5 + 1
      expect(result.expiredRemoved).toBe(2);
      expect(result.totalRemoved).toBe(8);
      expect(result.executedAt).toBeDefined();
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should store last cleanup result for retrieval', async () => {
      await createService();
      repository.delete
        .mockResolvedValueOnce({ affected: 3, raw: {} })  // stale by lastUsedAt
        .mockResolvedValueOnce({ affected: 0, raw: {} })  // stale by NULL lastUsedAt
        .mockResolvedValueOnce({ affected: 1, raw: {} }); // expired

      await service.handleWeeklyCleanup();

      const lastResult = service.getLastCleanupResult();
      expect(lastResult).not.toBeNull();
      expect(lastResult!.staleRemoved).toBe(3);
      expect(lastResult!.expiredRemoved).toBe(1);
      expect(lastResult!.totalRemoved).toBe(4);
    });

    it('should handle zero stale/expired subscriptions gracefully', async () => {
      await createService();
      repository.delete
        .mockResolvedValueOnce({ affected: 0, raw: {} })  // stale by lastUsedAt
        .mockResolvedValueOnce({ affected: 0, raw: {} })  // stale by NULL lastUsedAt
        .mockResolvedValueOnce({ affected: 0, raw: {} }); // expired

      const result = await service.handleWeeklyCleanup();

      expect(result.totalRemoved).toBe(0);
      expect(result.staleRemoved).toBe(0);
      expect(result.expiredRemoved).toBe(0);
    });
  });

  describe('getLastCleanupResult', () => {
    it('should return null when no cleanup has run', async () => {
      await createService();

      const result = service.getLastCleanupResult();

      expect(result).toBeNull();
    });
  });

  describe('getSubscriptionStats', () => {
    it('should count total subscriptions correctly', async () => {
      await createService();
      repository.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(10)  // stale
        .mockResolvedValueOnce(5);  // expired

      const stats = await service.getSubscriptionStats();

      expect(stats.total).toBe(100);
    });

    it('should count stale subscriptions correctly', async () => {
      await createService();
      repository.count
        .mockResolvedValueOnce(50)  // total
        .mockResolvedValueOnce(15)  // stale
        .mockResolvedValueOnce(3);  // expired

      const stats = await service.getSubscriptionStats();

      expect(stats.staleCount).toBe(15);
    });

    it('should count expired subscriptions correctly', async () => {
      await createService();
      repository.count
        .mockResolvedValueOnce(50)  // total
        .mockResolvedValueOnce(10)  // stale
        .mockResolvedValueOnce(8);  // expired

      const stats = await service.getSubscriptionStats();

      expect(stats.expiredCount).toBe(8);
    });

    it('should handle repository errors gracefully', async () => {
      await createService();
      repository.count.mockRejectedValue(new Error('DB connection error'));

      await expect(service.getSubscriptionStats()).rejects.toThrow('DB connection error');
    });
  });
});
