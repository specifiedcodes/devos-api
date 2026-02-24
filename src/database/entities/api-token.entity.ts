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
  IsUUID,
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsOptional,
  MaxLength,
  IsArray,
} from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

@Entity('api_tokens')
@Index(['workspaceId'])
@Index(['tokenHash'])
@Index(['workspaceId', 'isActive'])
export class ApiToken {
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
  @MaxLength(100)
  name!: string;

  @Column({ type: 'varchar', length: 255, name: 'token_hash' })
  @IsNotEmpty()
  @IsString()
  tokenHash!: string;

  @Column({ type: 'varchar', length: 20, name: 'token_prefix' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  tokenPrefix!: string;

  @Column({ type: 'simple-array', default: '' })
  @IsArray()
  scopes!: string[];

  @Column({ type: 'boolean', name: 'is_active', default: true })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'timestamp with time zone', name: 'last_used_at', nullable: true })
  @IsOptional()
  lastUsedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', name: 'expires_at', nullable: true })
  @IsOptional()
  expiresAt!: Date | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  @IsOptional()
  @IsUUID()
  createdBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
