import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual, DataSource, EntityManager, FindOptionsWhere } from 'typeorm';
import { SprintMetric } from '../../../database/entities/sprint-metric.entity';
import { VelocityMetric } from '../../../database/entities/velocity-metric.entity';
import { Sprint, SprintStatus } from '../../../database/entities/sprint.entity';
import { Story, StoryStatus } from '../../../database/entities/story.entity';
import { Project } from '../../../database/entities/project.entity';
import { RedisService } from '../../redis/redis.service';
import {
  BurndownResponseDto,
  BurndownDataPointDto,
} from '../dto/burndown.dto';

@Injectable()
export class SprintMetricsService {
  private readonly logger = new Logger(SprintMetricsService.name);
  private readonly CACHE_TTL = 1800;
  private readonly CACHE_PREFIX = 'sprint_metrics:';

  constructor(
    @InjectRepository(SprintMetric)
    private readonly sprintMetricRepository: Repository<SprintMetric>,
    @InjectRepository(VelocityMetric)
    private readonly velocityMetricRepository: Repository<VelocityMetric>,
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

  async initializeSprintMetrics(
    workspaceId: string,
    projectId: string,
    sprintId: string,
  ): Promise<void> {
    this.logger.log(`Initializing sprint metrics for sprint ${sprintId}`);

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

    const today = this.getTodayDate();
    
    await this.dataSource.transaction(async (transactionalEntityManager) => {
      const existingMetric = await transactionalEntityManager.findOne(SprintMetric, {
        where: { sprintId, date: today },
        lock: { mode: 'pessimistic_write' },
      });

      if (existingMetric) {
        this.logger.debug(`Sprint metrics already exist for ${sprintId} on ${today}`);
        return;
      }

      const stories = await transactionalEntityManager.find(Story, {
        where: { sprintId },
      });

      const totalPoints = stories.reduce((sum: number, s: Story) => sum + (s.storyPoints || 0), 0);
      const storiesTotal = stories.length;
      const completedStories = stories.filter((s: Story) => s.status === StoryStatus.DONE);
      const completedPoints = completedStories.reduce((sum: number, s: Story) => sum + (s.storyPoints || 0), 0);

      const metric = transactionalEntityManager.create(SprintMetric, {
        workspaceId,
        projectId,
        sprintId,
        date: today,
        totalPoints,
        completedPoints,
        remainingPoints: totalPoints - completedPoints,
        idealRemaining: this.calculateIdealRemaining(sprint, totalPoints, 0),
        storiesCompleted: completedStories.length,
        storiesTotal,
        scopeChanges: 0,
      });

      await transactionalEntityManager.save(metric);
      this.logger.log(`Initial sprint metrics created for sprint ${sprintId}`);
    });

    await this.invalidateCache(workspaceId, sprintId);
  }

  async snapshotDailyMetrics(sprintId: string): Promise<void> {
    this.logger.log(`Taking daily snapshot for sprint ${sprintId}`);

    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId },
      relations: ['project'],
    });

    if (!sprint || sprint.status !== SprintStatus.ACTIVE) {
      this.logger.debug(`Sprint ${sprintId} not active, skipping snapshot`);
      return;
    }

    const today = this.getTodayDate();

    await this.dataSource.transaction(async (transactionalEntityManager) => {
      const existingMetric = await transactionalEntityManager.findOne(SprintMetric, {
        where: { sprintId, date: today },
        lock: { mode: 'pessimistic_write' },
      });

      if (existingMetric) {
        await this.updateExistingMetricInTransaction(
          transactionalEntityManager,
          existingMetric,
          sprint,
        );
        return;
      }

      const stories = await transactionalEntityManager.find(Story, {
        where: { sprintId },
      });

      const totalPoints = stories.reduce((sum: number, s: Story) => sum + (s.storyPoints || 0), 0);
      const storiesTotal = stories.length;
      const completedStories = stories.filter((s: Story) => s.status === StoryStatus.DONE);
      const completedPoints = completedStories.reduce((sum: number, s: Story) => sum + (s.storyPoints || 0), 0);

      const daysElapsed = this.getDaysElapsed(sprint);

      const previousMetric = await transactionalEntityManager.findOne(SprintMetric, {
        where: { sprintId },
        order: { date: 'DESC' },
      });

      const metric = transactionalEntityManager.create(SprintMetric, {
        workspaceId: sprint.project.workspaceId,
        projectId: sprint.projectId,
        sprintId,
        date: today,
        totalPoints,
        completedPoints,
        remainingPoints: totalPoints - completedPoints,
        idealRemaining: this.calculateIdealRemaining(sprint, totalPoints, daysElapsed),
        storiesCompleted: completedStories.length,
        storiesTotal,
        scopeChanges: previousMetric?.scopeChanges ?? 0,
      });

      await transactionalEntityManager.save(metric);
      this.logger.log(`Daily snapshot created for sprint ${sprintId}`);
    });
  }

  private async updateExistingMetricInTransaction(
    transactionalEntityManager: EntityManager,
    metric: SprintMetric,
    sprint: Sprint,
  ): Promise<void> {
    const stories = await transactionalEntityManager.find(Story, {
      where: { sprintId: sprint.id },
    });

    const totalPoints = stories.reduce((sum: number, s: Story) => sum + (s.storyPoints || 0), 0);
    const storiesTotal = stories.length;
    const completedStories = stories.filter((s: Story) => s.status === StoryStatus.DONE);
    const completedPoints = completedStories.reduce((sum: number, s: Story) => sum + (s.storyPoints || 0), 0);

    const daysElapsed = this.getDaysElapsed(sprint);

    metric.totalPoints = totalPoints;
    metric.completedPoints = completedPoints;
    metric.remainingPoints = totalPoints - completedPoints;
    metric.idealRemaining = this.calculateIdealRemaining(sprint, totalPoints, daysElapsed);
    metric.storiesCompleted = completedStories.length;
    metric.storiesTotal = storiesTotal;

    await transactionalEntityManager.save(metric);
  }

  async updateTodayMetrics(
    workspaceId: string,
    projectId: string,
    sprintId: string,
  ): Promise<void> {
    this.logger.debug(`Updating today's metrics for sprint ${sprintId}`);

    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });

    if (!sprint || sprint.status !== SprintStatus.ACTIVE) {
      return;
    }

    const today = this.getTodayDate();

    await this.dataSource.transaction(async (transactionalEntityManager) => {
      let metric = await transactionalEntityManager.findOne(SprintMetric, {
        where: { sprintId, date: today },
        lock: { mode: 'pessimistic_write' },
      });

      const stories = await transactionalEntityManager.find(Story, {
        where: { sprintId },
      });

      const totalPoints = stories.reduce((sum: number, s: Story) => sum + (s.storyPoints || 0), 0);
      const storiesTotal = stories.length;
      const completedStories = stories.filter((s: Story) => s.status === StoryStatus.DONE);
      const completedPoints = completedStories.reduce((sum: number, s: Story) => sum + (s.storyPoints || 0), 0);

      const daysElapsed = this.getDaysElapsed(sprint);

      if (metric) {
        metric.totalPoints = totalPoints;
        metric.completedPoints = completedPoints;
        metric.remainingPoints = totalPoints - completedPoints;
        metric.idealRemaining = this.calculateIdealRemaining(sprint, totalPoints, daysElapsed);
        metric.storiesCompleted = completedStories.length;
        metric.storiesTotal = storiesTotal;
      } else {
        const previousMetric = await transactionalEntityManager.findOne(SprintMetric, {
          where: { sprintId },
          order: { date: 'DESC' },
        });

        metric = transactionalEntityManager.create(SprintMetric, {
          workspaceId,
          projectId,
          sprintId,
          date: today,
          totalPoints,
          completedPoints,
          remainingPoints: totalPoints - completedPoints,
          idealRemaining: this.calculateIdealRemaining(sprint, totalPoints, daysElapsed),
          storiesCompleted: completedStories.length,
          storiesTotal,
          scopeChanges: previousMetric?.scopeChanges ?? 0,
        });
      }

      await transactionalEntityManager.save(metric);
    });

    await this.invalidateCache(workspaceId, sprintId);
  }

  async trackScopeChange(
    workspaceId: string,
    sprintId: string,
    pointsDelta: number,
  ): Promise<void> {
    this.logger.log(`Tracking scope change for sprint ${sprintId}: ${pointsDelta} points`);

    const today = this.getTodayDate();

    await this.dataSource.transaction(async (transactionalEntityManager) => {
      let metric = await transactionalEntityManager.findOne(SprintMetric, {
        where: { sprintId, date: today },
        lock: { mode: 'pessimistic_write' },
      });

      if (!metric) {
        const sprint = await transactionalEntityManager.findOne(Sprint, {
          where: { id: sprintId },
          relations: ['project'],
        });

        if (!sprint || sprint.status !== SprintStatus.ACTIVE) {
          return;
        }

        const stories = await transactionalEntityManager.find(Story, {
          where: { sprintId },
        });

        const totalPoints = stories.reduce((sum: number, s: Story) => sum + (s.storyPoints || 0), 0);
        const storiesTotal = stories.length;
        const completedStories = stories.filter((s: Story) => s.status === StoryStatus.DONE);
        const completedPoints = completedStories.reduce((sum: number, s: Story) => sum + (s.storyPoints || 0), 0);

        metric = transactionalEntityManager.create(SprintMetric, {
          workspaceId: sprint.project.workspaceId,
          projectId: sprint.projectId,
          sprintId,
          date: today,
          totalPoints,
          completedPoints,
          remainingPoints: totalPoints - completedPoints,
          idealRemaining: this.calculateIdealRemaining(sprint, totalPoints, 0),
          storiesCompleted: completedStories.length,
          storiesTotal,
          scopeChanges: Math.abs(pointsDelta),
        });
      } else {
        metric.scopeChanges += Math.abs(pointsDelta);
      }

      await transactionalEntityManager.save(metric);
    });

    await this.invalidateCache(workspaceId, sprintId);
  }

  async getBurndownData(
    workspaceId: string,
    projectId: string,
    sprintId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<BurndownResponseDto> {
    const cacheKey = `${this.CACHE_PREFIX}${workspaceId}:${sprintId}:burndown:${dateFrom || 'all'}:${dateTo || 'all'}`;
    
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn('Failed to get cached burndown data', error);
    }

    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });

    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }

    const whereCondition: FindOptionsWhere<SprintMetric> = { sprintId };
    if (dateFrom && dateTo) {
      whereCondition.date = Between(dateFrom, dateTo) as any;
    } else if (dateFrom) {
      whereCondition.date = MoreThanOrEqual(dateFrom) as any;
    } else if (dateTo) {
      whereCondition.date = LessThanOrEqual(dateTo) as any;
    }

    const metrics = await this.sprintMetricRepository.find({
      where: whereCondition,
      order: { date: 'ASC' },
    });

    const dataPoints: BurndownDataPointDto[] = metrics.map(m => ({
      date: m.date,
      totalPoints: m.totalPoints,
      completedPoints: m.completedPoints,
      remainingPoints: m.remainingPoints,
      idealRemaining: m.idealRemaining ?? 0,
      storiesCompleted: m.storiesCompleted,
      storiesTotal: m.storiesTotal,
      scopeChanges: m.scopeChanges,
    }));

    const response: BurndownResponseDto = {
      sprintId: sprint.id,
      sprintName: sprint.name,
      startDate: sprint.startDate ?? '',
      endDate: sprint.endDate ?? '',
      dataPoints,
    };

    try {
      await this.redisService.set(cacheKey, JSON.stringify(response), this.CACHE_TTL);
    } catch (error) {
      this.logger.warn('Failed to cache burndown data', error);
    }
    
    return response;
  }

  private getTodayDate(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  private getDaysElapsed(sprint: Sprint): number {
    if (!sprint.startDate) return 0;
    
    const start = new Date(sprint.startDate);
    const today = new Date(this.getTodayDate());
    const diffTime = today.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  private getTotalSprintDays(sprint: Sprint): number {
    if (!sprint.startDate || !sprint.endDate) return 14;
    
    const start = new Date(sprint.startDate);
    const end = new Date(sprint.endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
  }

  private calculateIdealRemaining(sprint: Sprint, totalPoints: number, daysElapsed: number): number {
    const totalDays = this.getTotalSprintDays(sprint);
    const idealRemaining = totalPoints * (1 - daysElapsed / totalDays);
    return Math.max(0, Math.round(idealRemaining * 100) / 100);
  }

  private async invalidateCache(workspaceId: string, sprintId: string): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}${workspaceId}:${sprintId}:*`;
      const keys = await this.redisService.scanKeys(pattern);
      if (keys.length > 0) {
        await this.redisService.del(...keys);
      }
    } catch (error) {
      this.logger.error('Failed to invalidate cache', error);
    }
  }
}
