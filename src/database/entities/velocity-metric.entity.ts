import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { Project } from './project.entity';
import { Sprint } from './sprint.entity';

@Entity('velocity_metrics')
@Index('IDX_velocity_metrics_project', ['projectId'])
@Index('IDX_velocity_metrics_dates', ['startDate', 'endDate'])
export class VelocityMetric {
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

  @Column({ type: 'uuid', name: 'sprint_id', unique: true })
  sprintId!: string;

  @ManyToOne(() => Sprint, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sprint_id' })
  sprint!: Sprint;

  @Column({ type: 'varchar', length: 100, name: 'sprint_name' })
  sprintName!: string;

  @Column({ type: 'date', name: 'start_date' })
  startDate!: string;

  @Column({ type: 'date', name: 'end_date' })
  endDate!: string;

  @Column({ type: 'integer', name: 'planned_points', default: 0 })
  plannedPoints!: number;

  @Column({ type: 'integer', name: 'completed_points', default: 0 })
  completedPoints!: number;

  @Column({ type: 'integer', name: 'carried_over_points', default: 0 })
  carriedOverPoints!: number;

  @Column({ type: 'integer', name: 'scope_change_points', default: 0 })
  scopeChangePoints!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'average_cycle_time_hours', nullable: true })
  averageCycleTimeHours!: number | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
