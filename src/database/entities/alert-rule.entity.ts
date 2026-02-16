import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * AlertRule Entity
 * Story 14.8: Alert Rules & Notifications (AC1)
 *
 * Stores configurable alert rules that evaluate health check data
 * and Prometheus metrics against thresholds.
 */
@Entity('alert_rules')
export class AlertRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({
    type: 'enum',
    enum: ['threshold', 'health_check', 'comparison'],
    default: 'threshold',
  })
  ruleType!: 'threshold' | 'health_check' | 'comparison';

  @Column({ type: 'varchar', length: 500 })
  condition!: string; // e.g. 'health.database.status', 'metric.http_error_rate_percent'

  @Column({
    type: 'enum',
    enum: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'],
    default: 'gt',
  })
  operator!: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

  @Column({ type: 'varchar', length: 255 })
  threshold!: string; // string to support numeric and string comparisons

  @Column({ type: 'int', default: 300 })
  durationSeconds!: number; // how long condition must be true before firing

  @Column({
    type: 'enum',
    enum: ['critical', 'warning', 'info'],
    default: 'warning',
  })
  severity!: 'critical' | 'warning' | 'info';

  @Column({ type: 'simple-array', default: 'in_app' })
  channels!: string[]; // 'in_app', 'email', 'webhook'

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'int', default: 3600 })
  cooldownSeconds!: number; // min time between repeated alerts

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any>; // webhook URL, email list, extra config

  @Column({ type: 'varchar', length: 50, default: 'system' })
  createdBy!: string; // 'system' for pre-configured, admin userId for custom

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
