/**
 * Preset Definitions Tests
 *
 * Story 13-9: User Model Preferences
 */
import { PRESET_DEFINITIONS, VALID_PRESETS, VALID_PROVIDERS } from './preset-definitions';

describe('Preset Definitions', () => {
  describe('PRESET_DEFINITIONS', () => {
    it('should have economy, balanced, quality, and auto presets', () => {
      expect(PRESET_DEFINITIONS).toHaveProperty('economy');
      expect(PRESET_DEFINITIONS).toHaveProperty('balanced');
      expect(PRESET_DEFINITIONS).toHaveProperty('quality');
      expect(PRESET_DEFINITIONS).toHaveProperty('auto');
    });

    it('economy preset should use cheapest models for all task types', () => {
      const economy = PRESET_DEFINITIONS.economy;
      expect(economy.coding.model).toBe('deepseek-chat');
      expect(economy.planning.model).toBe('deepseek-chat');
      expect(economy.review.model).toBe('deepseek-chat');
      expect(economy.summarization.model).toBe('gemini-2.0-flash');
      expect(economy.simple_chat.model).toBe('gemini-2.0-flash');
      expect(economy.complex_reasoning.model).toBe('deepseek-reasoner');
      expect(economy.embedding.model).toBe('text-embedding-3-small');
    });

    it('quality preset should use premium models for all task types', () => {
      const quality = PRESET_DEFINITIONS.quality;
      expect(quality.coding.model).toBe('claude-opus-4-20250514');
      expect(quality.planning.model).toBe('claude-opus-4-20250514');
      expect(quality.review.model).toBe('claude-opus-4-20250514');
      expect(quality.summarization.model).toBe('claude-sonnet-4-20250514');
      expect(quality.simple_chat.model).toBe('claude-sonnet-4-20250514');
      expect(quality.complex_reasoning.model).toBe('claude-opus-4-20250514');
      expect(quality.embedding.model).toBe('text-embedding-3-large');
    });

    it('balanced preset should use mid-tier models', () => {
      const balanced = PRESET_DEFINITIONS.balanced;
      expect(balanced.coding.model).toBe('claude-sonnet-4-20250514');
      expect(balanced.planning.model).toBe('claude-sonnet-4-20250514');
      expect(balanced.review.model).toBe('claude-sonnet-4-20250514');
      expect(balanced.summarization.model).toBe('gemini-2.0-flash');
      expect(balanced.simple_chat.model).toBe('gemini-2.0-flash');
      expect(balanced.complex_reasoning.model).toBe('claude-opus-4-20250514');
      expect(balanced.embedding.model).toBe('text-embedding-3-small');
    });

    it('auto preset should have empty overrides (uses router defaults)', () => {
      const auto = PRESET_DEFINITIONS.auto;
      expect(Object.keys(auto)).toHaveLength(0);
    });

    it('all non-auto presets should have all 7 task types', () => {
      const expectedTaskTypes = [
        'coding',
        'planning',
        'review',
        'summarization',
        'simple_chat',
        'complex_reasoning',
        'embedding',
      ];

      for (const presetName of ['economy', 'balanced', 'quality']) {
        const preset = PRESET_DEFINITIONS[presetName];
        for (const taskType of expectedTaskTypes) {
          expect(preset).toHaveProperty(taskType);
          expect(preset[taskType]).toHaveProperty('model');
          expect(preset[taskType]).toHaveProperty('fallback');
          expect(typeof preset[taskType].model).toBe('string');
          expect(typeof preset[taskType].fallback).toBe('string');
        }
      }
    });

    it('each preset entry should have both model and fallback', () => {
      for (const [presetName, taskOverrides] of Object.entries(PRESET_DEFINITIONS)) {
        for (const [taskType, override] of Object.entries(taskOverrides)) {
          expect(override.model).toBeTruthy();
          expect(override.fallback).toBeTruthy();
          expect(override.model).not.toBe(override.fallback);
        }
      }
    });
  });

  describe('VALID_PRESETS', () => {
    it('should contain all 4 preset types', () => {
      expect(VALID_PRESETS).toHaveLength(4);
      expect(VALID_PRESETS).toContain('auto');
      expect(VALID_PRESETS).toContain('economy');
      expect(VALID_PRESETS).toContain('quality');
      expect(VALID_PRESETS).toContain('balanced');
    });
  });

  describe('VALID_PROVIDERS', () => {
    it('should contain all 4 provider types', () => {
      expect(VALID_PROVIDERS).toHaveLength(4);
      expect(VALID_PROVIDERS).toContain('anthropic');
      expect(VALID_PROVIDERS).toContain('openai');
      expect(VALID_PROVIDERS).toContain('google');
      expect(VALID_PROVIDERS).toContain('deepseek');
    });
  });
});
