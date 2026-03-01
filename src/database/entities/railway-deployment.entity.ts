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
import { RailwayServiceEntity } from './railway-service.entity';

export enum DeploymentStatus {
  QUEUED = 'queued',
  BUILDING = 'building',
  DEPLOYING = 'deploying',
  SUCCESS = 'success',
  FAILED = 'failed',
  CRASHED = 'crashed',
  CANCELLED = 'cancelled',
  ROLLED_BACK = 'rolled_back',
}

@Entity('railway_deployments')
@Index(['railwayServiceEntityId', 'createdAt'])
@Index(['projectId'])
@Index(['workspaceId'])
@Index(['status'])
export class RailwayDeployment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'railway_service_entity_id' })
  railwayServiceEntityId!: string;

  @ManyToOne(() => RailwayServiceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'railway_service_entity_id' })
  railwayServiceEntity!: RailwayServiceEntity;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 100, name: 'railway_deployment_id' })
  railwayDeploymentId!: string;

  @Column({
    type: 'enum',
    enum: DeploymentStatus,
  })
  status!: DeploymentStatus;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'deployment_url' })
  deploymentUrl?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'commit_sha' })
  commitSha?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  branch?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'triggered_by' })
  triggeredBy?: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'trigger_type' })
  triggerType?: string;

  @Column({ type: 'int', nullable: true, name: 'build_duration_seconds' })
  buildDurationSeconds?: number;

  @Column({ type: 'int', nullable: true, name: 'deploy_duration_seconds' })
  deployDurationSeconds?: number;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage?: string;

  @Column({ type: 'jsonb', default: {}, name: 'meta' })
  meta!: Record<string, unknown>;

  @Column({ type: 'timestamp', nullable: true, name: 'started_at' })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completedAt?: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
