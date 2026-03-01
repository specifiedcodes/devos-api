import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual, DataSource, FindOptionsWhere } from 'typeorm';
import { VelocityMetric } from '../../../database/entities/velocity-metric.entity';
import { SprintMetric } from '../../../database/entities/sprint-metric.entity';
import { Sprint, SprintStatus } from '../../../database/entities/sprint.entity';
import { Story, StoryStatus } from '../../../database/entities/story.entity';
import { Project } from '../../../database/entities/project.entity';
import { RedisService } from '../../redis/redis.service';
import {
  VelocityResponseDto,
  VelocitySprintDto,
} from '../dto/velocity.dto';
import { SprintMetricsSummaryDto, HealthIndicator, CycleTimeDistributionDto } from '../dto/sprint-metrics-summary.dto';

@Injectable()
export class VelocityMetricsService {
  private readonly logger = new Logger(VelocityMetricsService.name);
  private readonly CACHE_TTL = 1800;
  private readonly CACHE_PREFIX = 'velocity_metrics:';

  constructor(
    @InjectRepository(VelocityMetric)
    private readonly velocityMetricRepository: Repository<VelocityMetric>,
    @InjectRepository(SprintMetric)
    private readonly sprintMetricRepository: Repository<SprintMetric>,
    @InjectRepository(Sprint)
    private readonly sprintRepository: Repository<Sprint>,
    @InjectRepository(Story)
    private readonly storyRepository: Repository<Story>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly redisService: RedisService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async calculateFinalVelocity(
    workspaceId: string,
    projectId: string,
    sprintId: string,
  ): Promise<void> {
    this.logger.log(`Calculating final velocity for sprint ${sprintId}`);

    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });

    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }

    await this.dataSource.transaction(async (transactionalEntityManager) => {
      const existingMetric = await transactionalEntityManager.findOne(VelocityMetric, {
        where: { sprintId },
        lock: { mode: 'pessimistic_write' },
      });

      if (existingMetric) {
        this.logger.debug(`Velocity metric already exists for sprint ${sprintId}`);
        return;
      }

      const stories = await transactionalEntityManager.find(Story, {
        where: { sprintId },
      });

      const plannedPoints = stories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
      const completedStories = stories.filter(s => s.status === StoryStatus.DONE);
      const completedPoints = completedStories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);

      const cycleTimeHours = await this.calculateAverageCycleTimeInTransaction(
        transactionalEntityManager,
        sprintId,
      );

      const firstMetric = await transactionalEntityManager.findOne(SprintMetric, {
        where: { sprintId },
        order: { date: 'ASC' },
      });

      let carriedOverPoints = 0;
      let scopeChangePoints = 0;

      if (firstMetric) {
        const initialTotal = firstMetric.totalPoints;
        scopeChangePoints = Math.abs(plannedPoints - initialTotal);
      }

      const velocityMetric = transactionalEntityManager.create(VelocityMetric, {
        workspaceId,
        projectId,
        sprintId,
        sprintName: sprint.name,
        startDate: sprint.startDate ?? '',
        endDate: sprint.endDate ?? '',
        plannedPoints,
        completedPoints,
        carriedOverPoints,
        scopeChangePoints,
        averageCycleTimeHours: cycleTimeHours,
      });

      await transactionalEntityManager.save(velocityMetric);
      this.logger.log(`Final velocity calculated for sprint ${sprintId}: ${completedPoints}/${plannedPoints} points`);
    });

    await this.invalidateCache(workspaceId, projectId);
  }

  private async calculateAverageCycleTimeInTransaction(
    transactionalEntityManager: ReturnType<DataSource['createQueryRunner']>['manager'],
    sprintId: string,
  ): Promise<number | null> {
    const stories = await transactionalEntityManager.find(Story, {
      where: { sprintId },
    });

    const completedStories = stories.filter((s: Story) => s.status === StoryStatus.DONE);

    if (completedStories.length === 0) {
      return null;
    }

    const cycleTimes = completedStories
      .map((s: Story) => {
        const updatedAt = new Date(s.updatedAt);
        const createdAt = new Date(s.createdAt);
        return (updatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      })
      .filter(ct => ct >= 0);

    if (cycleTimes.length === 0) {
      return null;
    }

    const avgCycleTime = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
    return Math.round(avgCycleTime * 100) / 100;
  }

  async getVelocityData(
    workspaceId: string,
    projectId: string,
    dateFrom?: string,
    dateTo?: string,
    lastN: number = 10,
  ): Promise<VelocityResponseDto> {
    const cacheKey = `${this.CACHE_PREFIX}${workspaceId}:${projectId}:velocity:${dateFrom || 'all'}:${dateTo || 'all'}:${lastN}`;
    
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn('Failed to get cached velocity data', error);
    }

    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const whereCondition: FindOptionsWhere<VelocityMetric> = { projectId };
    if (dateFrom && dateTo) {
      whereCondition.startDate = Between(dateFrom, dateTo) as FindOptionsWhere<VelocityMetric>['startDate'];
    } else if (dateFrom) {
      whereCondition.startDate = MoreThanOrEqual(dateFrom) as FindOptionsWhere<VelocityMetric>['startDate'];
    } else if (dateTo) {
      whereCondition.startDate = LessThanOrEqual(dateTo) as FindOptionsWhere<VelocityMetric>['startDate'];
    }

    const velocityMetrics = await this.velocityMetricRepository.find({
      where: whereCondition,
      order: { startDate: 'DESC' },
      take: lastN,
    });

    const sortedMetrics = [...velocityMetrics].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    const sprints: VelocitySprintDto[] = sortedMetrics.map(vm => ({
      sprintId: vm.sprintId,
      sprintName: vm.sprintName,
      plannedPoints: vm.plannedPoints,
      completedPoints: vm.completedPoints,
      completionRate: vm.plannedPoints > 0 
        ? Math.round((vm.completedPoints / vm.plannedPoints) * 100) / 100 
        : 0,
      startDate: vm.startDate,
      endDate: vm.endDate,
      averageCycleTimeHours: vm.averageCycleTimeHours,
      carriedOverPoints: vm.carriedOverPoints,
      scopeChangePoints: vm.scopeChangePoints,
    }));

    const averageVelocity = this.calculateAverageVelocityFromMetrics(velocityMetrics.slice(0, 3));

    const response: VelocityResponseDto = {
      projectId,
      sprints,
      averageVelocity,
    };

    try {
      await this.redisService.set(cacheKey, JSON.stringify(response), this.CACHE_TTL);
    } catch (error) {
      this.logger.warn('Failed to cache velocity data', error);
    }
    
    return response;
  }

  private calculateAverageVelocityFromMetrics(metrics: VelocityMetric[]): number {
    if (metrics.length === 0) {
      return 0;
    }

    const totalCompleted = metrics.reduce((sum, vm) => sum + vm.completedPoints, 0);
    return Math.round((totalCompleted / metrics.length) * 100) / 100;
  }

  async calculateAverageVelocity(projectId: string, lastNSprints: number = 3): Promise<number> {
    const velocityMetrics = await this.velocityMetricRepository.find({
      where: { projectId },
      order: { startDate: 'DESC' },
      take: lastNSprints,
    });

    if (velocityMetrics.length === 0) {
      return 0;
    }

    const totalCompleted = velocityMetrics.reduce((sum, vm) => sum + vm.completedPoints, 0);
    return Math.round((totalCompleted / velocityMetrics.length) * 100) / 100;
  }

  async predictCompletionDate(
    workspaceId: string,
    projectId: string,
    sprintId: string,
  ): Promise<string | null> {
    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });

    if (!sprint || sprint.status !== SprintStatus.ACTIVE) {
      return null;
    }

    const stories = await this.storyRepository.find({
      where: { sprintId },
    });

    const remainingPoints = stories
      .filter(s => s.status !== StoryStatus.DONE)
      .reduce((sum, s) => sum + (s.storyPoints || 0), 0);

    if (remainingPoints <= 0) {
      return null;
    }

    const averageVelocity = await this.calculateAverageVelocity(projectId, 3);

    if (averageVelocity <= 0) {
      return null;
    }

    const sprintMetrics = await this.sprintMetricRepository.find({
      where: { sprintId },
      order: { date: 'ASC' },
    });

    let avgDailyVelocity = averageVelocity / 14;

    if (sprintMetrics.length >= 2) {
      const firstMetric = sprintMetrics[0];
      const lastMetric = sprintMetrics[sprintMetrics.length - 1];
      const pointsCompleted = lastMetric.completedPoints - firstMetric.completedPoints;
      const daysElapsed = Math.max(1, sprintMetrics.length - 1);
      avgDailyVelocity = pointsCompleted / daysElapsed;
    }

    if (avgDailyVelocity <= 0) {
      avgDailyVelocity = averageVelocity / 14;
    }

    const daysNeeded = Math.ceil(remainingPoints / avgDailyVelocity);
    const predictedDate = new Date();
    predictedDate.setDate(predictedDate.getDate() + daysNeeded);

    return predictedDate.toISOString().split('T')[0];
  }

  async calculateSprintHealth(
    workspaceId: string,
    projectId: string,
    sprintId: string,
  ): Promise<HealthIndicator> {
    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });

    if (!sprint || sprint.status !== SprintStatus.ACTIVE) {
      return 'on_track';
    }

    const today = new Date().toISOString().split('T')[0];
    const todayMetric = await this.sprintMetricRepository.findOne({
      where: { sprintId, date: today },
    });

    if (!todayMetric) {
      return 'on_track';
    }

    const remainingPoints = todayMetric.remainingPoints;
    const idealRemaining = todayMetric.idealRemaining ?? 0;
    const buffer = 0.1 * (todayMetric.totalPoints || 10);

    if (remainingPoints <= idealRemaining + buffer) {
      return 'on_track';
    }

    if (remainingPoints <= idealRemaining * 1.2) {
      return 'at_risk';
    }

    return 'behind';
  }

  async getCycleTimeDistribution(
    workspaceId: string,
    projectId: string,
    sprintId: string,
  ): Promise<CycleTimeDistributionDto> {
    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });

    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }

    const stories = await this.storyRepository.find({
      where: { sprintId },
    });

    const completedStories = stories.filter(s => s.status === StoryStatus.DONE);

    const cycleTimes = completedStories
      .map(s => {
        const updatedAt = new Date(s.updatedAt);
        const createdAt = new Date(s.createdAt);
        return (updatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      })
      .filter(ct => ct >= 0);

    const distribution: CycleTimeDistributionDto = {
      lessThanOneDay: cycleTimes.filter(ct => ct < 24).length,
      oneToThreeDays: cycleTimes.filter(ct => ct >= 24 && ct < 72).length,
      threeToSevenDays: cycleTimes.filter(ct => ct >= 72 && ct < 168).length,
      moreThanSevenDays: cycleTimes.filter(ct => ct >= 168).length,
      averageCycleTimeHours: cycleTimes.length > 0
        ? Math.round((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) * 100) / 100
        : null,
    };

    return distribution;
  }

  async getSprintMetricsSummary(
    workspaceId: string,
    projectId: string,
    sprintId: string,
  ): Promise<SprintMetricsSummaryDto> {
    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });

    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }

    const stories = await this.storyRepository.find({
      where: { sprintId },
    });

    const totalPoints = stories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
    const completedStories = stories.filter(s => s.status === StoryStatus.DONE);
    const completedPoints = completedStories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
    const remainingPoints = totalPoints - completedPoints;
    const completionRate = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) / 100 : 0;

    const cycleTimeHours = await this.calculateAverageCycleTime(sprintId);
    const predictedCompletionDate = await this.predictCompletionDate(workspaceId, projectId, sprintId);
    const healthIndicator = await this.calculateSprintHealth(workspaceId, projectId, sprintId);

    let daysRemaining = 0;
    if (sprint.endDate) {
      const end = new Date(sprint.endDate);
      const today = new Date();
      const diffTime = end.getTime() - today.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    return {
      sprintId: sprint.id,
      sprintName: sprint.name,
      status: sprint.status,
      totalPoints,
      completedPoints,
      remainingPoints,
      completionRate,
      averageCycleTimeHours: cycleTimeHours,
      predictedCompletionDate,
      healthIndicator,
      daysRemaining,
      startDate: sprint.startDate ?? '',
      endDate: sprint.endDate ?? '',
    };
  }

  private async calculateAverageCycleTime(sprintId: string): Promise<number | null> {
    const stories = await this.storyRepository.find({
      where: { sprintId },
    });

    const completedStories = stories.filter(s => s.status === StoryStatus.DONE);

    if (completedStories.length === 0) {
      return null;
    }

    const cycleTimes = completedStories
      .map(s => {
        const updatedAt = new Date(s.updatedAt);
        const createdAt = new Date(s.createdAt);
        return (updatedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      })
      .filter(ct => ct >= 0);

    if (cycleTimes.length === 0) {
      return null;
    }

    const avgCycleTime = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
    return Math.round(avgCycleTime * 100) / 100;
  }

  private async invalidateCache(workspaceId: string, projectId: string): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}${workspaceId}:${projectId}:*`;
      const keys = await this.redisService.scanKeys(pattern);
      if (keys.length > 0) {
        await this.redisService.del(...keys);
      }
    } catch (error) {
      this.logger.error('Failed to invalidate cache', error);
    }
  }
}
