import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsUUID, IsBoolean, IsInt, Min, Max, IsArray, IsString, MaxLength } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

@Entity('sso_audit_alert_rules')
@Index(['workspaceId'])
export class SsoAuditAlertRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 200 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description!: string | null;

  @Column({ type: 'text', array: true, name: 'event_types', default: () => "ARRAY[]::text[]" })
  @IsArray()
  eventTypes!: string[];

  @Column({ type: 'integer', default: 1 })
  @IsInt()
  @Min(1)
  @Max(1000)
  threshold!: number;

  @Column({ type: 'integer', name: 'window_minutes', default: 5 })
  @IsInt()
  @Min(1)
  @Max(1440)
  windowMinutes!: number;

  @Column({ type: 'jsonb', name: 'notification_channels', default: () => "'[]'" })
  notificationChannels!: Array<{ type: string; target: string }>;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'integer', name: 'cooldown_minutes', default: 30 })
  @IsInt()
  @Min(1)
  @Max(1440)
  cooldownMinutes!: number;

  @Column({ type: 'timestamp with time zone', name: 'last_triggered_at', nullable: true })
  @IsOptional()
  lastTriggeredAt!: Date | null;

  @Column({ type: 'integer', name: 'trigger_count', default: 0 })
  triggerCount!: number;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  @IsOptional()
  @IsUUID()
  createdBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: User;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
