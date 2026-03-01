import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ApiUsage } from '../../../database/entities/api-usage.entity';
import { Agent } from '../../../database/entities/agent.entity';
import { RedisService } from '../../redis/redis.service';
import {
  CostAnalyticsQueryDto,
  CostAnalyticsResponseDto,
  DailyCostDto,
  CostByModelDto,
  CostByAgentDto,
} from '../dto/cost-analytics.dto';

@Injectable()
export class CostAnalyticsService {
  private readonly logger = new Logger(CostAnalyticsService.name);
  private readonly CACHE_TTL = 1800;
  private readonly CACHE_PREFIX = 'cost_analytics:';

  constructor(
    @InjectRepository(ApiUsage)
    private readonly apiUsageRepository: Repository<ApiUsage>,
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
    private readonly redisService: RedisService,
  ) {}

  async getCostAnalytics(
    workspaceId: string,
    projectId: string,
    query: CostAnalyticsQueryDto,
  ): Promise<CostAnalyticsResponseDto> {
    const cacheKey = `${this.CACHE_PREFIX}${workspaceId}:${projectId}:${query.date_from || 'all'}:${query.date_to || 'all'}`;

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn('Failed to get cached cost analytics data', error);
    }

    const dateFrom = query.date_from ? new Date(query.date_from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = query.date_to ? new Date(query.date_to) : new Date();

    const dailyCosts = await this.getDailyCosts(workspaceId, dateFrom, dateTo);
    const byModel = await this.getCostByModel(workspaceId, dateFrom, dateTo);
    const byAgent = await this.getCostByAgent(workspaceId, projectId, dateFrom, dateTo);
    const totalCost = dailyCosts.reduce((sum, dc) => sum + dc.cost, 0);

    const projectedMonthlyCost = this.calculateProjectedMonthlyCost(dailyCosts);
    const recommendations = this.generateRecommendations(byModel, projectedMonthlyCost, totalCost);

    const response: CostAnalyticsResponseDto = {
      dailyCosts,
      byModel,
      byAgent,
      projectedMonthlyCost,
      recommendations,
      totalCost: Math.round(totalCost * 100) / 100,
      currency: 'USD',
    };

    try {
      await this.redisService.set(cacheKey, JSON.stringify(response), this.CACHE_TTL);
    } catch (error) {
      this.logger.warn('Failed to cache cost analytics data', error);
    }

    return response;
  }

  private async getDailyCosts(
    workspaceId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<DailyCostDto[]> {
    const usageRecords = await this.apiUsageRepository
      .createQueryBuilder('usage')
      .select('DATE(usage.createdAt)', 'date')
      .addSelect('SUM(usage.costUsd)', 'cost')
      .where('usage.workspaceId = :workspaceId', { workspaceId })
      .andWhere('usage.createdAt >= :dateFrom', { dateFrom })
      .andWhere('usage.createdAt <= :dateTo', { dateTo })
      .groupBy('DATE(usage.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    const dailyCosts: DailyCostDto[] = [];
    const currentDate = new Date(dateFrom);

    const usageMap = new Map<string, number>();
    usageRecords.forEach(record => {
      usageMap.set(record.date, parseFloat(record.cost) || 0);
    });

    while (currentDate <= dateTo) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dailyCosts.push({
        date: dateStr,
        cost: usageMap.get(dateStr) || 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dailyCosts;
  }

  private async getCostByModel(
    workspaceId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<CostByModelDto[]> {
    const usageRecords = await this.apiUsageRepository
      .createQueryBuilder('usage')
      .select('usage.model', 'model')
      .addSelect('SUM(usage.costUsd)', 'cost')
      .where('usage.workspaceId = :workspaceId', { workspaceId })
      .andWhere('usage.createdAt >= :dateFrom', { dateFrom })
      .andWhere('usage.createdAt <= :dateTo', { dateTo })
      .groupBy('usage.model')
      .getRawMany();

    const totalCost = usageRecords.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);

    return usageRecords
      .filter(r => r.model)
      .map(record => ({
        model: record.model,
        cost: Math.round((parseFloat(record.cost) || 0) * 100) / 100,
        percentage: totalCost > 0 
          ? Math.round(((parseFloat(record.cost) || 0) / totalCost) * 100 * 10) / 10 
          : 0,
      }))
      .sort((a, b) => b.cost - a.cost);
  }

  private async getCostByAgent(
    workspaceId: string,
    projectId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<CostByAgentDto[]> {
    const usageRecords = await this.apiUsageRepository
      .createQueryBuilder('usage')
      .select('usage.agentId', 'agentId')
      .addSelect('SUM(usage.costUsd)', 'cost')
      .where('usage.workspaceId = :workspaceId', { workspaceId })
      .andWhere('usage.createdAt >= :dateFrom', { dateFrom })
      .andWhere('usage.createdAt <= :dateTo', { dateTo })
      .groupBy('usage.agentId')
      .getRawMany();

    const agentIds = usageRecords
      .filter(r => r.agentId)
      .map(r => r.agentId);

    const agents = await this.agentRepository.find({
      where: { id: In(agentIds) },
    });
    const agentMap = new Map(agents.map(a => [a.id, a.name]));

    return usageRecords
      .filter(r => r.agentId)
      .map(record => ({
        agentId: record.agentId,
        agentName: agentMap.get(record.agentId) || 'Unknown Agent',
        cost: Math.round((parseFloat(record.cost) || 0) * 100) / 100,
      }))
      .sort((a, b) => b.cost - a.cost);
  }

  private calculateProjectedMonthlyCost(dailyCosts: DailyCostDto[]): number {
    if (dailyCosts.length === 0) return 0;

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = now.getDate();
    const daysRemaining = daysInMonth - daysPassed;

    const last7Days = dailyCosts.slice(-7);
    const avgDailyCost = last7Days.reduce((sum, dc) => sum + dc.cost, 0) / Math.max(last7Days.length, 1);

    const monthToDateCost = dailyCosts
      .filter(dc => {
        const date = new Date(dc.date);
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      })
      .reduce((sum, dc) => sum + dc.cost, 0);

    return Math.round((monthToDateCost + (avgDailyCost * daysRemaining)) * 100) / 100;
  }

  private generateRecommendations(
    byModel: CostByModelDto[],
    projectedMonthlyCost: number,
    totalCost: number,
  ): string[] {
    const recommendations: string[] = [];

    const expensiveModel = byModel[0];
    if (expensiveModel && expensiveModel.percentage > 50) {
      recommendations.push(
        `Consider using cheaper models for simpler tasks. ${expensiveModel.model} accounts for ${expensiveModel.percentage}% of costs.`
      );
    }

    if (projectedMonthlyCost > 100) {
      recommendations.push(
        'Consider setting up usage budgets and alerts to avoid unexpected costs.'
      );
    }

    const haikuUsage = byModel.find(m => m.model?.toLowerCase().includes('haiku'));
    if (!haikuUsage || haikuUsage.percentage < 10) {
      recommendations.push(
        'Claude Haiku is cost-effective for simple tasks. Consider using it more for routine operations.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Your current API usage pattern looks efficient. Keep monitoring for any changes.');
    }

    return recommendations;
  }
}
