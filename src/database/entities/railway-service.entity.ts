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

export enum RailwayServiceType {
  WEB = 'web',
  API = 'api',
  WORKER = 'worker',
  DATABASE = 'database',
  CACHE = 'cache',
  CRON = 'cron',
}

export enum RailwayServiceStatus {
  PROVISIONING = 'provisioning',
  ACTIVE = 'active',
  DEPLOYING = 'deploying',
  FAILED = 'failed',
  STOPPED = 'stopped',
  REMOVED = 'removed',
}

@Entity('railway_services')
@Index(['projectId', 'railwayServiceId'], { unique: true })
@Index(['projectId'])
@Index(['workspaceId'])
export class RailwayServiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 100, name: 'railway_project_id' })
  railwayProjectId!: string;

  @Column({ type: 'varchar', length: 100, name: 'railway_service_id' })
  railwayServiceId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({
    type: 'enum',
    enum: RailwayServiceType,
    name: 'service_type',
  })
  serviceType!: RailwayServiceType;

  @Column({
    type: 'enum',
    enum: RailwayServiceStatus,
    default: RailwayServiceStatus.PROVISIONING,
  })
  status!: RailwayServiceStatus;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'deployment_url' })
  deploymentUrl?: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'custom_domain' })
  customDomain?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'railway_environment_id' })
  railwayEnvironmentId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'github_repo' })
  githubRepo?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'source_directory' })
  sourceDirectory?: string;

  @Column({ type: 'int', name: 'deploy_order', default: 0 })
  deployOrder!: number;

  @Column({ type: 'jsonb', default: {}, name: 'config' })
  config!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {}, name: 'resource_info' })
  resourceInfo!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
