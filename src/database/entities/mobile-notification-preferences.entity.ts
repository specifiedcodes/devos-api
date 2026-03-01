/**
 * Mobile Notification Preferences Entity
 * Story 22.7: Mobile Push Notifications
 *
 * Stores user preferences for mobile push notifications.
 * Includes quiet hours, category toggles, and priority settings.
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

export type NotificationCategoryType = 'agent' | 'deployment' | 'cost' | 'sprint';

@Entity('mobile_notification_preferences')
@Index(['userId', 'workspaceId'])
@Unique(['userId', 'workspaceId'])
export class MobileNotificationPreferences {
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

  @Column({ type: 'time', name: 'quiet_hours_start', nullable: true })
  quietHoursStart?: string;

  @Column({ type: 'time', name: 'quiet_hours_end', nullable: true })
  quietHoursEnd?: string;

  @Column({
    type: 'simple-array',
    name: 'categories_enabled',
    default: 'agent,deployment,cost,sprint',
  })
  categoriesEnabled!: NotificationCategoryType[];

  @Column({
    type: 'boolean',
    name: 'urgent_only_in_quiet',
    default: true,
  })
  urgentOnlyInQuiet!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
