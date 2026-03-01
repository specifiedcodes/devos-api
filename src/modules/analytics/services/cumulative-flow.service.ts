import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Story, StoryStatus } from '../../../database/entities/story.entity';
import { RedisService } from '../../redis/redis.service';
import {
  CumulativeFlowQueryDto,
  CumulativeFlowResponseDto,
  CumulativeFlowDataPointDto,
  BottleneckIndicatorDto,
} from '../dto/cumulative-flow.dto';

@Injectable()
export class CumulativeFlowService {
  private readonly logger = new Logger(CumulativeFlowService.name);
  private readonly CACHE_TTL = 1800;
  private readonly CACHE_PREFIX = 'cumulative_flow:';

  constructor(
    @InjectRepository(Story)
    private readonly storyRepository: Repository<Story>,
    private readonly redisService: RedisService,
  ) {}

  async getCumulativeFlowData(
    workspaceId: string,
    projectId: string,
    query: CumulativeFlowQueryDto,
  ): Promise<CumulativeFlowResponseDto> {
    const cacheKey = `${this.CACHE_PREFIX}${workspaceId}:${projectId}:${query.date_from || 'all'}:${query.date_to || 'all'}:${query.sprint_id || 'all'}`;

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn('Failed to get cached cumulative flow data', error);
    }

    const dateFrom = query.date_from ? new Date(query.date_from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = query.date_to ? new Date(query.date_to) : new Date();

    const dataPoints = await this.generateDataPoints(projectId, query.sprint_id, dateFrom, dateTo);
    const bottlenecks = this.calculateBottlenecks(dataPoints);
    const totalStories = dataPoints.length > 0 
      ? dataPoints[dataPoints.length - 1].backlog + 
        dataPoints[dataPoints.length - 1].inProgress + 
        dataPoints[dataPoints.length - 1].review + 
        dataPoints[dataPoints.length - 1].done
      : 0;

    const response: CumulativeFlowResponseDto = {
      dataPoints,
      bottlenecks,
      dateFrom: dateFrom.toISOString().split('T')[0],
      dateTo: dateTo.toISOString().split('T')[0],
      totalStories,
    };

    try {
      await this.redisService.set(cacheKey, JSON.stringify(response), this.CACHE_TTL);
    } catch (error) {
      this.logger.warn('Failed to cache cumulative flow data', error);
    }

    return response;
  }

  private async generateDataPoints(
    projectId: string,
    sprintId?: string,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<CumulativeFlowDataPointDto[]> {
    const dataPoints: CumulativeFlowDataPointDto[] = [];
    const storiesWhere: any = { projectId };
    if (sprintId) {
      storiesWhere.sprintId = sprintId;
    }

    const stories = await this.storyRepository.find({
      where: storiesWhere,
      order: { createdAt: 'ASC' },
    });

    if (stories.length === 0) {
      return [];
    }

    const startDate = dateFrom || new Date(stories[0].createdAt);
    const endDate = dateTo || new Date();

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];

      const counts = {
        date: dateStr,
        backlog: 0,
        inProgress: 0,
        review: 0,
        done: 0,
      };

      stories.forEach(story => {
        const createdDate = new Date(story.createdAt).toISOString().split('T')[0];
        if (createdDate <= dateStr) {
          const status = this.getStatusAtDate(story, currentDate);
          counts[status]++;
        }
      });

      dataPoints.push(counts);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dataPoints;
  }

  private getStatusAtDate(story: Story, date: Date): 'backlog' | 'inProgress' | 'review' | 'done' {
    if (story.status === StoryStatus.DONE) {
      const updatedAt = new Date(story.updatedAt);
      if (updatedAt <= date) {
        return 'done';
      }
    }

    if (story.status === StoryStatus.REVIEW || story.status === StoryStatus.DONE) {
      const updatedAt = new Date(story.updatedAt);
      if (updatedAt <= date) {
        return story.status === StoryStatus.REVIEW ? 'review' : 'done';
      }
    }

    if (story.status === StoryStatus.IN_PROGRESS || story.status === StoryStatus.REVIEW || story.status === StoryStatus.DONE) {
      const updatedAt = new Date(story.updatedAt);
      if (updatedAt <= date) {
        return 'inProgress';
      }
    }

    return 'backlog';
  }

  private calculateBottlenecks(dataPoints: CumulativeFlowDataPointDto[]): BottleneckIndicatorDto[] {
    if (dataPoints.length < 2) {
      return [];
    }

    const lastPoint = dataPoints[dataPoints.length - 1];
    const bottlenecks: BottleneckIndicatorDto[] = [];

    const statuses: Array<{ status: 'backlog' | 'inProgress' | 'review' | 'done'; count: number }> = [
      { status: 'backlog', count: lastPoint.backlog },
      { status: 'inProgress', count: lastPoint.inProgress },
      { status: 'review', count: lastPoint.review },
      { status: 'done', count: lastPoint.done },
    ];

    const total = statuses.reduce((sum, s) => sum + s.count, 0);
    const avgPerStatus = total / statuses.length;

    statuses.forEach(s => {
      const avgTimeInStatus = this.estimateAvgTimeInStatus(dataPoints, s.status);

      bottlenecks.push({
        status: s.status,
        avgTimeInStatus,
        queueSize: s.count,
        isBottleneck: s.status !== 'done' && s.count > avgPerStatus * 1.5,
      });
    });

    return bottlenecks;
  }

  private estimateAvgTimeInStatus(dataPoints: CumulativeFlowDataPointDto[], status: 'backlog' | 'inProgress' | 'review' | 'done'): number {
    if (dataPoints.length < 2) return 0;

    let totalTime = 0;
    let count = 0;

    for (let i = 1; i < dataPoints.length; i++) {
      const currentCount = dataPoints[i][status] || 0;
      const prevCount = dataPoints[i - 1][status] || 0;

      if (prevCount > 0) {
        totalTime += 24;
        count++;
      }
    }

    return count > 0 ? Math.round(totalTime / count) : 0;
  }
}
