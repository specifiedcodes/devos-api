/**
 * ModelDefinition Entity and TaskType
 *
 * Story 13-2: Model Registry
 *
 * Represents a registered AI model in the platform.
 * Stores capabilities, pricing, and task suitability metadata.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Classification of AI task types for routing decisions.
 */
export type TaskType =
  | 'coding'
  | 'planning'
  | 'review'
  | 'summarization'
  | 'embedding'
  | 'simple_chat'
  | 'complex_reasoning';

/**
 * Valid TaskType values for runtime validation
 */
export const VALID_TASK_TYPES: TaskType[] = [
  'coding',
  'planning',
  'review',
  'summarization',
  'embedding',
  'simple_chat',
  'complex_reasoning',
];

/**
 * Valid quality tier values
 */
export type QualityTier = 'economy' | 'standard' | 'premium';

export const VALID_QUALITY_TIERS: QualityTier[] = ['economy', 'standard', 'premium'];

/**
 * TypeORM column transformer that converts PostgreSQL decimal string values to numbers.
 * PostgreSQL returns decimal/numeric columns as strings to avoid floating-point precision loss.
 * This transformer ensures the entity always exposes numeric values to TypeScript consumers.
 */
const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = parseFloat(value as string);
    return isNaN(parsed) ? null : parsed;
  },
};

@Entity('model_definitions')
@Index('idx_model_definitions_provider', ['provider'])
@Index('idx_model_definitions_quality_tier', ['qualityTier'])
@Index('idx_model_definitions_available', ['available'])
export class ModelDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true, name: 'model_id' })
  modelId!: string;

  @Column({ type: 'varchar', length: 50 })
  provider!: string;

  @Column({ type: 'varchar', length: 100, name: 'display_name' })
  displayName!: string;

  // Capabilities
  @Column({ type: 'integer', name: 'context_window' })
  contextWindow!: number;

  @Column({ type: 'integer', name: 'max_output_tokens' })
  maxOutputTokens!: number;

  @Column({ type: 'boolean', default: false, name: 'supports_tools' })
  supportsTools!: boolean;

  @Column({ type: 'boolean', default: false, name: 'supports_vision' })
  supportsVision!: boolean;

  @Column({ type: 'boolean', default: true, name: 'supports_streaming' })
  supportsStreaming!: boolean;

  @Column({ type: 'boolean', default: false, name: 'supports_embedding' })
  supportsEmbedding!: boolean;

  // Pricing (per million tokens, stored as decimal)
  @Column({ type: 'decimal', precision: 10, scale: 6, name: 'input_price_per_1m', transformer: numericTransformer })
  inputPricePer1M!: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, name: 'output_price_per_1m', transformer: numericTransformer })
  outputPricePer1M!: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true, name: 'cached_input_price_per_1m', transformer: numericTransformer })
  cachedInputPricePer1M!: number | null;

  // Performance
  @Column({ type: 'integer', default: 0, name: 'avg_latency_ms' })
  avgLatencyMs!: number;

  @Column({ type: 'varchar', length: 20, name: 'quality_tier' })
  qualityTier!: QualityTier;

  // Task suitability (stored as JSON array)
  @Column({ type: 'jsonb', name: 'suitable_for', default: '[]' })
  suitableFor!: TaskType[];

  // Status
  @Column({ type: 'boolean', default: true })
  available!: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'deprecation_date' })
  deprecationDate!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
