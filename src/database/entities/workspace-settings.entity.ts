import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { IsUUID, IsOptional, IsJSON } from 'class-validator';
import { Workspace } from './workspace.entity';

@Entity('workspace_settings')
export class WorkspaceSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true, name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @OneToOne(() => Workspace)
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'workspace_type' })
  @IsOptional()
  workspaceType?: string; // 'client', 'internal'

  @Column({ type: 'jsonb', nullable: true })
  @IsJSON()
  @IsOptional()
  tags?: string[];

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'default_deployment_platform' })
  @IsOptional()
  defaultDeploymentPlatform?: string; // 'railway' (default). 'vercel' and 'supabase' are deprecated - see Epic 28.

  @Column({ type: 'jsonb', nullable: true, name: 'project_preferences' })
  @IsJSON()
  @IsOptional()
  projectPreferences?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true, name: 'notification_preferences' })
  @IsJSON()
  @IsOptional()
  notificationPreferences?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  @IsJSON()
  @IsOptional()
  branding?: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };

  // Spending limits (Story 3.5)
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    name: 'monthly_limit_usd',
    transformer: {
      to: (value: number | undefined) => value,
      from: (value: string | null) => (value !== null && value !== undefined ? parseFloat(value) : undefined),
    },
  })
  @IsOptional()
  monthlyLimitUsd?: number;

  @Column({ type: 'integer', array: true, nullable: true, name: 'alert_thresholds', default: () => "ARRAY[80, 90, 100]" })
  @IsOptional()
  alertThresholds?: number[];

  @Column({ type: 'boolean', default: false, name: 'limit_enabled' })
  limitEnabled!: boolean;

  @Column({ type: 'jsonb', default: {}, name: 'triggered_alerts' })
  @IsJSON()
  @IsOptional()
  triggeredAlerts?: Record<string, any>;

  // Spend cap configuration (Story 13-7)
  @Column({ type: 'boolean', default: false, name: 'spend_cap_enabled' })
  spendCapEnabled!: boolean;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0.70,
    name: 'warning_threshold',
    transformer: {
      to: (value: number | null): number | null => value,
      from: (value: string | null): number | null => {
        if (value === null || value === undefined) return null;
        const parsed = parseFloat(value as string);
        return isNaN(parsed) ? null : parsed;
      },
    },
  })
  warningThreshold!: number;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0.85,
    name: 'downgrade_threshold',
    transformer: {
      to: (value: number | null): number | null => value,
      from: (value: string | null): number | null => {
        if (value === null || value === undefined) return null;
        const parsed = parseFloat(value as string);
        return isNaN(parsed) ? null : parsed;
      },
    },
  })
  downgradeThreshold!: number;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0.95,
    name: 'critical_threshold',
    transformer: {
      to: (value: number | null): number | null => value,
      from: (value: string | null): number | null => {
        if (value === null || value === undefined) return null;
        const parsed = parseFloat(value as string);
        return isNaN(parsed) ? null : parsed;
      },
    },
  })
  criticalThreshold!: number;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 1.00,
    name: 'hard_cap_threshold',
    transformer: {
      to: (value: number | null): number | null => value,
      from: (value: string | null): number | null => {
        if (value === null || value === undefined) return null;
        const parsed = parseFloat(value as string);
        return isNaN(parsed) ? null : parsed;
      },
    },
  })
  hardCapThreshold!: number;

  @Column({ type: 'jsonb', default: '{}', name: 'downgrade_rules' })
  downgradeRules!: Record<string, { from: string; to: string }>;

  @Column({ type: 'boolean', default: false, name: 'force_premium_override' })
  forcePremiumOverride!: boolean;

  @Column({ type: 'boolean', default: false, name: 'auto_downgrade_paused' })
  autoDowngradePaused!: boolean;

  // Model preferences (Story 13-9)
  @Column({ type: 'varchar', length: 20, default: 'balanced', name: 'model_preset' })
  modelPreset!: string; // 'auto' | 'economy' | 'quality' | 'balanced'

  @Column({ type: 'jsonb', default: '{}', name: 'task_model_overrides' })
  taskModelOverrides!: Record<string, { model: string; fallback: string }>;

  @Column({ type: 'jsonb', default: '[]', name: 'enabled_providers' })
  enabledProviders!: string[]; // ['anthropic', 'google', 'deepseek', 'openai']

  @Column({ type: 'jsonb', default: '[]', name: 'provider_priority' })
  providerPriority!: string[]; // Ordered list, first = highest priority

  @Column({ type: 'boolean', default: false, name: 'model_preferences_enabled' })
  modelPreferencesEnabled!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
