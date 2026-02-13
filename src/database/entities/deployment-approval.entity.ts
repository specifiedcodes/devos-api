import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';

export enum DeploymentApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

@Entity('deployment_approvals')
@Index(['projectId', 'status'])
@Index(['workspaceId'])
@Index(['requestedAt'])
export class DeploymentApproval {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 20 })
  platform!: string;

  @Column({ type: 'varchar', length: 200 })
  branch!: string;

  @Column({ type: 'varchar', length: 40, nullable: true, name: 'commit_sha' })
  commitSha?: string;

  @Column({ type: 'varchar', length: 20 })
  environment!: string;

  @Column({
    type: 'enum',
    enum: DeploymentApprovalStatus,
    default: DeploymentApprovalStatus.PENDING,
  })
  status!: DeploymentApprovalStatus;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'story_id' })
  storyId?: string;

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'story_title' })
  storyTitle?: string;

  @Column({ type: 'jsonb', nullable: true })
  changes?: string[];

  @Column({ type: 'jsonb', nullable: true, name: 'test_results' })
  testResults?: { passed: number; failed: number; skipped?: number };

  @Column({ type: 'varchar', length: 100, default: 'system', name: 'requested_by' })
  requestedBy!: string;

  @Column({ type: 'uuid', nullable: true, name: 'reviewed_by' })
  reviewedBy?: string;

  @Column({ type: 'text', nullable: true, name: 'rejection_reason' })
  rejectionReason?: string;

  @CreateDateColumn({ type: 'timestamp', name: 'requested_at' })
  requestedAt!: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'reviewed_at' })
  reviewedAt?: Date;
}
