/**
 * Template Entity
 *
 * Story 19-1: Template Registry Backend
 *
 * Database-backed template storage system for dynamic, versionable templates.
 * Replaces the hardcoded TEMPLATE_REGISTRY constant from Story 4.2.
 */
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
import {
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsInt,
  MaxLength,
  Matches,
  Min,
  Max,
  IsUrl,
  IsEnum,
} from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

export enum TemplateCategory {
  WEB_APP = 'web-app',
  API = 'api',
  MOBILE = 'mobile',
  SAAS = 'saas',
  ECOMMERCE = 'ecommerce',
  BLOG = 'blog',
  AI_APP = 'ai-app',
  REALTIME = 'realtime',
}

export enum TemplateSourceType {
  GIT = 'git',
  ARCHIVE = 'archive',
  INLINE = 'inline',
}

/**
 * Template test status for featured templates
 */
export enum TemplateTestStatus {
  UNKNOWN = 'unknown',
  PASSING = 'passing',
  FAILING = 'failing',
  PENDING = 'pending',
}

/**
 * Template Definition Spec - the JSONB structure stored in `definition` column
 */
export interface TemplateDefinitionSpec {
  stack: {
    frontend?: string;
    backend?: string;
    database?: string;
    auth?: string;
    styling?: string;
    deployment?: string;
  };
  variables: Array<{
    name: string;
    type: 'string' | 'select' | 'boolean' | 'number' | 'multiselect' | 'secret';
    display_name?: string;
    description?: string;
    required?: boolean;
    default?: string | number | boolean | string[];
    options?: string[];
    validation?: string;
    min?: number;
    max?: number;
    depends_on?: string;
    group?: string;
  }>;
  files: {
    source_type: string;
    repository?: string;
    branch?: string;
    archive_url?: string;
    inline_files?: Record<string, string>;
  };
  post_install?: string[];
}

export interface TemplateStackSummary {
  frontend?: string;
  backend?: string;
  database?: string;
  auth?: string;
  styling?: string;
  deployment?: string;
}

@Entity('templates')
@Unique(['workspaceId', 'name'])
@Index(['workspaceId'])
@Index(['workspaceId', 'isActive'])
@Index(['category'])
@Index(['createdBy'])
@Index(['isOfficial'])
@Index(['isPublished'])
@Index(['isFeatured', 'featuredOrder'])
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', nullable: true })
  @IsOptional()
  @IsUUID()
  workspaceId!: string | null;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace | null;

  @Column({ type: 'varchar', length: 100 })
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9-]*[a-z0-9]$/, {
    message: 'name must be a valid slug (lowercase alphanumeric with hyphens)',
  })
  name!: string;

  @Column({ type: 'varchar', length: 255, name: 'display_name' })
  @IsNotEmpty()
  @MaxLength(255)
  displayName!: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  description!: string | null;

  @Column({ type: 'text', name: 'long_description', nullable: true })
  @IsOptional()
  longDescription!: string | null;

  @Column({ type: 'varchar', length: 50, default: '1.0.0' })
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'version must follow semver format (e.g., 1.0.0)' })
  version!: string;

  @Column({ type: 'varchar', length: 10, name: 'schema_version', default: 'v1' })
  @IsNotEmpty()
  schemaVersion!: string;

  @Column({ type: 'jsonb' })
  @IsNotEmpty()
  definition!: TemplateDefinitionSpec;

  @Column({ type: 'varchar', length: 50, default: TemplateCategory.WEB_APP })
  @IsNotEmpty()
  category!: TemplateCategory;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags!: string[];

  @Column({ type: 'varchar', length: 100, default: 'layout-dashboard' })
  @IsOptional()
  icon!: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  @IsOptional()
  screenshots!: string[];

  @Column({ type: 'jsonb', name: 'stack_summary', default: {} })
  stackSummary!: TemplateStackSummary;

  @Column({ type: 'jsonb', default: [] })
  variables!: Record<string, unknown>[];

  @Column({ type: 'varchar', length: 20, name: 'source_type', default: TemplateSourceType.GIT })
  sourceType!: TemplateSourceType;

  @Column({ type: 'text', name: 'source_url', nullable: true })
  @IsOptional()
  @IsUrl({}, { message: 'source_url must be a valid URL' })
  sourceUrl!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'source_branch', default: 'main' })
  @IsOptional()
  sourceBranch!: string;

  @Column({ type: 'boolean', name: 'is_official', default: false })
  @IsBoolean()
  isOfficial!: boolean;

  @Column({ type: 'boolean', name: 'is_published', default: false })
  @IsBoolean()
  isPublished!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'integer', name: 'total_uses', default: 0 })
  @IsInt()
  @Min(0)
  totalUses!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, name: 'avg_rating', default: '0.00' })
  @Min(0)
  @Max(5)
  avgRating!: number;

  @Column({ type: 'integer', name: 'rating_count', default: 0 })
  @IsInt()
  @Min(0)
  ratingCount!: number;

  // Story 19-8: Featured Templates Curation
  @Column({ type: 'boolean', name: 'is_featured', default: false })
  @IsBoolean()
  isFeatured!: boolean;

  @Column({ type: 'integer', name: 'featured_order', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  featuredOrder!: number | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'test_status',
    default: TemplateTestStatus.UNKNOWN,
  })
  @IsEnum(TemplateTestStatus)
  testStatus!: TemplateTestStatus;

  @Column({ type: 'timestamp with time zone', name: 'last_test_run_at', nullable: true })
  @IsOptional()
  lastTestRunAt!: Date | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  @IsOptional()
  @IsUUID()
  createdBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
