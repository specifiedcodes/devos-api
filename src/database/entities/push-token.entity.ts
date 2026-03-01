/**
 * Push Token Entity
 * Story 22.7: Mobile Push Notifications
 *
 * Stores Expo push tokens for mobile device notifications.
 * Supports iOS and Android platforms via Expo Push Service.
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
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

export type MobilePlatform = 'ios' | 'android';

@Entity('push_tokens')
@Index(['userId'])
@Index(['pushToken'])
@Index(['userId', 'workspaceId'])
@Unique(['deviceId', 'userId'])
export class PushToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 255, name: 'device_id' })
  deviceId!: string;

  @Column({ type: 'varchar', length: 255, name: 'push_token' })
  pushToken!: string;

  @Column({ type: 'varchar', length: 10, name: 'platform' })
  platform!: MobilePlatform;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamp', name: 'last_used_at', nullable: true })
  lastUsedAt?: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
