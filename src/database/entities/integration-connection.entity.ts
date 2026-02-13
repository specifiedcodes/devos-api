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
import { IsUUID, IsNotEmpty, IsEnum, IsOptional, IsString } from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

export enum IntegrationProvider {
  GITHUB = 'github',
  RAILWAY = 'railway',
  VERCEL = 'vercel',
  SUPABASE = 'supabase',
}

export enum IntegrationStatus {
  ACTIVE = 'active',
  DISCONNECTED = 'disconnected',
  EXPIRED = 'expired',
  ERROR = 'error',
}

@Entity('integration_connections')
@Unique(['workspaceId', 'provider'])
@Index(['workspaceId'])
@Index(['userId'])
export class IntegrationConnection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId!: string;

  @ManyToOne(() => Workspace)
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'uuid', name: 'user_id' })
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({
    type: 'enum',
    enum: IntegrationProvider,
  })
  @IsEnum(IntegrationProvider)
  provider!: IntegrationProvider;

  @Column({
    type: 'enum',
    enum: IntegrationStatus,
    default: IntegrationStatus.ACTIVE,
  })
  @IsEnum(IntegrationStatus)
  status!: IntegrationStatus;

  @Column({ type: 'text', name: 'encrypted_access_token' })
  @IsNotEmpty()
  encryptedAccessToken!: string;

  @Column({ type: 'text', name: 'encryption_iv' })
  @IsNotEmpty()
  encryptionIV!: string;

  @Column({ type: 'varchar', length: 50, name: 'token_type', default: 'bearer' })
  @IsString()
  tokenType!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @IsOptional()
  @IsString()
  scopes?: string;

  @Column({ type: 'varchar', length: 100, name: 'external_user_id', nullable: true })
  @IsOptional()
  @IsString()
  externalUserId?: string;

  @Column({ type: 'varchar', length: 100, name: 'external_username', nullable: true })
  @IsOptional()
  @IsString()
  externalUsername?: string;

  @Column({ type: 'varchar', length: 500, name: 'external_avatar_url', nullable: true })
  @IsOptional()
  @IsString()
  externalAvatarUrl?: string;

  @Column({ type: 'jsonb', nullable: true })
  @IsOptional()
  metadata?: Record<string, any>;

  @Column({ type: 'timestamp', name: 'connected_at' })
  connectedAt!: Date;

  @Column({ type: 'timestamp', name: 'last_used_at', nullable: true })
  @IsOptional()
  lastUsedAt?: Date;

  @Column({ type: 'timestamp', name: 'expires_at', nullable: true })
  @IsOptional()
  expiresAt?: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
