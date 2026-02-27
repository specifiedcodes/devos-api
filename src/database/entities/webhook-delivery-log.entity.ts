import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { IsUUID, IsOptional, IsString, IsInt, Min, IsEnum } from 'class-validator';
import { OutgoingWebhook } from './outgoing-webhook.entity';

export enum DeliveryStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  PENDING = 'pending',
  RETRYING = 'retrying',
}

@Entity('webhook_delivery_logs')
@Index(['webhookId'])
@Index(['webhookId', 'createdAt'])
@Index(['status'])
export class WebhookDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'webhook_id' })
  @IsUUID()
  webhookId!: string;

  @ManyToOne(() => OutgoingWebhook, (webhook) => webhook.deliveries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'webhook_id' })
  webhook?: OutgoingWebhook;

  @Column({ type: 'varchar', length: 100, name: 'event_type' })
  @IsString()
  eventType!: string;

  @Column({ type: 'jsonb', nullable: true })
  @IsOptional()
  payload!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20, default: DeliveryStatus.PENDING })
  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;

  @Column({ type: 'integer', name: 'response_code', nullable: true })
  @IsOptional()
  @IsInt()
  responseCode!: number | null;

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

  @Column({ type: 'integer', name: 'max_attempts', default: 4 })
  @IsInt()
  maxAttempts!: number;

  @Column({ type: 'integer', name: 'duration_ms', nullable: true })
  @IsOptional()
  @IsInt()
  durationMs!: number | null;

  @Column({ type: 'timestamp with time zone', name: 'next_retry_at', nullable: true })
  @IsOptional()
  nextRetryAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
