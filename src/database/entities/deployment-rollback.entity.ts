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

export enum DeploymentRollbackStatus {
  IN_PROGRESS = 'in_progress',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum DeploymentRollbackTriggerType {
  MANUAL = 'manual',
  AUTOMATIC = 'automatic',
}

@Entity('deployment_rollbacks')
@Index(['projectId', 'status'])
@Index(['workspaceId'])
@Index(['initiatedAt'])
export class DeploymentRollback {
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

  @Column({ type: 'varchar', length: 100, name: 'deployment_id' })
  deploymentId!: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'target_deployment_id' })
  targetDeploymentId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'new_deployment_id' })
  newDeploymentId?: string;

  @Column({ type: 'varchar', length: 20 })
  environment!: string;

  @Column({
    type: 'enum',
    enum: DeploymentRollbackStatus,
    default: DeploymentRollbackStatus.IN_PROGRESS,
  })
  status!: DeploymentRollbackStatus;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({
    type: 'enum',
    enum: DeploymentRollbackTriggerType,
    default: DeploymentRollbackTriggerType.MANUAL,
    name: 'trigger_type',
  })
  triggerType!: DeploymentRollbackTriggerType;

  @Column({ type: 'uuid', name: 'initiated_by' })
  initiatedBy!: string;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage?: string;

  @CreateDateColumn({ type: 'timestamp', name: 'initiated_at' })
  initiatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completedAt?: Date;
}
