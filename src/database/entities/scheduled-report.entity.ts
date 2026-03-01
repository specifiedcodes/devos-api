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
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

export enum ReportFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

@Entity('scheduled_reports')
@Index('IDX_scheduled_reports_workspace', ['workspaceId'])
@Index('IDX_scheduled_reports_frequency', ['frequency', 'isActive'])
export class ScheduledReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    type: 'enum',
    enum: ReportFrequency,
  })
  frequency!: ReportFrequency;

  @Column({ type: 'integer', name: 'day_of_week', nullable: true })
  dayOfWeek?: number;

  @Column({ type: 'integer', name: 'day_of_month', nullable: true })
  dayOfMonth?: number;

  @Column({ type: 'varchar', length: 5, name: 'time_utc', default: '09:00' })
  timeUtc!: string;

  @Column({ type: 'simple-array', name: 'sections' })
  sections!: string[];

  @Column({ type: 'jsonb', default: {} })
  filters!: Record<string, any>;

  @Column({ type: 'simple-array' })
  recipients!: string[];

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamptz', name: 'last_sent_at', nullable: true })
  lastSentAt?: Date;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
