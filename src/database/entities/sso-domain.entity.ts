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
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';
import { SamlConfiguration } from './saml-configuration.entity';
import { OidcConfiguration } from './oidc-configuration.entity';

export enum DomainVerificationMethod {
  DNS = 'dns',
  HTML = 'html',
  EMAIL = 'email',
}

export enum DomainStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  EXPIRED = 'expired',
  FAILED = 'failed',
}

@Entity('sso_domains')
@Index(['domain'], { unique: true })
@Index(['workspaceId'])
@Index(['status'])
export class SsoDomain {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 255, unique: true })
  @IsNotEmpty()
  domain!: string;

  @Column({ type: 'varchar', length: 20, name: 'verification_method', default: DomainVerificationMethod.DNS })
  verificationMethod!: DomainVerificationMethod;

  @Column({ type: 'varchar', length: 128, name: 'verification_token' })
  @IsNotEmpty()
  verificationToken!: string;

  @Column({ type: 'varchar', length: 20, default: DomainStatus.PENDING })
  status!: DomainStatus;

  @Column({ type: 'timestamp with time zone', name: 'verified_at', nullable: true })
  @IsOptional()
  verifiedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', name: 'expires_at', nullable: true })
  @IsOptional()
  expiresAt!: Date | null;

  @Column({ type: 'timestamp with time zone', name: 'last_check_at', nullable: true })
  @IsOptional()
  lastCheckAt!: Date | null;

  @Column({ type: 'text', name: 'last_check_error', nullable: true })
  @IsOptional()
  lastCheckError!: string | null;

  @Column({ type: 'integer', name: 'check_count', default: 0 })
  checkCount!: number;

  @Column({ type: 'uuid', name: 'saml_config_id', nullable: true })
  @IsOptional()
  @IsUUID()
  samlConfigId!: string | null;

  @ManyToOne(() => SamlConfiguration, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'saml_config_id' })
  samlConfiguration?: SamlConfiguration;

  @Column({ type: 'uuid', name: 'oidc_config_id', nullable: true })
  @IsOptional()
  @IsUUID()
  oidcConfigId!: string | null;

  @ManyToOne(() => OidcConfiguration, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'oidc_config_id' })
  oidcConfiguration?: OidcConfiguration;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  @IsOptional()
  @IsUUID()
  createdBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: User;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
