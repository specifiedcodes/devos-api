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
import { IsNotEmpty, IsOptional, IsBoolean, IsUUID, IsArray } from 'class-validator';
import { Workspace } from './workspace.entity';

export enum OidcProviderType {
  GOOGLE = 'google',
  MICROSOFT = 'microsoft',
  OKTA = 'okta',
  AUTH0 = 'auth0',
  CUSTOM = 'custom',
}

@Entity('oidc_configurations')
@Index(['workspaceId'])
@Index(['isActive'])
@Index(['providerType'])
export class OidcConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 50, name: 'provider_type', default: OidcProviderType.CUSTOM })
  @IsNotEmpty()
  providerType!: OidcProviderType;

  @Column({ type: 'varchar', length: 255, name: 'display_name', nullable: true })
  @IsOptional()
  displayName!: string | null;

  @Column({ type: 'varchar', length: 500, name: 'client_id' })
  @IsNotEmpty()
  clientId!: string;

  @Column({ type: 'text', name: 'client_secret' })
  @IsNotEmpty()
  clientSecret!: string;

  @Column({ type: 'varchar', length: 200, name: 'client_secret_iv' })
  @IsNotEmpty()
  clientSecretIv!: string;

  @Column({ type: 'text', name: 'discovery_url' })
  @IsNotEmpty()
  discoveryUrl!: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  issuer!: string | null;

  @Column({ type: 'text', name: 'authorization_endpoint', nullable: true })
  @IsOptional()
  authorizationEndpoint!: string | null;

  @Column({ type: 'text', name: 'token_endpoint', nullable: true })
  @IsOptional()
  tokenEndpoint!: string | null;

  @Column({ type: 'text', name: 'userinfo_endpoint', nullable: true })
  @IsOptional()
  userinfoEndpoint!: string | null;

  @Column({ type: 'text', name: 'jwks_uri', nullable: true })
  @IsOptional()
  jwksUri!: string | null;

  @Column({ type: 'text', name: 'end_session_endpoint', nullable: true })
  @IsOptional()
  endSessionEndpoint!: string | null;

  @Column({ type: 'text', array: true, default: () => "ARRAY['openid', 'email', 'profile']" })
  @IsArray()
  scopes!: string[];

  @Column({ type: 'text', array: true, name: 'allowed_domains', nullable: true })
  @IsOptional()
  allowedDomains!: string[] | null;

  @Column({ type: 'varchar', length: 50, name: 'response_type', default: 'code' })
  responseType!: string;

  @Column({ type: 'boolean', name: 'use_pkce', default: true })
  @IsBoolean()
  usePkce!: boolean;

  @Column({ type: 'varchar', length: 50, name: 'token_endpoint_auth_method', default: 'client_secret_post' })
  tokenEndpointAuthMethod!: string;

  @Column({
    type: 'jsonb',
    name: 'attribute_mapping',
    default: () => `'{"email": "email", "firstName": "given_name", "lastName": "family_name", "groups": "groups"}'`,
  })
  attributeMapping!: Record<string, string>;

  @Column({ type: 'boolean', name: 'is_active', default: false })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'boolean', name: 'is_tested', default: false })
  @IsBoolean()
  isTested!: boolean;

  @Column({ type: 'timestamp with time zone', name: 'last_login_at', nullable: true })
  @IsOptional()
  lastLoginAt!: Date | null;

  @Column({ type: 'integer', name: 'login_count', default: 0 })
  loginCount!: number;

  @Column({ type: 'integer', name: 'error_count', default: 0 })
  errorCount!: number;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  @IsOptional()
  lastError!: string | null;

  @Column({ type: 'timestamp with time zone', name: 'last_error_at', nullable: true })
  @IsOptional()
  lastErrorAt!: Date | null;

  @Column({ type: 'timestamp with time zone', name: 'discovery_last_fetched_at', nullable: true })
  @IsOptional()
  discoveryLastFetchedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
