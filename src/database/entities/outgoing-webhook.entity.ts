import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index, OneToMany,
} from 'typeorm';
import {
  IsNotEmpty, IsOptional, IsUUID, IsBoolean, IsInt, Min, Max,
  IsArray, IsString, IsUrl, MaxLength,
} from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';
import { WebhookDeliveryLog } from './webhook-delivery-log.entity';

@Entity('outgoing_webhooks')
@Index(['workspaceId'])
@Index(['workspaceId', 'isActive'])
export class OutgoingWebhook {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 255 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @Column({ type: 'varchar', length: 2000 })
  @IsNotEmpty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url!: string;

  @Column({ type: 'text', array: true, default: () => "ARRAY[]::text[]" })
  @IsArray()
  events!: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  headers!: Record<string, string>;

  @Column({ type: 'varchar', length: 255, name: 'secret_hash' })
  @IsNotEmpty()
  @IsString()
  secretHash!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'integer', name: 'failure_count', default: 0 })
  @IsInt()
  @Min(0)
  failureCount!: number;

  @Column({ type: 'integer', name: 'consecutive_failures', default: 0 })
  @IsInt()
  @Min(0)
  consecutiveFailures!: number;

  @Column({ type: 'integer', name: 'max_consecutive_failures', default: 3 })
  @IsInt()
  @Min(1)
  @Max(20)
  maxConsecutiveFailures!: number;

  @Column({ type: 'timestamp with time zone', name: 'last_triggered_at', nullable: true })
  @IsOptional()
  lastTriggeredAt!: Date | null;

  @Column({ type: 'varchar', length: 20, name: 'last_delivery_status', nullable: true })
  @IsOptional()
  lastDeliveryStatus!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  @IsOptional()
  @IsUUID()
  createdBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: User;

  @OneToMany(() => WebhookDeliveryLog, (delivery) => delivery.webhook, { cascade: true })
  deliveries?: WebhookDeliveryLog[];

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
