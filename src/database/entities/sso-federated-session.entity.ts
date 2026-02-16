import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsUUID, IsEnum, IsInt, Min } from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

export enum SsoProviderType {
  SAML = 'saml',
  OIDC = 'oidc',
}

export enum SessionTerminationReason {
  LOGOUT = 'logout',
  TIMEOUT = 'timeout',
  IDLE_TIMEOUT = 'idle_timeout',
  FORCED = 'forced',
  IDP_LOGOUT = 'idp_logout',
  TOKEN_REFRESH_FAILED = 'token_refresh_failed',
  SCIM_DEACTIVATED = 'scim_deactivated',
}

@Entity('sso_federated_sessions')
@Index(['userId'])
@Index(['workspaceId'])
@Index(['userId', 'workspaceId'])
@Index(['devosSessionId'])
export class SsoFederatedSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  @IsUUID()
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 10, name: 'provider_type' })
  @IsEnum(SsoProviderType)
  providerType!: SsoProviderType;

  @Column({ type: 'uuid', name: 'provider_config_id' })
  @IsUUID()
  providerConfigId!: string;

  @Column({ type: 'varchar', length: 512, name: 'idp_session_id', nullable: true })
  @IsOptional()
  idpSessionId!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'devos_session_id' })
  @IsNotEmpty()
  devosSessionId!: string;

  @Column({ type: 'varchar', length: 255, name: 'access_token_jti', nullable: true })
  @IsOptional()
  accessTokenJti!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'refresh_token_jti', nullable: true })
  @IsOptional()
  refreshTokenJti!: string | null;

  @Column({ type: 'integer', name: 'session_timeout_minutes', default: 480 })
  @IsInt()
  @Min(1)
  sessionTimeoutMinutes!: number;

  @Column({ type: 'integer', name: 'idle_timeout_minutes', default: 30 })
  @IsInt()
  @Min(1)
  idleTimeoutMinutes!: number;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamp with time zone', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'timestamp with time zone', name: 'last_activity_at', default: () => 'NOW()' })
  lastActivityAt!: Date;

  @Column({ type: 'timestamp with time zone', name: 'terminated_at', nullable: true })
  @IsOptional()
  terminatedAt!: Date | null;

  @Column({ type: 'varchar', length: 30, name: 'termination_reason', nullable: true })
  @IsOptional()
  @IsEnum(SessionTerminationReason)
  terminationReason!: SessionTerminationReason | null;
}
