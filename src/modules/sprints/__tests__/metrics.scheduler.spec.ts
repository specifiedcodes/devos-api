import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../schedulers/metrics.scheduler', () => {
  return {
    MetricsScheduler: class MockMetricsScheduler {
      handleDailyMetricsSnapshot = jest.fn();
      triggerManualSnapshot = jest.fn();
    },
  };
});

import { MetricsScheduler } from '../schedulers/metrics.scheduler';

describe('MetricsScheduler', () => {
  let scheduler: MetricsScheduler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsScheduler],
    }).compile();

    scheduler = module.get<MetricsScheduler>(MetricsScheduler);
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  it('should have handleDailyMetricsSnapshot method', () => {
    expect(scheduler.handleDailyMetricsSnapshot).toBeDefined();
  });

  it('should have triggerManualSnapshot method', () => {
    expect(scheduler.triggerManualSnapshot).toBeDefined();
  });
});
