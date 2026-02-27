/**
 * IntegrationHealthCheck Entity
 * Story 21-9: Integration Health Monitoring (AC1)
 *
 * Stores the current health state of each integration per workspace.
 * Health history (time-series data) is stored in Redis sorted sets.
 * One row per workspace+integration_type combination.
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum IntegrationHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  DISCONNECTED = 'disconnected',
}

export enum IntegrationHealthType {
  SLACK = 'slack',
  DISCORD = 'discord',
  LINEAR = 'linear',
  JIRA = 'jira',
  GITHUB = 'github',
  RAILWAY = 'railway',
  VERCEL = 'vercel',
  SUPABASE = 'supabase',
  WEBHOOKS = 'webhooks',
}

@Entity('integration_health_checks')
@Index(['workspaceId', 'integrationType'], { unique: true })
@Index(['workspaceId', 'status'])
@Index(['checkedAt'])
export class IntegrationHealthCheck {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 20, name: 'integration_type', enum: IntegrationHealthType })
  integrationType!: IntegrationHealthType;

  @Column({ type: 'uuid', name: 'integration_id' })
  integrationId!: string;

  @Column({ type: 'varchar', length: 20, enum: IntegrationHealthStatus, default: IntegrationHealthStatus.HEALTHY })
  status!: IntegrationHealthStatus;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_success_at' })
  lastSuccessAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_error_at' })
  lastErrorAt?: Date | null;

  @Column({ type: 'text', nullable: true, name: 'last_error_message' })
  lastErrorMessage?: string | null;

  @Column({ type: 'integer', default: 0, name: 'error_count_24h' })
  errorCount24h!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100, name: 'uptime_30d' })
  uptime30d!: number;

  @Column({ type: 'integer', nullable: true, name: 'response_time_ms' })
  responseTimeMs?: number | null;

  @Column({ type: 'integer', default: 0, name: 'consecutive_failures' })
  consecutiveFailures!: number;

  @Column({ type: 'jsonb', default: {}, name: 'health_details' })
  healthDetails!: Record<string, any>;

  @Column({ type: 'timestamptz', name: 'checked_at', default: () => 'NOW()' })
  checkedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
