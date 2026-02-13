import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('analytics_aggregates')
@Index(['metricName', 'periodStart'])
export class AnalyticsAggregate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'metric_name', type: 'varchar', length: 100 })
  metricName!: string;

  @Column({ name: 'metric_value', type: 'numeric' })
  metricValue!: number;

  @Column({ name: 'dimension', type: 'jsonb', nullable: true })
  dimension!: Record<string, any> | null;

  @Column({ name: 'aggregation_period', type: 'varchar', length: 50 })
  aggregationPeriod!: string;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
