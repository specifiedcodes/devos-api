import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';
import { SamlConfiguration } from './saml-configuration.entity';

export enum SsoAuditEventType {
  SAML_LOGIN_SUCCESS = 'saml_login_success',
  SAML_LOGIN_FAILURE = 'saml_login_failure',
  SAML_CONFIG_CREATED = 'saml_config_created',
  SAML_CONFIG_UPDATED = 'saml_config_updated',
  SAML_CONFIG_DELETED = 'saml_config_deleted',
  SAML_CONFIG_ACTIVATED = 'saml_config_activated',
  SAML_CONFIG_DEACTIVATED = 'saml_config_deactivated',
  SAML_TEST_SUCCESS = 'saml_test_success',
  SAML_TEST_FAILURE = 'saml_test_failure',
  CERTIFICATE_ROTATED = 'certificate_rotated',
  IDP_CONNECTION_ERROR = 'idp_connection_error',
}

@Entity('sso_audit_events')
@Index(['workspaceId'])
@Index(['eventType'])
@Index(['actorId'])
@Index(['createdAt'])
@Index(['samlConfigId'])
export class SsoAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 60, name: 'event_type' })
  @IsNotEmpty()
  eventType!: SsoAuditEventType;

  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  @IsOptional()
  @IsUUID()
  actorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: User;

  @Column({ type: 'uuid', name: 'target_user_id', nullable: true })
  @IsOptional()
  @IsUUID()
  targetUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'target_user_id' })
  targetUser?: User;

  @Column({ type: 'uuid', name: 'saml_config_id', nullable: true })
  @IsOptional()
  @IsUUID()
  samlConfigId!: string | null;

  @ManyToOne(() => SamlConfiguration, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'saml_config_id' })
  samlConfiguration?: SamlConfiguration;

  @Column({ type: 'varchar', length: 45, name: 'ip_address', nullable: true })
  @IsOptional()
  ipAddress!: string | null;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  @IsOptional()
  userAgent!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
