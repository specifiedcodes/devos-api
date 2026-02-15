/**
 * ModelPerformance Entity
 *
 * Story 13-8: Model Performance Benchmarks
 *
 * Stores per-request AI model performance data for benchmark aggregation.
 * Separate from api_usage table which is optimized for cost tracking.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * TypeORM column transformer that converts PostgreSQL decimal string values to numbers.
 * PostgreSQL returns decimal/numeric columns as strings to avoid floating-point precision loss.
 * This transformer ensures the entity always exposes numeric values to TypeScript consumers.
 */
export const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  },
};

@Entity('model_performance')
@Index('idx_model_performance_model_task', ['model', 'taskType'])
@Index('idx_model_performance_workspace', ['workspaceId', 'createdAt'])
@Index('idx_model_performance_created', ['createdAt'])
@Index('idx_model_performance_provider', ['provider', 'createdAt'])
export class ModelPerformance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'varchar', length: 100 })
  requestId!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'varchar', length: 50 })
  provider!: string;

  @Column({ name: 'task_type', type: 'varchar', length: 50 })
  taskType!: string;

  @Column({ type: 'boolean', default: true })
  success!: boolean;

  @Column({
    name: 'quality_score',
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  qualityScore!: number | null;

  @Column({ name: 'latency_ms', type: 'integer' })
  latencyMs!: number;

  @Column({ name: 'input_tokens', type: 'integer', default: 0 })
  inputTokens!: number;

  @Column({ name: 'output_tokens', type: 'integer', default: 0 })
  outputTokens!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    default: 0,
    transformer: numericTransformer,
  })
  cost!: number;

  @Column({ name: 'context_size', type: 'integer', default: 0 })
  contextSize!: number;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount!: number;

  @Column({ name: 'error_type', type: 'varchar', length: 100, nullable: true })
  errorType!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
