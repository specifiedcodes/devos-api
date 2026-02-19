/**
 * InstallationLog Entity
 *
 * Story 18-8: Agent Installation Flow
 *
 * Tracks agent installation progress and history.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsUUID, IsEnum, IsString, IsOptional, IsNumber, Min, Max, IsArray } from 'class-validator';
import { Workspace } from './workspace.entity';
import { MarketplaceAgent } from './marketplace-agent.entity';
import { User } from './user.entity';

export enum InstallationStatus {
  PENDING = 'pending',
  VALIDATING = 'validating',
  DOWNLOADING = 'downloading',
  RESOLVING_DEPENDENCIES = 'resolving_dependencies',
  INSTALLING = 'installing',
  CONFIGURING = 'configuring',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
}

export enum InstallationStep {
  PRE_CHECK = 'pre_check',
  VALIDATE_PERMISSIONS = 'validate_permissions',
  CHECK_DEPENDENCIES = 'check_dependencies',
  CHECK_CONFLICTS = 'check_conflicts',
  COPY_DEFINITION = 'copy_definition',
  INSTALL_DEPENDENCIES = 'install_dependencies',
  CONFIGURE_AGENT = 'configure_agent',
  VERIFY_INSTALLATION = 'verify_installation',
  COMPLETE = 'complete',
}

export interface InstallationStepInfo {
  step: InstallationStep;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

@Entity('installation_logs')
@Index(['workspaceId'])
@Index(['marketplaceAgentId'])
@Index(['status'])
@Index(['startedAt'])
export class InstallationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'uuid', name: 'marketplace_agent_id' })
  @IsUUID()
  marketplaceAgentId!: string;

  @ManyToOne(() => MarketplaceAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplace_agent_id' })
  marketplaceAgent?: MarketplaceAgent;

  @Column({ type: 'uuid', name: 'initiated_by', nullable: true })
  @IsUUID()
  @IsOptional()
  initiatedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'initiated_by' })
  initiator?: User | null;

  @Column({ type: 'varchar', length: 50, name: 'target_version' })
  @IsString()
  targetVersion!: string;

  @Column({
    type: 'enum',
    enum: InstallationStatus,
    default: InstallationStatus.PENDING,
  })
  @IsEnum(InstallationStatus)
  status!: InstallationStatus;

  @Column({
    type: 'enum',
    enum: InstallationStep,
    name: 'current_step',
    nullable: true,
  })
  @IsEnum(InstallationStep)
  @IsOptional()
  currentStep!: InstallationStep | null;

  @Column({
    type: 'int',
    name: 'progress_percentage',
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercentage!: number;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  @IsArray()
  @IsOptional()
  steps!: InstallationStepInfo[] | null;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  @IsString()
  @IsOptional()
  errorMessage!: string | null;

  @Column({ type: 'uuid', name: 'installed_agent_id', nullable: true })
  @IsUUID()
  @IsOptional()
  installedAgentId!: string | null;

  @Column({
    type: 'timestamp with time zone',
    name: 'started_at',
    default: () => 'NOW()',
  })
  startedAt!: Date;

  @Column({
    type: 'timestamp with time zone',
    name: 'completed_at',
    nullable: true,
  })
  @IsOptional()
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
