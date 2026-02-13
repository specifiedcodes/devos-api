import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiUsage, ApiProvider } from '../../../database/entities/api-usage.entity';
import { PricingService } from './pricing.service';
import { RedisService } from '../../../modules/redis/redis.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { sanitizeForAudit } from '../../../shared/logging/log-sanitizer';

/**
 * Usage summary response interface
 */
export interface UsageSummary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequests: number;
}

/**
 * Project usage breakdown item
 */
export interface ProjectUsageItem {
  projectId: string | null;
  projectName: string;
  cost: number;
  requests: number;
}

/**
 * Model usage breakdown item
 */
export interface ModelUsageItem {
  model: string;
  cost: number;
  requests: number;
}

/**
 * Service for tracking and querying API usage with real-time cost calculation
 *
 * Features:
 * - Records individual API usage transactions
 * - Calculates costs using PricingService
 * - Maintains Redis counters for real-time monthly costs
 * - Provides aggregation queries for dashboards
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @InjectRepository(ApiUsage)
    private readonly apiUsageRepository: Repository<ApiUsage>,
    private readonly pricingService: PricingService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Record API usage transaction
   *
   * @param workspaceId - Workspace ID
   * @param projectId - Project ID (optional)
   * @param provider - AI provider
   * @param model - Model identifier
   * @param inputTokens - Number of input tokens
   * @param outputTokens - Number of output tokens
   * @param byokKeyId - BYOK key ID (optional)
   * @param agentId - Agent identifier (optional)
   * @returns Created ApiUsage record
   */
  async recordUsage(
    workspaceId: string,
    projectId: string | null,
    provider: ApiProvider,
    model: string,
    inputTokens: number,
    outputTokens: number,
    byokKeyId?: string,
    agentId?: string,
  ): Promise<ApiUsage> {
    try {
      // Get current pricing
      const pricing = await this.pricingService.getCurrentPricing(
        provider,
        model,
      );

      // Calculate cost
      const costUsd = this.pricingService.calculateCost(
        inputTokens,
        outputTokens,
        pricing,
      );

      // Create usage record
      const usage = this.apiUsageRepository.create({
        workspaceId,
        projectId,
        provider,
        model,
        inputTokens,
        outputTokens,
        costUsd,
        byokKeyId,
        agentId,
      });

      // Save to database
      const saved = await this.apiUsageRepository.save(usage);

      // Increment Redis counter for real-time display
      await this.incrementMonthlyCounter(workspaceId, costUsd);

      // Audit log the usage recording
      // SECURITY FIX: Improved error handling with metrics tracking
      try {
        await this.auditService.log(
          workspaceId,
          'system', // System-initiated action
          AuditAction.CREATE,
          'api_usage',
          saved.id,
          {
            provider,
            model,
            inputTokens,
            outputTokens,
            costUsd,
            projectId: projectId || undefined,
            agentId: agentId || undefined,
          },
        );

        // If BYOK key was used, create a specific byok_key_used audit event
        if (byokKeyId) {
          await this.auditService.log(
            workspaceId,
            'system',
            AuditAction.BYOK_KEY_USED,
            'byok_key',
            byokKeyId,
            sanitizeForAudit({
              keyId: byokKeyId,
              provider,
              model,
              costUsd,
              inputTokens,
              outputTokens,
              projectId: projectId || undefined,
              agentId: agentId || undefined,
            }),
          );
        }
      } catch (auditError) {
        // SECURITY: Audit failures for security-critical operations are ERROR level
        // For usage tracking (which creates audit trail), this is important
        this.logger.error(
          `AUDIT FAILURE: Failed to log usage creation for workspace ${workspaceId}: ${auditError instanceof Error ? auditError.message : 'Unknown error'}`,
        );
      }

      this.logger.log(
        `Recorded usage: workspace=${workspaceId}, cost=$${costUsd}, tokens=${inputTokens}+${outputTokens}`,
      );

      return saved;
    } catch (error) {
      this.logger.error('Failed to record usage', error);
      throw error;
    }
  }

  /**
   * Get workspace usage summary for a date range
   *
   * @param workspaceId - Workspace ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Usage summary
   */
  async getWorkspaceUsageSummary(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<UsageSummary> {
    // Try Redis first for current month
    const isCurrentMonth = this.isCurrentMonth(startDate, endDate);
    if (isCurrentMonth) {
      const redisTotal = await this.getMonthlyTotalFromRedis(workspaceId);
      if (redisTotal !== null) {
        // Still query database for other metrics
        const dbMetrics = await this.queryUsageMetrics(
          workspaceId,
          startDate,
          endDate,
        );
        return {
          ...dbMetrics,
          totalCost: redisTotal, // Use Redis for real-time cost
        };
      }
    }

    // Fallback to database query
    return this.queryUsageMetrics(workspaceId, startDate, endDate);
  }

  /**
   * Get project usage breakdown for a workspace
   *
   * @param workspaceId - Workspace ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Array of project usage items
   */
  async getProjectUsageBreakdown(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ProjectUsageItem[]> {
    // SECURITY FIX: Added explicit workspace_id filter to JOIN clause
    const results = await this.apiUsageRepository
      .createQueryBuilder('usage')
      .leftJoin(
        'projects',
        'project',
        'usage.project_id = project.id AND project.workspace_id = :workspaceId',
      )
      .select('usage.project_id', 'projectId')
      .addSelect('COALESCE(project.name, \'No Project\')', 'projectName')
      .addSelect('SUM(usage.cost_usd)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .where('usage.workspace_id = :workspaceId', { workspaceId })
      .andWhere('usage.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('usage.project_id')
      .addGroupBy('project.name')
      .orderBy('SUM(usage.cost_usd)', 'DESC')
      .getRawMany();

    return results.map((r) => ({
      projectId: r.projectId,
      projectName: r.projectName || 'No Project',
      cost: parseFloat(r.cost),
      requests: parseInt(r.requests, 10),
    }));
  }

  /**
   * Get model usage breakdown for a workspace
   *
   * @param workspaceId - Workspace ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Array of model usage items
   */
  async getModelUsageBreakdown(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ModelUsageItem[]> {
    const results = await this.apiUsageRepository
      .createQueryBuilder('usage')
      .select('usage.model', 'model')
      .addSelect('SUM(usage.cost_usd)', 'cost')
      .addSelect('COUNT(*)', 'requests')
      .where('usage.workspace_id = :workspaceId', { workspaceId })
      .andWhere('usage.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('usage.model')
      .orderBy('SUM(usage.cost_usd)', 'DESC')
      .getRawMany();

    return results.map((r) => ({
      model: r.model,
      cost: parseFloat(r.cost),
      requests: parseInt(r.requests, 10),
    }));
  }

  /**
   * Get daily usage breakdown for charting
   *
   * @param workspaceId - Workspace ID
   * @param days - Number of days to query (default: 30, max: 365)
   * @returns Array of daily usage with date and cost
   */
  async getDailyUsage(
    workspaceId: string,
    days: number = 30,
  ): Promise<Array<{ date: string; cost: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const results = await this.apiUsageRepository
      .createQueryBuilder('usage')
      .select("DATE(usage.created_at)", 'date')
      .addSelect('SUM(usage.cost_usd)', 'cost')
      .where('usage.workspace_id = :workspaceId', { workspaceId })
      .andWhere('usage.created_at >= :startDate', { startDate })
      .groupBy('DATE(usage.created_at)')
      .orderBy('DATE(usage.created_at)', 'ASC')
      .getRawMany();

    return results.map((r) => ({
      date: r.date,
      cost: parseFloat(r.cost || '0'),
    }));
  }

  /**
   * Get usage for a specific BYOK key
   * Used by Story 3.2 integration
   *
   * @param keyId - BYOK key ID
   * @param workspaceId - Workspace ID
   * @returns Usage summary for the key
   */
  async getKeyUsage(
    keyId: string,
    workspaceId: string,
  ): Promise<{ requests: number; cost: number; totalTokens: number }> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const result = await this.apiUsageRepository
      .createQueryBuilder('usage')
      .select('COUNT(*)', 'requests')
      .addSelect('SUM(usage.cost_usd)', 'cost')
      .addSelect('SUM(usage.input_tokens + usage.output_tokens)', 'totalTokens')
      .where('usage.byok_key_id = :keyId', { keyId })
      .andWhere('usage.workspace_id = :workspaceId', { workspaceId })
      .andWhere('usage.created_at BETWEEN :startOfMonth AND :endOfMonth', {
        startOfMonth,
        endOfMonth,
      })
      .getRawOne();

    return {
      requests: parseInt(result.requests || '0', 10),
      cost: parseFloat(result.cost || '0'),
      totalTokens: parseInt(result.totalTokens || '0', 10),
    };
  }

  /**
   * Increment monthly cost counter in Redis
   * TTL is set only on first write to avoid redundant expire calls
   *
   * @param workspaceId - Workspace ID
   * @param cost - Cost to add
   */
  private async incrementMonthlyCounter(
    workspaceId: string,
    cost: number,
  ): Promise<void> {
    try {
      const now = new Date();
      const monthKey = now.toISOString().slice(0, 7); // YYYY-MM
      const redisKey = `workspace:${workspaceId}:cost:month:${monthKey}`;

      // Increment counter
      const newValue = await this.redisService.increment(redisKey, cost);

      // Set TTL only if this is the first write (value equals cost)
      // This avoids redundant expire calls on every usage record
      if (newValue !== null && Math.abs(newValue - cost) < 0.000001) {
        // Calculate TTL: end of current month + 7 days
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const ttlSeconds = Math.floor(
          (endOfMonth.getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now()) / 1000,
        );

        await this.redisService.expire(redisKey, ttlSeconds);
        this.logger.debug(`Set TTL for ${redisKey}: ${ttlSeconds}s`);
      }
    } catch (error) {
      // Don't fail the request if Redis is down
      this.logger.warn(
        `Failed to increment Redis counter: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get monthly total from Redis counter
   *
   * @param workspaceId - Workspace ID
   * @returns Total cost for current month or null if not cached
   */
  private async getMonthlyTotalFromRedis(
    workspaceId: string,
  ): Promise<number | null> {
    try {
      const monthKey = new Date().toISOString().slice(0, 7);
      const redisKey = `workspace:${workspaceId}:cost:month:${monthKey}`;
      const value = await this.redisService.get(redisKey);
      return value ? parseFloat(value) : null;
    } catch (error) {
      this.logger.warn(
        `Failed to get Redis counter: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Query usage metrics from database
   *
   * @param workspaceId - Workspace ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Usage summary
   */
  private async queryUsageMetrics(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<UsageSummary> {
    const result = await this.apiUsageRepository
      .createQueryBuilder('usage')
      .select('SUM(usage.cost_usd)', 'totalCost')
      .addSelect('SUM(usage.input_tokens)', 'totalInputTokens')
      .addSelect('SUM(usage.output_tokens)', 'totalOutputTokens')
      .addSelect('COUNT(*)', 'totalRequests')
      .where('usage.workspace_id = :workspaceId', { workspaceId })
      .andWhere('usage.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawOne();

    return {
      totalCost: parseFloat(result.totalCost || '0'),
      totalInputTokens: parseInt(result.totalInputTokens || '0', 10),
      totalOutputTokens: parseInt(result.totalOutputTokens || '0', 10),
      totalRequests: parseInt(result.totalRequests || '0', 10),
    };
  }

  /**
   * Get current month spend for a workspace
   * Used by Story 3.5 spending limits feature
   *
   * @param workspaceId - Workspace ID
   * @returns Total spend for current month
   */
  async getCurrentMonthSpend(workspaceId: string): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Try Redis first for real-time cost
    const redisTotal = await this.getMonthlyTotalFromRedis(workspaceId);
    if (redisTotal !== null) {
      return redisTotal;
    }

    // Fallback to database query
    const result = await this.apiUsageRepository
      .createQueryBuilder('usage')
      .select('SUM(usage.cost_usd)', 'totalCost')
      .where('usage.workspace_id = :workspaceId', { workspaceId })
      .andWhere('usage.created_at BETWEEN :startOfMonth AND :endOfMonth', {
        startOfMonth,
        endOfMonth,
      })
      .getRawOne();

    return parseFloat(result.totalCost || '0');
  }

  /**
   * Check if date range is within current month
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @returns True if date range is within current month boundaries
   */
  private isCurrentMonth(startDate: Date, endDate: Date): boolean {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Check if the requested range is within the current month
    return startDate >= startOfMonth && endDate <= endOfMonth;
  }
}
