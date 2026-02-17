import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { IsOptional, IsUUID, IsInt, Min } from 'class-validator';
import { SsoAuditWebhook } from './sso-audit-webhook.entity';
import { SsoAuditEvent } from './sso-audit-event.entity';

@Entity('sso_audit_webhook_deliveries')
@Index(['webhookId'])
@Index(['status'])
@Index(['createdAt'])
export class SsoAuditWebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'webhook_id' })
  @IsUUID()
  webhookId!: string;

  @ManyToOne(() => SsoAuditWebhook, (webhook) => webhook.deliveries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'webhook_id' })
  webhook?: SsoAuditWebhook;

  @Column({ type: 'uuid', name: 'event_id' })
  @IsUUID()
  eventId!: string;

  @ManyToOne(() => SsoAuditEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event?: SsoAuditEvent;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: string;

  @Column({ type: 'integer', name: 'status_code', nullable: true })
  @IsOptional()
  statusCode!: number | null;

  @Column({ type: 'text', name: 'response_body', nullable: true })
  @IsOptional()
  responseBody!: string | null;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  @IsOptional()
  errorMessage!: string | null;

  @Column({ type: 'integer', name: 'attempt_number', default: 1 })
  @IsInt()
  @Min(1)
  attemptNumber!: number;

  @Column({ type: 'timestamp with time zone', name: 'delivered_at', nullable: true })
  @IsOptional()
  deliveredAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
