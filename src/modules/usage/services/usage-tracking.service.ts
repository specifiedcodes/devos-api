import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UsageRecord } from '../../../database/entities/usage-record.entity';

export interface TrackUsageDto {
  workspaceId: string;
  projectId?: string;
  agentId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageSummary {
  workspaceId: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
  breakdown: {
    byProject: Record<string, { requests: number; cost: number }>;
    byProvider: Record<string, { requests: number; cost: number }>;
    byDate: Record<string, { requests: number; cost: number }>;
  };
}

@Injectable()
export class UsageTrackingService {
  private readonly logger = new Logger(UsageTrackingService.name);

  // Pricing as of 2026 (per 1K tokens)
  private readonly pricing: Record<string, { input: number; output: number }> =
    {
      'anthropic:claude-sonnet-4-5': { input: 0.003, output: 0.015 },
      'anthropic:claude-opus-4': { input: 0.015, output: 0.075 },
      'anthropic:claude-haiku-3-5': { input: 0.001, output: 0.005 },
      'openai:gpt-4-turbo': { input: 0.01, output: 0.03 },
      'openai:gpt-4': { input: 0.03, output: 0.06 },
      'openai:gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    };

  constructor(
    @InjectRepository(UsageRecord)
    private readonly usageRepository: Repository<UsageRecord>,
  ) {}

  /**
   * Track AI API usage for a workspace
   */
  async trackUsage(data: TrackUsageDto): Promise<void> {
    try {
      // Calculate cost based on provider pricing
      const costUSD = this.calculateCost(
        data.provider,
        data.model,
        data.inputTokens,
        data.outputTokens,
      );

      const today = new Date().toISOString().split('T')[0];

      // Check if record exists for today
      const existingRecord = await this.usageRepository.findOne({
        where: {
          workspaceId: data.workspaceId,
          projectId: data.projectId || null as any,
          agentId: data.agentId || null as any,
          provider: data.provider,
          model: data.model,
          date: new Date(today) as any,
        },
      });

      if (existingRecord) {
        // Update existing record
        await this.usageRepository.update(existingRecord.id, {
          requestCount: existingRecord.requestCount + 1,
          inputTokens: (
            BigInt(existingRecord.inputTokens) + BigInt(data.inputTokens)
          ).toString(),
          outputTokens: (
            BigInt(existingRecord.outputTokens) + BigInt(data.outputTokens)
          ).toString(),
          costUSD: Number(existingRecord.costUSD) + costUSD,
        });
      } else {
        // Create new record
        await this.usageRepository.save({
          ...data,
          requestCount: 1,
          inputTokens: data.inputTokens.toString(),
          outputTokens: data.outputTokens.toString(),
          costUSD,
          date: new Date(today),
        });
      }

      this.logger.log(
        `Usage tracked for workspace ${data.workspaceId}: ${data.inputTokens}/${data.outputTokens} tokens, $${costUSD.toFixed(4)}`,
      );
    } catch (error) {
      this.logger.error('Failed to track usage', error);
      // Don't throw - usage tracking failures shouldn't break agent execution
    }
  }

  /**
   * Get usage summary for a workspace within a date range
   */
  async getWorkspaceUsage(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<UsageSummary> {
    const records = await this.usageRepository.find({
      where: {
        workspaceId,
        date: Between(startDate, endDate) as any,
      },
      order: { date: 'DESC' },
    });

    // Aggregate usage
    const summary: UsageSummary = {
      workspaceId,
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUSD: 0,
      breakdown: {
        byProject: {},
        byProvider: {},
        byDate: {},
      },
    };

    for (const record of records) {
      summary.totalRequests += record.requestCount;
      summary.totalInputTokens += Number(record.inputTokens);
      summary.totalOutputTokens += Number(record.outputTokens);
      summary.totalCostUSD += Number(record.costUSD);

      // By project
      const projectId = record.projectId || 'workspace-level';
      if (!summary.breakdown.byProject[projectId]) {
        summary.breakdown.byProject[projectId] = { requests: 0, cost: 0 };
      }
      summary.breakdown.byProject[projectId].requests += record.requestCount;
      summary.breakdown.byProject[projectId].cost += Number(record.costUSD);

      // By provider
      const providerKey = `${record.provider}:${record.model}`;
      if (!summary.breakdown.byProvider[providerKey]) {
        summary.breakdown.byProvider[providerKey] = { requests: 0, cost: 0 };
      }
      summary.breakdown.byProvider[providerKey].requests +=
        record.requestCount;
      summary.breakdown.byProvider[providerKey].cost += Number(record.costUSD);

      // By date
      const date = record.date.toISOString().split('T')[0];
      if (!summary.breakdown.byDate[date]) {
        summary.breakdown.byDate[date] = { requests: 0, cost: 0 };
      }
      summary.breakdown.byDate[date].requests += record.requestCount;
      summary.breakdown.byDate[date].cost += Number(record.costUSD);
    }

    return summary;
  }

  /**
   * Export usage data as CSV
   */
  async exportUsage(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    const records = await this.usageRepository.find({
      where: {
        workspaceId,
        date: Between(startDate, endDate) as any,
      },
      order: { date: 'DESC' },
    });

    // Convert to CSV
    const headers = [
      'Date',
      'Project ID',
      'Provider',
      'Model',
      'Requests',
      'Input Tokens',
      'Output Tokens',
      'Cost (USD)',
    ];

    const rows = records.map((r) => [
      r.date.toISOString().split('T')[0],
      r.projectId || 'N/A',
      r.provider,
      r.model,
      r.requestCount.toString(),
      r.inputTokens.toString(),
      r.outputTokens.toString(),
      Number(r.costUSD).toFixed(4),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');

    return csv;
  }

  /**
   * Calculate cost based on provider pricing
   */
  private calculateCost(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    const key = `${provider}:${model}`;
    const rates = this.pricing[key] || { input: 0.01, output: 0.03 }; // Default fallback

    const inputCost = (inputTokens / 1000) * rates.input;
    const outputCost = (outputTokens / 1000) * rates.output;

    return inputCost + outputCost;
  }
}
