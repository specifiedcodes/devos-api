import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsBoolean, IsUUID, MaxLength, Matches } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

export enum AgentDefinitionCategory {
  DEVELOPMENT = 'development',
  QA = 'qa',
  DEVOPS = 'devops',
  DOCUMENTATION = 'documentation',
  PRODUCTIVITY = 'productivity',
  SECURITY = 'security',
  CUSTOM = 'custom',
}

/**
 * Agent Definition Spec - the JSONB structure stored in `definition` column
 * This interface defines the v1 agent definition schema.
 */
export interface AgentDefinitionSpec {
  role: string;
  system_prompt: string;
  model_preferences: {
    preferred: string;
    fallback?: string;
    max_tokens?: number;
    temperature?: number;
  };
  tools?: {
    allowed?: string[];
    denied?: string[];
  };
  triggers?: Array<{
    event: string;
    auto_run: boolean;
  }>;
  inputs?: Array<{
    name: string;
    type: 'text' | 'select' | 'number' | 'boolean';
    options?: string[];
    default?: string | number | boolean;
    required?: boolean;
    description?: string;
  }>;
  outputs?: Array<{
    name: string;
    type: 'markdown' | 'json' | 'number' | 'boolean' | 'text';
    description?: string;
  }>;
}

@Entity('agent_definitions')
@Unique(['workspaceId', 'name'])
@Index(['workspaceId'])
@Index(['workspaceId', 'isActive'])
@Index(['category'])
@Index(['createdBy'])
export class AgentDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 100 })
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'name must be a valid slug (lowercase alphanumeric with hyphens, no leading/trailing hyphens)',
  })
  name!: string;

  @Column({ type: 'varchar', length: 255, name: 'display_name' })
  @IsNotEmpty()
  @MaxLength(255)
  displayName!: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  description!: string | null;

  @Column({ type: 'varchar', length: 50, default: '1.0.0' })
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'version must follow semver format (e.g., 1.0.0)' })
  version!: string;

  @Column({ type: 'varchar', length: 10, name: 'schema_version', default: 'v1' })
  @IsNotEmpty()
  schemaVersion!: string;

  @Column({ type: 'jsonb' })
  @IsNotEmpty()
  definition!: AgentDefinitionSpec;

  @Column({ type: 'varchar', length: 100, default: 'bot' })
  @IsOptional()
  icon!: string;

  @Column({ type: 'varchar', length: 50, default: 'custom' })
  @IsNotEmpty()
  category!: AgentDefinitionCategory;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags!: string[];

  @Column({ type: 'boolean', name: 'is_published', default: false })
  @IsBoolean()
  isPublished!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'uuid', name: 'created_by' })
  @IsUUID()
  createdBy!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
