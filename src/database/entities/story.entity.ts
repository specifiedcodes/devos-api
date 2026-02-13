import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';
import { Agent } from './agent.entity';
import { Sprint } from './sprint.entity';

export enum StoryStatus {
  BACKLOG = 'backlog',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  DONE = 'done',
}

export enum StoryPriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * Story Entity
 * Story 7.1: Kanban Board Component (Frontend)
 *
 * Represents a project management story/task on the Kanban board.
 */
@Entity('stories')
@Index(['projectId', 'status'])
@Index(['projectId', 'epicId'])
@Index(['assignedAgentId'])
export class Story {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'uuid', nullable: true, name: 'epic_id' })
  epicId?: string;

  @Column({ type: 'varchar', length: 20, name: 'story_key' })
  storyKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: StoryStatus,
    default: StoryStatus.BACKLOG,
  })
  status!: StoryStatus;

  @Column({
    type: 'enum',
    enum: StoryPriority,
    default: StoryPriority.MEDIUM,
  })
  priority!: StoryPriority;

  @Column({ type: 'integer', nullable: true, name: 'story_points' })
  storyPoints?: number;

  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ type: 'simple-array', nullable: true })
  tags?: string[];

  @Column({ type: 'uuid', nullable: true, name: 'sprint_id' })
  @Index()
  sprintId?: string;

  @ManyToOne(() => Sprint, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sprint_id' })
  sprint?: Sprint;

  @Column({ type: 'uuid', nullable: true, name: 'assigned_agent_id' })
  assignedAgentId?: string;

  @ManyToOne(() => Agent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_agent_id' })
  assignedAgent?: Agent;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
