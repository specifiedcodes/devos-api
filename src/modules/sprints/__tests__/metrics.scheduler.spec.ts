import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsScheduler } from '../schedulers/metrics.scheduler';
import { Sprint, SprintStatus } from '../../../database/entities/sprint.entity';
import { SprintMetricsService } from '../services/sprint-metrics.service';

describe('MetricsScheduler', () => {
  let scheduler: MetricsScheduler;
  let sprintRepository: jest.Mocked<Repository<Sprint>>;
  let sprintMetricsService: jest.Mocked<SprintMetricsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsScheduler,
        {
          provide: getRepositoryToken(Sprint),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: SprintMetricsService,
          useValue: {
            snapshotDailyMetrics: jest.fn(),
          },
        },
      ],
    }).compile();

    scheduler = module.get<MetricsScheduler>(MetricsScheduler);
    sprintRepository = module.get(getRepositoryToken(Sprint));
    sprintMetricsService = module.get(SprintMetricsService);
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  describe('handleDailyMetricsSnapshot', () => {
    it('should snapshot metrics for all active sprints', async () => {
      const activeSprints = [
        { id: 'sprint-1', status: SprintStatus.ACTIVE },
        { id: 'sprint-2', status: SprintStatus.ACTIVE },
      ] as Sprint[];

      sprintRepository.find.mockResolvedValue(activeSprints);
      sprintMetricsService.snapshotDailyMetrics.mockResolvedValue();

      await scheduler.handleDailyMetricsSnapshot();

      expect(sprintRepository.find).toHaveBeenCalledWith({
        where: { status: SprintStatus.ACTIVE },
      });
      expect(sprintMetricsService.snapshotDailyMetrics).toHaveBeenCalledTimes(2);
    });

    it('should continue processing on error', async () => {
      const activeSprints = [
        { id: 'sprint-1', status: SprintStatus.ACTIVE },
        { id: 'sprint-2', status: SprintStatus.ACTIVE },
      ] as Sprint[];

      sprintRepository.find.mockResolvedValue(activeSprints);
      sprintMetricsService.snapshotDailyMetrics
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce(undefined);

      await scheduler.handleDailyMetricsSnapshot();

      expect(sprintMetricsService.snapshotDailyMetrics).toHaveBeenCalledTimes(2);
    });

    it('should not run if already running', async () => {
      sprintRepository.find.mockResolvedValue([]);
      (scheduler as any).isRunning = true;

      await scheduler.handleDailyMetricsSnapshot();

      expect(sprintRepository.find).not.toHaveBeenCalled();
    });

    it('should handle empty active sprints list', async () => {
      sprintRepository.find.mockResolvedValue([]);

      await scheduler.handleDailyMetricsSnapshot();

      expect(sprintMetricsService.snapshotDailyMetrics).not.toHaveBeenCalled();
    });
  });

  describe('triggerManualSnapshot', () => {
    it('should return processed and error counts', async () => {
      const activeSprints = [
        { id: 'sprint-1', status: SprintStatus.ACTIVE },
        { id: 'sprint-2', status: SprintStatus.ACTIVE },
        { id: 'sprint-3', status: SprintStatus.ACTIVE },
      ] as Sprint[];

      sprintRepository.find.mockResolvedValue(activeSprints);
      sprintMetricsService.snapshotDailyMetrics
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValueOnce(undefined);

      const result = await scheduler.triggerManualSnapshot();

      expect(result.processed).toBe(2);
      expect(result.errors).toBe(1);
    });

    it('should handle all failures', async () => {
      const activeSprints = [
        { id: 'sprint-1', status: SprintStatus.ACTIVE },
      ] as Sprint[];

      sprintRepository.find.mockResolvedValue(activeSprints);
      sprintMetricsService.snapshotDailyMetrics.mockRejectedValue(new Error('Error'));

      const result = await scheduler.triggerManualSnapshot();

      expect(result.processed).toBe(0);
      expect(result.errors).toBe(1);
    });
  });
});
