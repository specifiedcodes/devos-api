import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Agent, AgentStatus } from '../../../database/entities/agent.entity';
import { Story, StoryStatus } from '../../../database/entities/story.entity';
import { RedisService } from '../../redis/redis.service';
import {
  AgentPerformanceQueryDto,
  AgentPerformanceResponseDto,
  AgentPerformanceItemDto,
} from '../dto/agent-performance.dto';

@Injectable()
export class AgentPerformanceService {
  private readonly logger = new Logger(AgentPerformanceService.name);
  private readonly CACHE_TTL = 1800;
  private readonly CACHE_PREFIX = 'agent_performance:';

  constructor(
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
    @InjectRepository(Story)
    private readonly storyRepository: Repository<Story>,
    private readonly redisService: RedisService,
  ) {}

  async getAgentPerformance(
    workspaceId: string,
    projectId: string,
    query: AgentPerformanceQueryDto,
  ): Promise<AgentPerformanceResponseDto> {
    const cacheKey = `${this.CACHE_PREFIX}${workspaceId}:${projectId}:${query.date_from || 'all'}:${query.date_to || 'all'}:${query.agent_id || 'all'}`;

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn('Failed to get cached agent performance data', error);
    }

    const dateFrom = query.date_from ? new Date(query.date_from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateTo = query.date_to ? new Date(query.date_to) : new Date();

    const agentWhereCondition: any = { workspaceId };
    if (query.agent_id) {
      agentWhereCondition.id = query.agent_id;
    }

    const agents = await this.agentRepository.find({
      where: agentWhereCondition,
    });

    const agentsData: AgentPerformanceItemDto[] = await Promise.all(
      agents.map(async (agent) => {
        const storyWhereCondition: any = {
          projectId,
          assignedAgentId: agent.id,
        };

        const allStories = await this.storyRepository.find({
          where: storyWhereCondition,
        });

        const completedStories = allStories.filter(s => s.status === StoryStatus.DONE);
        const failedStories = allStories.filter(s => s.status === StoryStatus.REVIEW);

        const tasksCompleted = completedStories.length;
        const totalTasks = tasksCompleted + failedStories.length;
        const successRate = totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 100;

        let totalTimeHours = 0;
        completedStories.forEach(story => {
          if (story.createdAt && story.updatedAt) {
            const timeDiff = new Date(story.updatedAt).getTime() - new Date(story.createdAt).getTime();
            totalTimeHours += timeDiff / (1000 * 60 * 60);
          }
        });
        const avgTimePerTaskHours = tasksCompleted > 0 
          ? Math.round((totalTimeHours / tasksCompleted) * 100) / 100 
          : 0;

        const trendData = await this.getTrendData(agent.id, projectId, dateFrom, dateTo);

        return {
          agentId: agent.id,
          agentName: agent.name,
          agentType: agent.type,
          tasksCompleted,
          successRate,
          avgTimePerTaskHours,
          trendData,
        };
      })
    );

    const response: AgentPerformanceResponseDto = {
      agents: agentsData,
      dateFrom: dateFrom.toISOString().split('T')[0],
      dateTo: dateTo.toISOString().split('T')[0],
    };

    try {
      await this.redisService.set(cacheKey, JSON.stringify(response), this.CACHE_TTL);
    } catch (error) {
      this.logger.warn('Failed to cache agent performance data', error);
    }

    return response;
  }

  private async getTrendData(
    agentId: string,
    projectId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<number[]> {
    const trendData: number[] = [];
    const startDate = new Date(dateFrom);
    startDate.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(startDate);
    dayEnd.setDate(dayEnd.getDate() + 6);
    dayEnd.setHours(23, 59, 59, 999);

    const stories = await this.storyRepository
      .createQueryBuilder('story')
      .select(`DATE(story.updatedAt)`, 'date')
      .addSelect('COUNT(*)', 'count')
      .where('story.assignedAgentId = :agentId', { agentId })
      .andWhere('story.projectId = :projectId', { projectId })
      .andWhere('story.status = :status', { status: StoryStatus.DONE })
      .andWhere('story.updatedAt >= :startDate', { startDate })
      .andWhere('story.updatedAt <= :dayEnd', { dayEnd })
      .groupBy('DATE(story.updatedAt)')
      .getRawMany();

    const countByDate = new Map<string, number>();
    stories.forEach((s: { date: string; count: string }) => {
      countByDate.set(s.date, parseInt(s.count, 10) || 0);
    });

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + i);
      const dateStr = dayDate.toISOString().split('T')[0];
      trendData.push(countByDate.get(dateStr) || 0);
    }

    return trendData;
  }
}
