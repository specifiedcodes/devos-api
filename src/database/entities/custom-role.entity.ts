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
  IsUUID,
  IsNotEmpty,
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

export enum BaseRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  DEVELOPER = 'developer',
  VIEWER = 'viewer',
  NONE = 'none',
}

@Entity('custom_roles')
@Unique(['workspaceId', 'name'])
@Index(['workspaceId'])
@Index(['workspaceId', 'isActive'])
@Index(['createdBy'])
export class CustomRole {
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
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9_-]+$/, {
    message:
      'Name must contain only lowercase alphanumeric characters, hyphens, and underscores',
  })
  name!: string;

  @Column({ type: 'varchar', length: 100, name: 'display_name' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description!: string | null;

  @Column({ type: 'varchar', length: 7, default: '#6366f1' })
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'Color must be a valid hex color code (e.g., #6366f1)',
  })
  color!: string;

  @Column({ type: 'varchar', length: 50, default: 'shield' })
  @IsString()
  @MaxLength(50)
  icon!: string;

  @Column({ type: 'varchar', length: 20, name: 'base_role', nullable: true })
  @IsOptional()
  @IsEnum(BaseRole)
  baseRole!: BaseRole | null;

  @Column({ type: 'boolean', name: 'is_system', default: false })
  @IsBoolean()
  isSystem!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'int', name: 'priority_order', default: 0 })
  priority!: number;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  @IsOptional()
  @IsUUID()
  createdBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
