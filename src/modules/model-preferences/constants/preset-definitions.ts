/**
 * Preset Definitions
 *
 * Story 13-9: User Model Preferences
 *
 * Defines model mapping presets for different cost/quality priorities.
 * Each preset maps task types to preferred model + fallback model.
 */

export const PRESET_DEFINITIONS: Record<string, Record<string, { model: string; fallback: string }>> = {
  economy: {
    coding: { model: 'deepseek-chat', fallback: 'gemini-2.0-flash' },
    planning: { model: 'deepseek-chat', fallback: 'gemini-2.0-flash' },
    review: { model: 'deepseek-chat', fallback: 'gemini-2.0-flash' },
    summarization: { model: 'gemini-2.0-flash', fallback: 'deepseek-chat' },
    simple_chat: { model: 'gemini-2.0-flash', fallback: 'deepseek-chat' },
    complex_reasoning: { model: 'deepseek-reasoner', fallback: 'deepseek-chat' },
    embedding: { model: 'text-embedding-3-small', fallback: 'text-embedding-004' },
  },
  balanced: {
    coding: { model: 'claude-sonnet-4-20250514', fallback: 'gpt-4o' },
    planning: { model: 'claude-sonnet-4-20250514', fallback: 'gpt-4o' },
    review: { model: 'claude-sonnet-4-20250514', fallback: 'gpt-4o' },
    summarization: { model: 'gemini-2.0-flash', fallback: 'deepseek-chat' },
    simple_chat: { model: 'gemini-2.0-flash', fallback: 'deepseek-chat' },
    complex_reasoning: { model: 'claude-opus-4-20250514', fallback: 'claude-sonnet-4-20250514' },
    embedding: { model: 'text-embedding-3-small', fallback: 'text-embedding-004' },
  },
  quality: {
    coding: { model: 'claude-opus-4-20250514', fallback: 'claude-sonnet-4-20250514' },
    planning: { model: 'claude-opus-4-20250514', fallback: 'gpt-4o' },
    review: { model: 'claude-opus-4-20250514', fallback: 'claude-sonnet-4-20250514' },
    summarization: { model: 'claude-sonnet-4-20250514', fallback: 'gemini-2.0-pro' },
    simple_chat: { model: 'claude-sonnet-4-20250514', fallback: 'gpt-4o' },
    complex_reasoning: { model: 'claude-opus-4-20250514', fallback: 'gpt-4o' },
    embedding: { model: 'text-embedding-3-large', fallback: 'text-embedding-3-small' },
  },
  auto: {
    // Auto preset uses the default routing rules from Story 13-3
    // No explicit overrides -- the router uses DEFAULT_ROUTING_RULES and benchmark feedback
  },
};

export const VALID_PRESETS = ['auto', 'economy', 'quality', 'balanced'] as const;
export type PresetType = typeof VALID_PRESETS[number];

export const VALID_PROVIDERS = ['anthropic', 'openai', 'google', 'deepseek'] as const;
export type ProviderType = typeof VALID_PROVIDERS[number];
