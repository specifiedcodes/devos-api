import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index, OneToMany,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsUUID, IsBoolean, IsInt, Min, Max, IsArray, IsString, IsUrl, MaxLength } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';
import { SsoAuditWebhookDelivery } from './sso-audit-webhook-delivery.entity';

@Entity('sso_audit_webhooks')
@Index(['workspaceId'])
export class SsoAuditWebhook {
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

  @Column({ type: 'varchar', length: 2000 })
  @IsNotEmpty()
  @IsUrl()
  url!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @IsOptional()
  @IsString()
  secret!: string | null;

  @Column({ type: 'text', array: true, name: 'event_types', default: () => "ARRAY[]::text[]" })
  @IsArray()
  eventTypes!: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  headers!: Record<string, string>;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'integer', name: 'retry_count', default: 3 })
  @IsInt()
  @Min(0)
  @Max(10)
  retryCount!: number;

  @Column({ type: 'integer', name: 'timeout_ms', default: 10000 })
  @IsInt()
  @Min(1000)
  @Max(30000)
  timeoutMs!: number;

  @Column({ type: 'timestamp with time zone', name: 'last_delivery_at', nullable: true })
  @IsOptional()
  lastDeliveryAt!: Date | null;

  @Column({ type: 'varchar', length: 20, name: 'last_delivery_status', nullable: true })
  @IsOptional()
  lastDeliveryStatus!: string | null;

  @Column({ type: 'integer', name: 'consecutive_failures', default: 0 })
  consecutiveFailures!: number;

  @Column({ type: 'integer', name: 'max_consecutive_failures', default: 10 })
  @IsInt()
  @Min(1)
  @Max(100)
  maxConsecutiveFailures!: number;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  @IsOptional()
  @IsUUID()
  createdBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: User;

  @OneToMany(() => SsoAuditWebhookDelivery, (delivery) => delivery.webhook, { cascade: true })
  deliveries?: SsoAuditWebhookDelivery[];

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
