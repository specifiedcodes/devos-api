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
import { IsNotEmpty, IsUUID, IsEnum, IsOptional, IsString } from 'class-validator';
import { Project } from './project.entity';
import { Workspace } from './workspace.entity';

/**
 * Provisioning status enum
 * Represents the overall state of the provisioning workflow
 */
export enum ProvisioningStatusEnum {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Step status type
 * Represents the state of an individual provisioning step
 */
export type StepStatusType = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Step status interface
 * Structure for tracking individual step progress
 */
export interface StepStatus {
  status: StepStatusType;
  startedAt?: string; // ISO8601 timestamp
  completedAt?: string; // ISO8601 timestamp
  error?: string; // Error message if failed
}

/**
 * Provisioning steps structure
 * Defines all provisioning steps and their statuses
 */
export interface ProvisioningSteps {
  github_repo_created: StepStatus;
  database_provisioned: StepStatus;
  deployment_configured: StepStatus;
  project_initialized: StepStatus;
}

/**
 * ProvisioningStatus Entity
 * Tracks the multi-step resource provisioning workflow during project creation
 *
 * This entity manages the state machine for provisioning:
 * - GitHub repository creation (placeholder logic for Epic 6)
 * - Database provisioning (placeholder logic for Epic 6)
 * - Deployment platform setup (placeholder logic for Epic 6)
 * - Project initialization (actual logic: create project entity, set defaults)
 *
 * @see Epic 4 Story 4.7: Auto-Provisioning Status Backend
 */
@Entity('provisioning_status')
@Index('idx_provisioning_status_project_id', ['projectId'], { unique: true })
@Index('idx_provisioning_status_workspace_id', ['workspaceId'])
@Index('idx_provisioning_status_status', ['status'])
export class ProvisioningStatus {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id', unique: true })
  @IsUUID()
  @IsNotEmpty()
  projectId!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId!: string;

  @Column({
    type: 'enum',
    enum: ProvisioningStatusEnum,
    default: ProvisioningStatusEnum.PENDING,
  })
  @IsEnum(ProvisioningStatusEnum)
  @IsNotEmpty()
  status!: ProvisioningStatusEnum;

  @Column({
    type: 'jsonb',
    default: {
      github_repo_created: { status: 'pending' },
      database_provisioned: { status: 'pending' },
      deployment_configured: { status: 'pending' },
      project_initialized: { status: 'pending' },
    },
  })
  @IsNotEmpty()
  steps!: ProvisioningSteps;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'current_step' })
  @IsOptional()
  @IsString()
  currentStep?: string | null;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  @IsOptional()
  @IsString()
  errorMessage?: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'started_at' })
  @IsOptional()
  startedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  @IsOptional()
  completedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;
}
