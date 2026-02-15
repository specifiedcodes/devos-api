import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../../../modules/redis/redis.service';

/**
 * Model pricing interface
 */
export interface ModelPricing {
  provider: string;
  model: string;
  inputPricePerMillion: number; // USD per 1M tokens
  outputPricePerMillion: number; // USD per 1M tokens
  cachedInputPricePerMillion?: number; // USD per 1M cached input tokens
  effectiveDate: string;
}

/**
 * Service for managing AI model pricing with Redis caching
 *
 * Pricing is cached for 24 hours to reduce API calls and improve performance.
 * Falls back to hardcoded pricing if Redis is unavailable.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  // Hardcoded fallback pricing (as of 2026-01)
  // Source: Anthropic, OpenAI, and Google AI pricing pages
  private readonly FALLBACK_PRICING: Record<string, ModelPricing> = {
    // Latest Anthropic models (2026-01)
    'anthropic:claude-sonnet-4-5-20250929': {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      inputPricePerMillion: 3.0,
      outputPricePerMillion: 15.0,
      cachedInputPricePerMillion: 0.30,
      effectiveDate: '2026-01-01',
    },
    'anthropic:claude-opus-4-5-20251101': {
      provider: 'anthropic',
      model: 'claude-opus-4-5-20251101',
      inputPricePerMillion: 15.0,
      outputPricePerMillion: 75.0,
      cachedInputPricePerMillion: 1.50,
      effectiveDate: '2026-01-01',
    },
    // Legacy Anthropic models (for backward compatibility)
    'anthropic:claude-3-5-sonnet-20241022': {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      inputPricePerMillion: 3.0,
      outputPricePerMillion: 15.0,
      cachedInputPricePerMillion: 0.30,
      effectiveDate: '2026-01-01',
    },
    'anthropic:claude-3-opus-20240229': {
      provider: 'anthropic',
      model: 'claude-3-opus-20240229',
      inputPricePerMillion: 15.0,
      outputPricePerMillion: 75.0,
      cachedInputPricePerMillion: 1.50,
      effectiveDate: '2026-01-01',
    },
    // OpenAI models
    'openai:gpt-4-turbo': {
      provider: 'openai',
      model: 'gpt-4-turbo',
      inputPricePerMillion: 10.0,
      outputPricePerMillion: 30.0,
      effectiveDate: '2026-01-01',
    },
    'openai:gpt-3.5-turbo': {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      inputPricePerMillion: 0.5,
      outputPricePerMillion: 1.5,
      effectiveDate: '2026-01-01',
    },
    // Google AI models
    'google:gemini-2.0-flash': {
      provider: 'google',
      model: 'gemini-2.0-flash',
      inputPricePerMillion: 0.10,
      outputPricePerMillion: 0.40,
      cachedInputPricePerMillion: 0.025,
      effectiveDate: '2026-01-01',
    },
    'google:gemini-2.0-pro': {
      provider: 'google',
      model: 'gemini-2.0-pro',
      inputPricePerMillion: 1.25,
      outputPricePerMillion: 5.00,
      effectiveDate: '2026-01-01',
    },
    'google:text-embedding-004': {
      provider: 'google',
      model: 'text-embedding-004',
      inputPricePerMillion: 0.006,
      outputPricePerMillion: 0,
      effectiveDate: '2026-01-01',
    },
    // DeepSeek models
    'deepseek:deepseek-chat': {
      provider: 'deepseek',
      model: 'deepseek-chat',
      inputPricePerMillion: 0.27,
      outputPricePerMillion: 1.10,
      cachedInputPricePerMillion: 0.07,
      effectiveDate: '2026-01-01',
    },
    'deepseek:deepseek-reasoner': {
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      inputPricePerMillion: 0.55,
      outputPricePerMillion: 2.19,
      effectiveDate: '2026-01-01',
    },
  };

  constructor(private readonly redisService: RedisService) {}

  /**
   * Get current pricing for a model
   * Tries Redis cache first, falls back to hardcoded pricing
   *
   * @param provider - AI provider (anthropic, openai, google, deepseek)
   * @param model - Model identifier
   * @returns Pricing information
   */
  async getCurrentPricing(
    provider: string,
    model: string,
  ): Promise<ModelPricing> {
    const cacheKey = `pricing:${provider}:${model}`;

    // Try Redis cache first
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        this.logger.debug(`Pricing cache hit for ${provider}:${model}`);
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(
        `Redis unavailable for pricing lookup: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Fallback to hardcoded pricing
    const pricingKey = `${provider}:${model}`;
    const pricing =
      this.FALLBACK_PRICING[pricingKey] ||
      this.FALLBACK_PRICING['anthropic:claude-sonnet-4-5-20250929']; // Default fallback

    if (!this.FALLBACK_PRICING[pricingKey]) {
      this.logger.warn(
        `No pricing found for ${pricingKey}, using default Claude Sonnet 4.5 pricing`,
      );
    }

    // Cache for 24 hours
    try {
      await this.redisService.set(cacheKey, JSON.stringify(pricing), 86400); // 24 hours
      this.logger.debug(`Cached pricing for ${provider}:${model}`);
    } catch (error) {
      this.logger.warn(
        `Failed to cache pricing: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return pricing;
  }

  /**
   * Calculate cost for a given number of tokens
   *
   * Supports cached token pricing: if cachedTokens is provided and the model
   * has cachedInputPricePerMillion, cached tokens are priced at the discounted
   * rate and subtracted from regular input tokens. If no cached pricing exists,
   * cached tokens are treated as regular input tokens.
   *
   * @param inputTokens - Number of input tokens
   * @param outputTokens - Number of output tokens
   * @param pricing - Model pricing information
   * @param cachedTokens - Number of cached input tokens (optional)
   * @returns Calculated cost in USD (rounded to 6 decimal places)
   */
  calculateCost(
    inputTokens: number,
    outputTokens: number,
    pricing: ModelPricing,
    cachedTokens?: number,
  ): number {
    // Cap cached tokens to not exceed actual input tokens to avoid overcharging
    const effectiveCachedTokens = cachedTokens
      ? Math.min(cachedTokens, inputTokens)
      : 0;
    const effectiveInputTokens = inputTokens - effectiveCachedTokens;
    const cachedCost =
      effectiveCachedTokens > 0 && pricing.cachedInputPricePerMillion
        ? (effectiveCachedTokens / 1_000_000) * pricing.cachedInputPricePerMillion
        : 0;
    const inputCost =
      (effectiveInputTokens / 1_000_000) * pricing.inputPricePerMillion;
    const outputCost =
      (outputTokens / 1_000_000) * pricing.outputPricePerMillion;

    // Round to 6 decimal places to match DECIMAL(10, 6) precision
    return Math.round((inputCost + outputCost + cachedCost) * 1_000_000) / 1_000_000;
  }

  /**
   * Refresh all pricing data in Redis cache
   * Runs daily at 00:00 UTC via cron job
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async refreshAllPricing(): Promise<void> {
    this.logger.log('Refreshing all pricing data');

    // In future: Fetch from Anthropic/OpenAI APIs
    // For now: Re-cache hardcoded values
    for (const [key, pricing] of Object.entries(this.FALLBACK_PRICING)) {
      const cacheKey = `pricing:${pricing.provider}:${pricing.model}`;
      try {
        await this.redisService.set(cacheKey, JSON.stringify(pricing), 86400);
        this.logger.debug(`Refreshed pricing for ${key}`);
      } catch (error) {
        this.logger.error(
          `Failed to refresh pricing for ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    this.logger.log('Pricing refresh complete');
  }
}
