/**
 * User Kanban Preferences Entity
 * Story 7.8: Kanban Board Customization
 *
 * Stores per-user Kanban board customization preferences with optional per-project overrides.
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
import { IsUUID, IsOptional, IsEnum, IsString } from 'class-validator';
import { User } from './user.entity';
import { Project } from './project.entity';

/**
 * Column configuration for Kanban board
 */
export interface KanbanColumnConfig {
  status: string;
  visible: boolean;
  displayName: string;
  order: number;
}

/**
 * Card display configuration for Kanban board
 */
export interface KanbanCardDisplayConfig {
  showStoryPoints: boolean;
  showTags: boolean;
  showDates: boolean;
  showPriority: boolean;
  showEpic: boolean;
  showAssignedAgent: boolean;
}

/**
 * Theme options
 */
export type KanbanTheme = 'light' | 'dark' | 'system';

/**
 * Default column configuration
 */
export const DEFAULT_COLUMN_CONFIG: KanbanColumnConfig[] = [
  { status: 'backlog', visible: true, displayName: 'Backlog', order: 0 },
  { status: 'in_progress', visible: true, displayName: 'In Progress', order: 1 },
  { status: 'review', visible: true, displayName: 'Review', order: 2 },
  { status: 'done', visible: true, displayName: 'Done', order: 3 },
];

/**
 * Default card display configuration
 */
export const DEFAULT_CARD_DISPLAY_CONFIG: KanbanCardDisplayConfig = {
  showStoryPoints: true,
  showTags: true,
  showDates: false,
  showPriority: true,
  showEpic: true,
  showAssignedAgent: true,
};

@Entity('user_kanban_preferences')
@Unique(['userId', 'projectId'])
@Index(['userId'])
@Index(['projectId'])
export class UserKanbanPreferences {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  @IsUUID()
  userId!: string;

  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  @IsUUID()
  @IsOptional()
  projectId!: string | null;  // null = default preferences for user across all projects

  @Column({ type: 'jsonb', name: 'column_config', default: () => `'${JSON.stringify(DEFAULT_COLUMN_CONFIG)}'::jsonb` })
  columnConfig!: KanbanColumnConfig[];

  @Column({ type: 'jsonb', name: 'card_display_config', default: () => `'${JSON.stringify(DEFAULT_CARD_DISPLAY_CONFIG)}'::jsonb` })
  cardDisplayConfig!: KanbanCardDisplayConfig;

  @Column({ type: 'varchar', length: 10, default: 'system' })
  @IsString()
  theme!: KanbanTheme;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project | null;
}
