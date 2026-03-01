import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { Project } from './project.entity';
import { Sprint } from './sprint.entity';

@Entity('sprint_metrics')
@Unique('UQ_sprint_metrics_sprint_date', ['sprintId', 'date'])
@Index('IDX_sprint_metrics_sprint_date', ['sprintId', 'date'])
@Index('IDX_sprint_metrics_project', ['projectId'])
export class SprintMetric {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'uuid', name: 'sprint_id' })
  sprintId!: string;

  @ManyToOne(() => Sprint, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sprint_id' })
  sprint!: Sprint;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'integer', name: 'total_points', default: 0 })
  totalPoints!: number;

  @Column({ type: 'integer', name: 'completed_points', default: 0 })
  completedPoints!: number;

  @Column({ type: 'integer', name: 'remaining_points', default: 0 })
  remainingPoints!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'ideal_remaining', nullable: true })
  idealRemaining!: number | null;

  @Column({ type: 'integer', name: 'stories_completed', default: 0 })
  storiesCompleted!: number;

  @Column({ type: 'integer', name: 'stories_total', default: 0 })
  storiesTotal!: number;

  @Column({ type: 'integer', name: 'scope_changes', default: 0 })
  scopeChanges!: number;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
