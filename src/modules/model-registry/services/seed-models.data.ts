/**
 * Default Model Seed Data
 *
 * Story 13-2: Model Registry
 *
 * Contains default model definitions for seeding the database on startup.
 * 13 models across 4 providers (Anthropic, OpenAI, Google, DeepSeek).
 */
import { TaskType, QualityTier } from '../../../database/entities/model-definition.entity';

export interface SeedModelData {
  modelId: string;
  provider: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsEmbedding: boolean;
  inputPricePer1M: number;
  outputPricePer1M: number;
  cachedInputPricePer1M: number | null;
  avgLatencyMs: number;
  qualityTier: QualityTier;
  suitableFor: TaskType[];
}

export const SEED_MODELS: SeedModelData[] = [
  // Anthropic Models
  {
    modelId: 'claude-opus-4-20250514',
    provider: 'anthropic',
    displayName: 'Claude Opus 4',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 15.0,
    outputPricePer1M: 75.0,
    cachedInputPricePer1M: 1.5,
    avgLatencyMs: 0,
    qualityTier: 'premium',
    suitableFor: ['coding', 'planning', 'review', 'complex_reasoning'],
  },
  {
    modelId: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4',
    contextWindow: 200000,
    maxOutputTokens: 16000,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 3.0,
    outputPricePer1M: 15.0,
    cachedInputPricePer1M: 0.3,
    avgLatencyMs: 0,
    qualityTier: 'standard',
    suitableFor: ['coding', 'planning', 'review', 'simple_chat'],
  },
  {
    modelId: 'claude-haiku-3-5-20241022',
    provider: 'anthropic',
    displayName: 'Claude Haiku 3.5',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 0.8,
    outputPricePer1M: 4.0,
    cachedInputPricePer1M: 0.08,
    avgLatencyMs: 0,
    qualityTier: 'economy',
    suitableFor: ['summarization', 'simple_chat'],
  },

  // OpenAI Models
  {
    modelId: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 2.5,
    outputPricePer1M: 10.0,
    cachedInputPricePer1M: 1.25,
    avgLatencyMs: 0,
    qualityTier: 'standard',
    suitableFor: ['coding', 'planning', 'review', 'simple_chat'],
  },
  {
    modelId: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.6,
    cachedInputPricePer1M: 0.075,
    avgLatencyMs: 0,
    qualityTier: 'economy',
    suitableFor: ['summarization', 'simple_chat'],
  },
  {
    modelId: 'gpt-4-turbo',
    provider: 'openai',
    displayName: 'GPT-4 Turbo',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 10.0,
    outputPricePer1M: 30.0,
    cachedInputPricePer1M: null,
    avgLatencyMs: 0,
    qualityTier: 'premium',
    suitableFor: ['coding', 'complex_reasoning'],
  },

  // Google Models
  {
    modelId: 'gemini-2.0-flash',
    provider: 'google',
    displayName: 'Gemini 2.0 Flash',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 0.1,
    outputPricePer1M: 0.4,
    cachedInputPricePer1M: null,
    avgLatencyMs: 0,
    qualityTier: 'economy',
    suitableFor: ['summarization', 'simple_chat'],
  },
  {
    modelId: 'gemini-2.0-pro',
    provider: 'google',
    displayName: 'Gemini 2.0 Pro',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 1.25,
    outputPricePer1M: 5.0,
    cachedInputPricePer1M: null,
    avgLatencyMs: 0,
    qualityTier: 'standard',
    suitableFor: ['coding', 'planning', 'review'],
  },

  // DeepSeek Models
  {
    modelId: 'deepseek-chat',
    provider: 'deepseek',
    displayName: 'DeepSeek V3',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 0.27,
    outputPricePer1M: 1.1,
    cachedInputPricePer1M: 0.07,
    avgLatencyMs: 0,
    qualityTier: 'economy',
    suitableFor: ['coding', 'summarization', 'simple_chat'],
  },
  {
    modelId: 'deepseek-reasoner',
    provider: 'deepseek',
    displayName: 'DeepSeek R1',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsTools: false,
    supportsVision: false,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 0.55,
    outputPricePer1M: 2.19,
    cachedInputPricePer1M: null,
    avgLatencyMs: 0,
    qualityTier: 'standard',
    suitableFor: ['coding', 'complex_reasoning'],
  },

  // Embedding Models
  {
    modelId: 'text-embedding-3-small',
    provider: 'openai',
    displayName: 'OpenAI Embedding Small',
    contextWindow: 8191,
    maxOutputTokens: 0,
    supportsTools: false,
    supportsVision: false,
    supportsStreaming: false,
    supportsEmbedding: true,
    inputPricePer1M: 0.02,
    outputPricePer1M: 0.0,
    cachedInputPricePer1M: null,
    avgLatencyMs: 0,
    qualityTier: 'economy',
    suitableFor: ['embedding'],
  },
  {
    modelId: 'text-embedding-3-large',
    provider: 'openai',
    displayName: 'OpenAI Embedding Large',
    contextWindow: 8191,
    maxOutputTokens: 0,
    supportsTools: false,
    supportsVision: false,
    supportsStreaming: false,
    supportsEmbedding: true,
    inputPricePer1M: 0.13,
    outputPricePer1M: 0.0,
    cachedInputPricePer1M: null,
    avgLatencyMs: 0,
    qualityTier: 'standard',
    suitableFor: ['embedding'],
  },
  {
    modelId: 'text-embedding-004',
    provider: 'google',
    displayName: 'Google Embedding 004',
    contextWindow: 2048,
    maxOutputTokens: 0,
    supportsTools: false,
    supportsVision: false,
    supportsStreaming: false,
    supportsEmbedding: true,
    inputPricePer1M: 0.006,
    outputPricePer1M: 0.0,
    cachedInputPricePer1M: null,
    avgLatencyMs: 0,
    qualityTier: 'economy',
    suitableFor: ['embedding'],
  },
];
