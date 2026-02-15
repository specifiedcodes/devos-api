/**
 * UpdateModelPreferencesDto Tests
 *
 * Story 13-9: User Model Preferences
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateModelPreferencesDto, TaskModelOverrideDto, ValidateModelDto } from './update-model-preferences.dto';

describe('UpdateModelPreferencesDto', () => {
  async function validateDto(data: Record<string, any>) {
    const dto = plainToInstance(UpdateModelPreferencesDto, data);
    return validate(dto);
  }

  it('should accept valid preferences with all fields', async () => {
    const errors = await validateDto({
      modelPreferencesEnabled: true,
      preset: 'balanced',
      taskOverrides: {
        coding: { model: 'claude-sonnet-4', fallback: 'gpt-4o' },
      },
      enabledProviders: ['anthropic', 'openai'],
      providerPriority: ['anthropic', 'openai'],
    });
    expect(errors).toHaveLength(0);
  });

  it('should accept valid preferences with only preset field', async () => {
    const errors = await validateDto({
      preset: 'economy',
    });
    expect(errors).toHaveLength(0);
  });

  it('should accept empty object (all fields are optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid preset value', async () => {
    const errors = await validateDto({
      preset: 'invalid',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('preset');
  });

  it('should accept preset value auto', async () => {
    const errors = await validateDto({ preset: 'auto' });
    expect(errors).toHaveLength(0);
  });

  it('should accept preset value economy', async () => {
    const errors = await validateDto({ preset: 'economy' });
    expect(errors).toHaveLength(0);
  });

  it('should accept preset value quality', async () => {
    const errors = await validateDto({ preset: 'quality' });
    expect(errors).toHaveLength(0);
  });

  it('should accept preset value balanced', async () => {
    const errors = await validateDto({ preset: 'balanced' });
    expect(errors).toHaveLength(0);
  });

  it('should accept valid enabledProviders array', async () => {
    const errors = await validateDto({
      enabledProviders: ['anthropic', 'google'],
    });
    expect(errors).toHaveLength(0);
  });

  it('should reject non-string values in enabledProviders', async () => {
    const errors = await validateDto({
      enabledProviders: [123, true],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid providerPriority array', async () => {
    const errors = await validateDto({
      providerPriority: ['anthropic', 'openai', 'google', 'deepseek'],
    });
    expect(errors).toHaveLength(0);
  });

  it('should accept valid taskOverrides object', async () => {
    const errors = await validateDto({
      taskOverrides: {
        coding: { model: 'claude-sonnet-4-20250514', fallback: 'gpt-4o' },
        planning: { model: 'gpt-4o', fallback: 'gemini-2.0-pro' },
      },
    });
    expect(errors).toHaveLength(0);
  });

  it('should accept modelPreferencesEnabled boolean', async () => {
    const errors = await validateDto({
      modelPreferencesEnabled: true,
    });
    expect(errors).toHaveLength(0);
  });

  it('should reject non-boolean modelPreferencesEnabled', async () => {
    const errors = await validateDto({
      modelPreferencesEnabled: 'yes',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('modelPreferencesEnabled');
  });
});

describe('TaskModelOverrideDto', () => {
  async function validateOverride(data: Record<string, any>) {
    const dto = plainToInstance(TaskModelOverrideDto, data);
    return validate(dto);
  }

  it('should accept valid model and fallback', async () => {
    const errors = await validateOverride({
      model: 'claude-sonnet-4-20250514',
      fallback: 'gpt-4o',
    });
    expect(errors).toHaveLength(0);
  });

  it('should reject model exceeding 100 chars', async () => {
    const errors = await validateOverride({
      model: 'a'.repeat(101),
      fallback: 'gpt-4o',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject fallback exceeding 100 chars', async () => {
    const errors = await validateOverride({
      model: 'gpt-4o',
      fallback: 'a'.repeat(101),
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('ValidateModelDto', () => {
  async function validateModel(data: Record<string, any>) {
    const dto = plainToInstance(ValidateModelDto, data);
    return validate(dto);
  }

  it('should accept valid modelId', async () => {
    const errors = await validateModel({ modelId: 'claude-sonnet-4-20250514' });
    expect(errors).toHaveLength(0);
  });

  it('should reject empty modelId', async () => {
    const errors = await validateModel({ modelId: '' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing modelId', async () => {
    const errors = await validateModel({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject modelId exceeding 100 chars', async () => {
    const errors = await validateModel({ modelId: 'a'.repeat(101) });
    expect(errors.length).toBeGreaterThan(0);
  });
});
