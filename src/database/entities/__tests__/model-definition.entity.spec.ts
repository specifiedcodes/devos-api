/**
 * ModelDefinition Entity Tests
 *
 * Story 13-2: Model Registry
 *
 * Tests for entity column types, defaults, and TaskType validation.
 */
import {
  ModelDefinition,
  TaskType,
  QualityTier,
  VALID_TASK_TYPES,
  VALID_QUALITY_TIERS,
} from '../model-definition.entity';

describe('ModelDefinition Entity', () => {
  describe('TaskType values', () => {
    it('should define all valid task types', () => {
      const expectedTypes: TaskType[] = [
        'coding',
        'planning',
        'review',
        'summarization',
        'embedding',
        'simple_chat',
        'complex_reasoning',
      ];
      expect(VALID_TASK_TYPES).toEqual(expectedTypes);
    });

    it('should have exactly 7 task types', () => {
      expect(VALID_TASK_TYPES).toHaveLength(7);
    });

    it('should include coding as a valid task type', () => {
      expect(VALID_TASK_TYPES).toContain('coding');
    });

    it('should include embedding as a valid task type', () => {
      expect(VALID_TASK_TYPES).toContain('embedding');
    });

    it('should include complex_reasoning as a valid task type', () => {
      expect(VALID_TASK_TYPES).toContain('complex_reasoning');
    });
  });

  describe('QualityTier values', () => {
    it('should define all valid quality tiers', () => {
      const expectedTiers: QualityTier[] = ['economy', 'standard', 'premium'];
      expect(VALID_QUALITY_TIERS).toEqual(expectedTiers);
    });

    it('should only accept economy, standard, premium', () => {
      expect(VALID_QUALITY_TIERS).toHaveLength(3);
      expect(VALID_QUALITY_TIERS).toContain('economy');
      expect(VALID_QUALITY_TIERS).toContain('standard');
      expect(VALID_QUALITY_TIERS).toContain('premium');
    });
  });

  describe('ModelDefinition entity structure', () => {
    it('should create an instance with all required fields', () => {
      const model = new ModelDefinition();
      model.id = 'uuid-1';
      model.modelId = 'test-model';
      model.provider = 'anthropic';
      model.displayName = 'Test Model';
      model.contextWindow = 200000;
      model.maxOutputTokens = 16000;
      model.supportsTools = true;
      model.supportsVision = true;
      model.supportsStreaming = true;
      model.supportsEmbedding = false;
      model.inputPricePer1M = 3.0;
      model.outputPricePer1M = 15.0;
      model.cachedInputPricePer1M = 0.3;
      model.avgLatencyMs = 100;
      model.qualityTier = 'standard';
      model.suitableFor = ['coding', 'planning'];
      model.available = true;
      model.deprecationDate = null;
      model.createdAt = new Date();
      model.updatedAt = new Date();

      expect(model.modelId).toBe('test-model');
      expect(model.provider).toBe('anthropic');
      expect(model.qualityTier).toBe('standard');
      expect(model.suitableFor).toEqual(['coding', 'planning']);
      expect(model.available).toBe(true);
      expect(model.deprecationDate).toBeNull();
    });

    it('should allow nullable cachedInputPricePer1M', () => {
      const model = new ModelDefinition();
      model.cachedInputPricePer1M = null;
      expect(model.cachedInputPricePer1M).toBeNull();
    });

    it('should allow nullable deprecationDate', () => {
      const model = new ModelDefinition();
      model.deprecationDate = null;
      expect(model.deprecationDate).toBeNull();

      const date = new Date('2026-12-01');
      model.deprecationDate = date;
      expect(model.deprecationDate).toEqual(date);
    });

    it('should store suitableFor as an array of TaskTypes', () => {
      const model = new ModelDefinition();
      model.suitableFor = ['coding', 'planning', 'review'];
      expect(model.suitableFor).toHaveLength(3);
      expect(model.suitableFor).toContain('coding');
    });

    it('should support empty suitableFor array', () => {
      const model = new ModelDefinition();
      model.suitableFor = [];
      expect(model.suitableFor).toEqual([]);
    });
  });
});
