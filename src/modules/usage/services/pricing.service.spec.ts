import { Test, TestingModule } from '@nestjs/testing';
import { PricingService } from './pricing.service';
import { RedisService } from '../../../modules/redis/redis.service';

describe('PricingService', () => {
  let service: PricingService;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<PricingService>(PricingService);
    redisService = module.get(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentPricing', () => {
    it('should return pricing for Claude 3.5 Sonnet', async () => {
      redisService.get.mockResolvedValue(null);

      const pricing = await service.getCurrentPricing(
        'anthropic',
        'claude-3-5-sonnet-20241022',
      );

      expect(pricing.inputPricePerMillion).toBe(3.0);
      expect(pricing.outputPricePerMillion).toBe(15.0);
      expect(pricing.provider).toBe('anthropic');
      expect(pricing.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should return pricing for Claude Opus', async () => {
      redisService.get.mockResolvedValue(null);

      const pricing = await service.getCurrentPricing(
        'anthropic',
        'claude-3-opus-20240229',
      );

      expect(pricing.inputPricePerMillion).toBe(15.0);
      expect(pricing.outputPricePerMillion).toBe(75.0);
    });

    it('should return pricing for GPT-4 Turbo', async () => {
      redisService.get.mockResolvedValue(null);

      const pricing = await service.getCurrentPricing('openai', 'gpt-4-turbo');

      expect(pricing.inputPricePerMillion).toBe(10.0);
      expect(pricing.outputPricePerMillion).toBe(30.0);
    });

    it('should return pricing for GPT-3.5 Turbo', async () => {
      redisService.get.mockResolvedValue(null);

      const pricing = await service.getCurrentPricing(
        'openai',
        'gpt-3.5-turbo',
      );

      expect(pricing.inputPricePerMillion).toBe(0.5);
      expect(pricing.outputPricePerMillion).toBe(1.5);
    });

    it('should fall back to default pricing for unknown model', async () => {
      redisService.get.mockResolvedValue(null);

      const pricing = await service.getCurrentPricing(
        'anthropic',
        'unknown-model',
      );

      // Should fallback to Claude Sonnet 4.5 pricing (latest default)
      expect(pricing.model).toBe('claude-sonnet-4-5-20250929');
      expect(pricing.inputPricePerMillion).toBe(3.0);
    });

    it('should use cached pricing from Redis if available', async () => {
      const cachedPricing = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        effectiveDate: '2026-01-01',
      };

      redisService.get.mockResolvedValue(JSON.stringify(cachedPricing));

      const pricing = await service.getCurrentPricing(
        'anthropic',
        'claude-3-5-sonnet-20241022',
      );

      expect(pricing).toEqual(cachedPricing);
      expect(redisService.get).toHaveBeenCalledWith(
        'pricing:anthropic:claude-3-5-sonnet-20241022',
      );
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('should cache pricing in Redis when not cached', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(undefined);

      await service.getCurrentPricing('anthropic', 'claude-3-5-sonnet-20241022');

      expect(redisService.set).toHaveBeenCalledWith(
        'pricing:anthropic:claude-3-5-sonnet-20241022',
        expect.any(String),
        86400, // 24 hours
      );
    });

    it('should handle Redis unavailability gracefully', async () => {
      redisService.get.mockRejectedValue(new Error('Redis unavailable'));
      redisService.set.mockRejectedValue(new Error('Redis unavailable'));

      const pricing = await service.getCurrentPricing(
        'anthropic',
        'claude-3-5-sonnet-20241022',
      );

      // Should still return fallback pricing
      expect(pricing.inputPricePerMillion).toBe(3.0);
      expect(pricing.outputPricePerMillion).toBe(15.0);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost correctly for Claude 3.5 Sonnet', () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        effectiveDate: '2026-01-01',
      };

      const cost = service.calculateCost(1500, 800, pricing);

      // (1500/1M * $3) + (800/1M * $15) = $0.0045 + $0.012 = $0.0165
      expect(cost).toBe(0.0165);
    });

    it('should calculate cost correctly for large token counts', () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        effectiveDate: '2026-01-01',
      };

      const cost = service.calculateCost(1_000_000, 500_000, pricing);

      // (1M/1M * $3) + (500K/1M * $15) = $3 + $7.5 = $10.5
      expect(cost).toBe(10.5);
    });

    it('should round to 6 decimal places', () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        effectiveDate: '2026-01-01',
      };

      const cost = service.calculateCost(333, 777, pricing);

      // Should round to 6 decimal places
      expect(cost.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(6);
    });

    it('should handle zero tokens', () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        effectiveDate: '2026-01-01',
      };

      const cost = service.calculateCost(0, 0, pricing);

      expect(cost).toBe(0);
    });

    it('should calculate cost for expensive models correctly', () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        inputPricePerMillion: 15.0,
        outputPricePerMillion: 75.0,
        effectiveDate: '2026-01-01',
      };

      const cost = service.calculateCost(1000, 2000, pricing);

      // (1000/1M * $15) + (2000/1M * $75) = $0.015 + $0.15 = $0.165
      expect(cost).toBe(0.165);
    });
  });

  describe('getCurrentPricing - DeepSeek models', () => {
    it('should return correct pricing for deepseek:deepseek-chat', async () => {
      redisService.get.mockResolvedValue(null);

      const pricing = await service.getCurrentPricing('deepseek', 'deepseek-chat');

      expect(pricing.provider).toBe('deepseek');
      expect(pricing.model).toBe('deepseek-chat');
      expect(pricing.inputPricePerMillion).toBe(0.27);
      expect(pricing.outputPricePerMillion).toBe(1.10);
    });

    it('should return correct pricing for deepseek:deepseek-reasoner', async () => {
      redisService.get.mockResolvedValue(null);

      const pricing = await service.getCurrentPricing('deepseek', 'deepseek-reasoner');

      expect(pricing.provider).toBe('deepseek');
      expect(pricing.model).toBe('deepseek-reasoner');
      expect(pricing.inputPricePerMillion).toBe(0.55);
      expect(pricing.outputPricePerMillion).toBe(2.19);
    });

    it('should calculate cost correctly for DeepSeek deepseek-chat model', () => {
      const pricing = {
        provider: 'deepseek',
        model: 'deepseek-chat',
        inputPricePerMillion: 0.27,
        outputPricePerMillion: 1.10,
        effectiveDate: '2026-01-01',
      };

      const cost = service.calculateCost(10000, 5000, pricing);

      // (10000/1M * $0.27) + (5000/1M * $1.10) = $0.0027 + $0.0055 = $0.0082
      expect(cost).toBeCloseTo(0.0082, 4);
    });

    it('should calculate cost correctly for DeepSeek deepseek-reasoner model', () => {
      const pricing = {
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        inputPricePerMillion: 0.55,
        outputPricePerMillion: 2.19,
        effectiveDate: '2026-01-01',
      };

      const cost = service.calculateCost(1000000, 500000, pricing);

      // (1M/1M * $0.55) + (500K/1M * $2.19) = $0.55 + $1.095 = $1.645
      expect(cost).toBeCloseTo(1.645, 4);
    });
  });

  describe('refreshAllPricing', () => {
    it('should refresh all pricing in Redis', async () => {
      redisService.set.mockResolvedValue(undefined);

      await service.refreshAllPricing();

      // Should cache all 11 models (2 new Anthropic + 2 legacy Anthropic + 2 OpenAI + 3 Google + 2 DeepSeek)
      expect(redisService.set).toHaveBeenCalledTimes(11);

      // Verify specific cache calls
      expect(redisService.set).toHaveBeenCalledWith(
        'pricing:anthropic:claude-3-5-sonnet-20241022',
        expect.any(String),
        86400,
      );
      expect(redisService.set).toHaveBeenCalledWith(
        'pricing:anthropic:claude-3-opus-20240229',
        expect.any(String),
        86400,
      );
      expect(redisService.set).toHaveBeenCalledWith(
        'pricing:openai:gpt-4-turbo',
        expect.any(String),
        86400,
      );
      expect(redisService.set).toHaveBeenCalledWith(
        'pricing:openai:gpt-3.5-turbo',
        expect.any(String),
        86400,
      );
      expect(redisService.set).toHaveBeenCalledWith(
        'pricing:deepseek:deepseek-chat',
        expect.any(String),
        86400,
      );
      expect(redisService.set).toHaveBeenCalledWith(
        'pricing:deepseek:deepseek-reasoner',
        expect.any(String),
        86400,
      );
    });

    it('should handle Redis errors during refresh gracefully', async () => {
      redisService.set.mockRejectedValue(new Error('Redis unavailable'));

      // Should not throw
      await expect(service.refreshAllPricing()).resolves.not.toThrow();
    });
  });
});
