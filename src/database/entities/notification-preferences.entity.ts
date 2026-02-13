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
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

/**
 * Sound file options
 */
export type SoundFile = 'default' | 'subtle' | 'chime' | 'none';

/**
 * Agent notification priority
 */
export type AgentPriority = 'high' | 'normal' | 'low';

/**
 * Per-agent notification settings
 */
export interface AgentNotificationSettings {
  muted: boolean;
  soundEnabled: boolean;
  priority: AgentPriority;
}

/**
 * Notification type toggles
 */
export interface NotificationTypeSettings {
  chatMessages: boolean;
  statusUpdates: boolean;
  taskCompletions: boolean;
  errors: boolean;
  mentions: boolean;
}

/**
 * Do Not Disturb schedule
 */
export interface DNDSchedule {
  startTime: string;
  endTime: string;
  timezone: string;
  daysOfWeek: number[];
}

/**
 * NotificationPreferences Entity
 * Story 9.9: Chat Notifications
 *
 * Stores user notification preferences per workspace
 */
@Entity('notification_preferences')
@Unique(['userId', 'workspaceId'])
@Index(['userId'])
@Index(['workspaceId'])
export class NotificationPreferences {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'push_enabled', type: 'boolean', default: true })
  pushEnabled!: boolean;

  @Column({ name: 'sound_enabled', type: 'boolean', default: true })
  soundEnabled!: boolean;

  @Column({ name: 'sound_volume', type: 'decimal', precision: 2, scale: 1, default: 0.5 })
  soundVolume!: number;

  @Column({ name: 'sound_file', type: 'varchar', length: 50, default: 'default' })
  soundFile!: SoundFile;

  @Column({ name: 'dnd_enabled', type: 'boolean', default: false })
  dndEnabled!: boolean;

  @Column({ name: 'dnd_schedule', type: 'jsonb', nullable: true })
  dndSchedule!: DNDSchedule | null;

  @Column({ name: 'agent_settings', type: 'jsonb', default: {} })
  agentSettings!: Record<string, AgentNotificationSettings>;

  @Column({
    name: 'type_settings',
    type: 'jsonb',
    default: {
      chatMessages: true,
      statusUpdates: true,
      taskCompletions: true,
      errors: true,
      mentions: true,
    },
  })
  typeSettings!: NotificationTypeSettings;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
