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
import { IsNotEmpty, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { Workspace } from './workspace.entity';

@Entity('saml_configurations')
@Index(['workspaceId'])
@Index(['isActive'])
@Index(['entityId'])
export class SamlConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 100, name: 'provider_name', default: 'Custom' })
  @IsNotEmpty()
  providerName!: string;

  @Column({ type: 'varchar', length: 255, name: 'display_name', nullable: true })
  @IsOptional()
  displayName!: string | null;

  @Column({ type: 'text', name: 'entity_id' })
  @IsNotEmpty()
  entityId!: string;

  @Column({ type: 'text', name: 'sso_url' })
  @IsNotEmpty()
  ssoUrl!: string;

  @Column({ type: 'text', name: 'slo_url', nullable: true })
  @IsOptional()
  sloUrl!: string | null;

  @Column({ type: 'text' })
  @IsNotEmpty()
  certificate!: string;

  @Column({ type: 'varchar', length: 200, name: 'certificate_iv' })
  @IsNotEmpty()
  certificateIv!: string;

  @Column({ type: 'varchar', length: 128, name: 'certificate_fingerprint', nullable: true })
  @IsOptional()
  certificateFingerprint!: string | null;

  @Column({ type: 'timestamp with time zone', name: 'certificate_expires_at', nullable: true })
  @IsOptional()
  certificateExpiresAt!: Date | null;

  @Column({ type: 'text', name: 'signing_certificate', nullable: true })
  @IsOptional()
  signingCertificate!: string | null;

  @Column({ type: 'varchar', length: 200, name: 'signing_certificate_iv', nullable: true })
  @IsOptional()
  signingCertificateIv!: string | null;

  @Column({
    type: 'jsonb',
    name: 'attribute_mapping',
    default: () => `'{"email": "email", "firstName": "firstName", "lastName": "lastName", "groups": "groups"}'`,
  })
  attributeMapping!: Record<string, string>;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'name_id_format',
    default: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  })
  nameIdFormat!: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'authn_context',
    nullable: true,
    default: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
  })
  @IsOptional()
  authnContext!: string | null;

  @Column({ type: 'boolean', name: 'want_assertions_signed', default: true })
  @IsBoolean()
  wantAssertionsSigned!: boolean;

  @Column({ type: 'boolean', name: 'want_response_signed', default: true })
  @IsBoolean()
  wantResponseSigned!: boolean;

  @Column({ type: 'boolean', name: 'allow_unencrypted_assertion', default: false })
  @IsBoolean()
  allowUnencryptedAssertion!: boolean;

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

  @Column({ type: 'text', name: 'metadata_url', nullable: true })
  @IsOptional()
  metadataUrl!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
