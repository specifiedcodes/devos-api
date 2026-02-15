/**
 * RecordPerformanceDto Tests
 *
 * Story 13-8: Model Performance Benchmarks
 *
 * Tests for DTO validation using class-validator.
 */
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RecordPerformanceDto } from './record-performance.dto';

function createValidDto(
  overrides: Partial<RecordPerformanceDto> = {},
): RecordPerformanceDto {
  return plainToInstance(RecordPerformanceDto, {
    requestId: 'req-001',
    model: 'claude-sonnet-4-5-20250929',
    provider: 'anthropic',
    taskType: 'coding',
    success: true,
    latencyMs: 1200,
    inputTokens: 5000,
    outputTokens: 2000,
    cost: 0.045,
    ...overrides,
  });
}

describe('RecordPerformanceDto', () => {
  it('should accept valid performance record with all required fields', async () => {
    const dto = createValidDto();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept valid record with optional qualityScore', async () => {
    const dto = createValidDto({ qualityScore: 0.85 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject missing requestId', async () => {
    const dto = createValidDto();
    delete (dto as any).requestId;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('requestId');
  });

  it('should reject missing model', async () => {
    const dto = createValidDto();
    delete (dto as any).model;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('model');
  });

  it('should reject missing provider', async () => {
    const dto = createValidDto();
    delete (dto as any).provider;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('provider');
  });

  it('should reject missing taskType', async () => {
    const dto = createValidDto();
    delete (dto as any).taskType;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('taskType');
  });

  it('should reject missing latencyMs', async () => {
    const dto = createValidDto();
    delete (dto as any).latencyMs;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('latencyMs');
  });

  it('should reject negative latencyMs', async () => {
    const dto = createValidDto({ latencyMs: -1 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('latencyMs');
  });

  it('should reject qualityScore > 1', async () => {
    const dto = createValidDto({ qualityScore: 1.5 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('qualityScore');
  });

  it('should reject qualityScore < 0', async () => {
    const dto = createValidDto({ qualityScore: -0.1 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('qualityScore');
  });

  it('should reject negative cost', async () => {
    const dto = createValidDto({ cost: -0.01 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('cost');
  });

  it('should accept requestId of max 100 characters', async () => {
    const dto = createValidDto({ requestId: 'a'.repeat(100) });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject requestId exceeding 100 characters', async () => {
    const dto = createValidDto({ requestId: 'a'.repeat(101) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('requestId');
  });

  it('should accept optional contextSize', async () => {
    const dto = createValidDto({ contextSize: 50000 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept optional retryCount', async () => {
    const dto = createValidDto({ retryCount: 2 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept optional errorType', async () => {
    const dto = createValidDto({ errorType: 'rate_limit' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject negative inputTokens', async () => {
    const dto = createValidDto({ inputTokens: -100 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('inputTokens');
  });

  it('should reject negative outputTokens', async () => {
    const dto = createValidDto({ outputTokens: -50 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('outputTokens');
  });

  it('should reject empty string requestId', async () => {
    const dto = createValidDto({ requestId: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('requestId');
  });

  it('should reject empty string model', async () => {
    const dto = createValidDto({ model: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('model');
  });

  it('should reject empty string provider', async () => {
    const dto = createValidDto({ provider: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('provider');
  });

  it('should reject empty string taskType', async () => {
    const dto = createValidDto({ taskType: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('taskType');
  });
});
