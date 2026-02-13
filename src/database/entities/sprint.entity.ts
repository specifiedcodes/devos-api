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

export enum SprintStatus {
  PLANNED = 'planned',
  ACTIVE = 'active',
  COMPLETED = 'completed',
}

/**
 * Sprint Entity
 * Story 7.6: Sprint View and Planning
 *
 * Represents a time-boxed iteration of work within a project.
 */
@Entity('sprints')
@Index(['projectId', 'sprintNumber'], { unique: true })
@Index(['projectId', 'status'])
export class Sprint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'integer', name: 'sprint_number' })
  sprintNumber!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  goal?: string;

  @Column({ type: 'date', nullable: true, name: 'start_date' })
  startDate?: string;

  @Column({ type: 'date', nullable: true, name: 'end_date' })
  endDate?: string;

  @Column({ type: 'integer', nullable: true })
  capacity?: number;

  @Column({
    type: 'enum',
    enum: SprintStatus,
    default: SprintStatus.PLANNED,
  })
  status!: SprintStatus;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completedAt?: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
