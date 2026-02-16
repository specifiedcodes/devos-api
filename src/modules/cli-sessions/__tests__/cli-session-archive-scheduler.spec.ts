import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { CliSessionArchiveSchedulerService } from '../cli-session-archive-scheduler.service';

describe('CliSessionArchiveSchedulerService', () => {
  let scheduler: CliSessionArchiveSchedulerService;
  let mockQueue: jest.Mocked<Queue>;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({}),
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
    } as any;

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue: string) => defaultValue),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CliSessionArchiveSchedulerService,
        {
          provide: getQueueToken('cli-session-archive'),
          useValue: mockQueue,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    scheduler = module.get<CliSessionArchiveSchedulerService>(
      CliSessionArchiveSchedulerService,
    );
  });

  describe('onModuleInit', () => {
    it('should register archive-pending repeatable job with 5 minute interval', async () => {
      await scheduler.onModuleInit();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'archive-pending',
        {},
        expect.objectContaining({
          repeat: { every: 5 * 60 * 1000 },
          removeOnComplete: true,
          removeOnFail: 100,
        }),
      );
    });

    it('should register cleanup-expired repeatable job with daily 4 AM cron', async () => {
      await scheduler.onModuleInit();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'cleanup-expired',
        {},
        expect.objectContaining({
          repeat: { cron: '0 4 * * *' },
          removeOnComplete: true,
          removeOnFail: 100,
        }),
      );
    });

    it('should clean existing repeatable jobs before registering new ones', async () => {
      const existingJobs = [
        { key: 'archive-pending:::300000', name: 'archive-pending' },
        { key: 'cleanup-expired:::0 4 * * *', name: 'cleanup-expired' },
      ];
      mockQueue.getRepeatableJobs.mockResolvedValue(existingJobs as any);

      await scheduler.onModuleInit();

      expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledTimes(2);
      expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith(existingJobs[0].key);
      expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith(existingJobs[1].key);
    });
  });

  describe('enqueueSessionArchive', () => {
    it('should add archive-single job with sessionId in data', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440001';

      await scheduler.enqueueSessionArchive(sessionId);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'archive-single',
        { sessionId },
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 100,
        }),
      );
    });

    it('should include retry settings with exponential backoff', async () => {
      await scheduler.enqueueSessionArchive('test-session');

      const addCall = mockQueue.add.mock.calls.find(
        (call) => call[0] === 'archive-single',
      );
      expect(addCall).toBeDefined();
      expect(addCall![2]).toEqual(
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }),
      );
    });

    it('should use configurable interval from environment', async () => {
      // Default interval is 5 minutes (from ConfigService mock returning defaults)
      await scheduler.onModuleInit();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'archive-pending',
        {},
        expect.objectContaining({
          repeat: { every: 5 * 60 * 1000 },
        }),
      );
    });
  });
});
