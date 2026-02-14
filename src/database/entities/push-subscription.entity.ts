/**
 * Push Subscription Entity
 * Story 10.4: Push Notifications Setup
 *
 * Stores Web Push API subscriptions per user/device.
 * Enables multi-device push notification delivery.
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { IsUUID, IsString, IsOptional, IsJSON, IsDate } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

/**
 * Push subscription keys for encryption
 */
export interface PushSubscriptionKeys {
  p256dh: string; // Encryption key
  auth: string; // Auth secret
}

@Entity('push_subscriptions')
@Index(['userId', 'workspaceId'])
@Index(['workspaceId'])
@Index(['lastUsedAt'])
@Unique(['endpoint']) // Each endpoint can only have one subscription
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  @IsUUID()
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'text', name: 'endpoint' })
  @IsString()
  endpoint!: string;

  @Column({ type: 'jsonb', name: 'keys' })
  @IsJSON()
  keys!: PushSubscriptionKeys;

  @Column({ type: 'varchar', length: 500, name: 'user_agent', nullable: true })
  @IsString()
  @IsOptional()
  userAgent?: string;

  @Column({ type: 'varchar', length: 100, name: 'device_name', nullable: true })
  @IsString()
  @IsOptional()
  deviceName?: string;

  @Column({ type: 'timestamp', name: 'expires_at', nullable: true })
  @IsDate()
  @IsOptional()
  expiresAt?: Date;

  @Column({ type: 'timestamp', name: 'last_used_at', nullable: true })
  @IsDate()
  @IsOptional()
  lastUsedAt?: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
