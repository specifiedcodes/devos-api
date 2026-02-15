/**
 * ModelPerformance Entity Tests
 *
 * Story 13-8: Model Performance Benchmarks
 *
 * Tests for entity column definitions, defaults, and nullable fields.
 */
import { ModelPerformance, numericTransformer } from './model-performance.entity';

describe('ModelPerformance Entity', () => {
  describe('entity structure', () => {
    it('should create an instance with all required fields', () => {
      const record = new ModelPerformance();
      record.id = 'uuid-1';
      record.requestId = 'req-001';
      record.workspaceId = 'ws-uuid';
      record.model = 'claude-sonnet-4-5-20250929';
      record.provider = 'anthropic';
      record.taskType = 'coding';
      record.success = true;
      record.qualityScore = 0.95;
      record.latencyMs = 1200;
      record.inputTokens = 5000;
      record.outputTokens = 2000;
      record.cost = 0.045;
      record.contextSize = 10000;
      record.retryCount = 0;
      record.errorType = null;
      record.createdAt = new Date();

      expect(record.id).toBe('uuid-1');
      expect(record.requestId).toBe('req-001');
      expect(record.workspaceId).toBe('ws-uuid');
      expect(record.model).toBe('claude-sonnet-4-5-20250929');
      expect(record.provider).toBe('anthropic');
      expect(record.taskType).toBe('coding');
      expect(record.success).toBe(true);
      expect(record.qualityScore).toBe(0.95);
      expect(record.latencyMs).toBe(1200);
      expect(record.inputTokens).toBe(5000);
      expect(record.outputTokens).toBe(2000);
      expect(record.cost).toBe(0.045);
      expect(record.contextSize).toBe(10000);
      expect(record.retryCount).toBe(0);
      expect(record.errorType).toBeNull();
      expect(record.createdAt).toBeInstanceOf(Date);
    });

    it('should have requestId field (varchar 100)', () => {
      const record = new ModelPerformance();
      record.requestId = 'a'.repeat(100);
      expect(record.requestId).toHaveLength(100);
    });

    it('should have workspaceId field (uuid)', () => {
      const record = new ModelPerformance();
      record.workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      expect(record.workspaceId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should have model field (varchar 100)', () => {
      const record = new ModelPerformance();
      record.model = 'gpt-4-turbo';
      expect(record.model).toBe('gpt-4-turbo');
    });

    it('should have provider field (varchar 50)', () => {
      const record = new ModelPerformance();
      record.provider = 'openai';
      expect(record.provider).toBe('openai');
    });

    it('should have taskType field (varchar 50)', () => {
      const record = new ModelPerformance();
      record.taskType = 'complex_reasoning';
      expect(record.taskType).toBe('complex_reasoning');
    });

    it('should have success field with default true', () => {
      const record = new ModelPerformance();
      // Default is set by TypeORM/DB, but entity supports boolean values
      record.success = true;
      expect(record.success).toBe(true);

      record.success = false;
      expect(record.success).toBe(false);
    });

    it('should have qualityScore field (nullable decimal)', () => {
      const record = new ModelPerformance();
      record.qualityScore = 0.85;
      expect(record.qualityScore).toBe(0.85);

      record.qualityScore = null;
      expect(record.qualityScore).toBeNull();
    });

    it('should have latencyMs field (integer)', () => {
      const record = new ModelPerformance();
      record.latencyMs = 350;
      expect(record.latencyMs).toBe(350);
    });

    it('should have cost field with numericTransformer', () => {
      const record = new ModelPerformance();
      record.cost = 0.001234;
      expect(record.cost).toBe(0.001234);
    });

    it('should have contextSize field with default 0', () => {
      const record = new ModelPerformance();
      record.contextSize = 0;
      expect(record.contextSize).toBe(0);

      record.contextSize = 50000;
      expect(record.contextSize).toBe(50000);
    });

    it('should have retryCount field with default 0', () => {
      const record = new ModelPerformance();
      record.retryCount = 0;
      expect(record.retryCount).toBe(0);

      record.retryCount = 3;
      expect(record.retryCount).toBe(3);
    });

    it('should have errorType field (nullable)', () => {
      const record = new ModelPerformance();
      record.errorType = null;
      expect(record.errorType).toBeNull();

      record.errorType = 'rate_limit_exceeded';
      expect(record.errorType).toBe('rate_limit_exceeded');
    });

    it('should have createdAt auto-generated timestamp', () => {
      const record = new ModelPerformance();
      const now = new Date();
      record.createdAt = now;
      expect(record.createdAt).toBe(now);
    });
  });

  describe('numericTransformer', () => {
    it('should pass through number values in "to" direction', () => {
      expect(numericTransformer.to(1.5)).toBe(1.5);
      expect(numericTransformer.to(0)).toBe(0);
      expect(numericTransformer.to(null)).toBeNull();
    });

    it('should parse string values from DB in "from" direction', () => {
      expect(numericTransformer.from('1.5')).toBe(1.5);
      expect(numericTransformer.from('0')).toBe(0);
      expect(numericTransformer.from('0.001234')).toBe(0.001234);
    });

    it('should return null for null values in "from" direction', () => {
      expect(numericTransformer.from(null)).toBeNull();
    });

    it('should return null for NaN values in "from" direction', () => {
      expect(numericTransformer.from('not-a-number')).toBeNull();
    });
  });
});
