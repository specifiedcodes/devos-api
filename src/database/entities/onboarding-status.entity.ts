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
import {
  IsNotEmpty,
  IsUUID,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

export enum OnboardingStatusEnum {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

@Entity('onboarding_status')
@Index(['userId', 'workspaceId'], { unique: true })
@Index(['userId'])
@Index(['workspaceId'])
export class OnboardingStatus {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId!: string;

  @ManyToOne(() => Workspace)
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({
    type: 'enum',
    enum: OnboardingStatusEnum,
    default: OnboardingStatusEnum.NOT_STARTED,
  })
  @IsEnum(OnboardingStatusEnum)
  status!: OnboardingStatusEnum;

  @Column({ type: 'boolean', default: true, name: 'account_created' })
  @IsBoolean()
  accountCreated!: boolean;

  @Column({ type: 'boolean', default: false, name: 'github_connected' })
  @IsBoolean()
  githubConnected!: boolean;

  @Column({
    type: 'boolean',
    default: false,
    name: 'deployment_configured',
  })
  @IsBoolean()
  deploymentConfigured!: boolean;

  @Column({ type: 'boolean', default: false, name: 'database_configured' })
  @IsBoolean()
  databaseConfigured!: boolean;

  @Column({ type: 'boolean', default: false, name: 'ai_key_added' })
  @IsBoolean()
  aiKeyAdded!: boolean;

  @Column({
    type: 'boolean',
    default: false,
    name: 'first_project_created',
  })
  @IsBoolean()
  firstProjectCreated!: boolean;

  @Column({ type: 'boolean', default: false, name: 'tutorial_completed' })
  @IsBoolean()
  tutorialCompleted!: boolean;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'service_connections',
    name: 'current_step',
  })
  @IsString()
  @MaxLength(50)
  currentStep!: string;

  @Column({ type: 'timestamp', nullable: true, name: 'started_at' })
  @IsOptional()
  startedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  @IsOptional()
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
