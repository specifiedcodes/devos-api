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
 * Notification type toggles (Story 9.9 - Chat notifications)
 */
export interface NotificationTypeSettings {
  chatMessages: boolean;
  statusUpdates: boolean;
  taskCompletions: boolean;
  errors: boolean;
  mentions: boolean;
}

/**
 * Event notification toggles (Story 10.6 - Configurable notification preferences)
 * Maps to notification event types from Story 10.5
 */
export interface EventNotificationSettings {
  epicCompletions: boolean;       // Default: true
  storyCompletions: boolean;      // Default: true
  deploymentSuccess: boolean;     // Default: true
  deploymentFailure: boolean;     // Default: true (critical - cannot be disabled)
  agentErrors: boolean;           // Default: true (critical - cannot be disabled)
  agentMessages: boolean;         // Default: true
  statusUpdates: boolean;         // Default: false (too frequent)
}

/**
 * Channel preferences for notification delivery
 * Story 10.6: Notification Channel Selection
 */
export interface ChannelPreferences {
  push: boolean;    // Web Push notifications (browser/mobile)
  inApp: boolean;   // In-app notification center (always enabled)
  email: boolean;   // Email notifications via EmailNotificationService (Story 16.6)
}

/**
 * Per-type channel overrides
 */
export type PerTypeChannelOverrides = {
  [key: string]: Partial<ChannelPreferences>;
};

/**
 * Quiet Hours configuration (Story 10.6)
 * Replaces DND for better naming and timezone support
 */
export interface QuietHoursConfig {
  enabled: boolean;
  startTime: string;              // "22:00" (10 PM)
  endTime: string;                // "08:00" (8 AM)
  timezone: string;               // User's timezone (auto-detected)
  exceptCritical: boolean;        // Default: true - still send critical notifications
}

/**
 * Do Not Disturb schedule (legacy from Story 9.9)
 */
export interface DNDSchedule {
  startTime: string;
  endTime: string;
  timezone: string;
  daysOfWeek: number[];
}

/**
 * Critical notification types that cannot be disabled
 */
export const CRITICAL_NOTIFICATION_TYPES = [
  'deployment_failed',
  'agent_error',
] as const;

/**
 * Default event notification settings
 */
export const DEFAULT_EVENT_NOTIFICATION_SETTINGS: EventNotificationSettings = {
  epicCompletions: true,
  storyCompletions: true,
  deploymentSuccess: true,
  deploymentFailure: true,   // Critical - always true
  agentErrors: true,         // Critical - always true
  agentMessages: true,
  statusUpdates: false,      // Disabled by default (too frequent)
};

/**
 * Default channel preferences
 */
export const DEFAULT_CHANNEL_PREFERENCES: ChannelPreferences = {
  push: true,
  inApp: true,    // Always enabled
  email: false,   // Email notifications (opt-in, Story 16.6)
};

/**
 * Default quiet hours configuration
 */
export const DEFAULT_QUIET_HOURS_CONFIG: QuietHoursConfig = {
  enabled: false,
  startTime: '22:00',
  endTime: '08:00',
  timezone: 'UTC',
  exceptCritical: true,
};

/**
 * NotificationPreferences Entity
 * Story 9.9: Chat Notifications
 * Story 10.6: Configurable Notification Preferences
 *
 * Stores user notification preferences per workspace including:
 * - Notification type toggles (epic/story completions, deployments, etc.)
 * - Channel preferences (push, in-app, email)
 * - Quiet hours configuration
 * - Per-agent settings
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

  // ============================================================================
  // Story 10.6: Configurable Notification Preferences - New Fields
  // ============================================================================

  /**
   * Event notification settings (AC #1: Notification Type Toggles)
   * Controls which notification types are enabled
   */
  @Column({
    name: 'event_settings',
    type: 'jsonb',
    default: DEFAULT_EVENT_NOTIFICATION_SETTINGS,
  })
  eventSettings!: EventNotificationSettings;

  /**
   * Channel preferences (AC #2: Notification Channel Selection)
   * Controls how notifications are delivered (push, in-app, email)
   */
  @Column({
    name: 'channel_preferences',
    type: 'jsonb',
    default: DEFAULT_CHANNEL_PREFERENCES,
  })
  channelPreferences!: ChannelPreferences;

  /**
   * Per-type channel overrides (AC #2)
   * Allows customizing channels for specific notification types
   */
  @Column({
    name: 'per_type_channel_overrides',
    type: 'jsonb',
    nullable: true,
  })
  perTypeChannelOverrides!: PerTypeChannelOverrides | null;

  /**
   * In-app notifications enabled (AC #2)
   * Always enabled (cannot disable notification center)
   */
  @Column({ name: 'in_app_enabled', type: 'boolean', default: true })
  inAppEnabled!: boolean;

  /**
   * Email notifications enabled (AC #2)
   * Story 16.6: Email via EmailNotificationService, disabled by default (opt-in)
   */
  @Column({ name: 'email_enabled', type: 'boolean', default: false })
  emailEnabled!: boolean;

  /**
   * Quiet hours configuration (AC #3: Do Not Disturb Mode)
   * Timezone-aware notification suppression
   */
  @Column({
    name: 'quiet_hours',
    type: 'jsonb',
    default: DEFAULT_QUIET_HOURS_CONFIG,
  })
  quietHours!: QuietHoursConfig;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
