/**
 * White-Label Configuration Entity
 * Story 22-1: White-Label Configuration (AC1)
 *
 * Stores per-workspace white-label branding configuration including
 * logo URLs, colors, fonts, custom CSS, and custom domain settings.
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

export enum BackgroundMode {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

export enum BackgroundType {
  COLOR = 'color',
  GRADIENT = 'gradient',
  IMAGE = 'image',
}

export enum DomainStatus {
  PENDING = 'pending',
  VERIFYING = 'verifying',
  VERIFIED = 'verified',
  FAILED = 'failed',
}

@Entity('white_label_configs')
@Index(['workspaceId'], { unique: true })
export class WhiteLabelConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @OneToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 100, name: 'app_name', default: 'DevOS' })
  appName!: string;

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'logo_url' })
  logoUrl?: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'logo_dark_url' })
  logoDarkUrl?: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'favicon_url' })
  faviconUrl?: string | null;

  @Column({ type: 'varchar', length: 7, name: 'primary_color', default: '#6366F1' })
  primaryColor!: string;

  @Column({ type: 'varchar', length: 7, name: 'secondary_color', default: '#8B5CF6' })
  secondaryColor!: string;

  @Column({
    type: 'enum',
    enum: BackgroundMode,
    name: 'background_mode',
    default: BackgroundMode.SYSTEM,
  })
  backgroundMode!: BackgroundMode;

  @Column({ type: 'varchar', length: 255, name: 'font_family', default: 'Inter' })
  fontFamily!: string;

  @Column({ type: 'text', nullable: true, name: 'custom_css' })
  customCss?: string | null;

  @Column({ type: 'varchar', length: 253, nullable: true, name: 'custom_domain' })
  customDomain?: string | null;

  @Column({
    type: 'enum',
    enum: DomainStatus,
    name: 'domain_status',
    nullable: true,
    default: DomainStatus.PENDING,
  })
  domainStatus?: DomainStatus | null;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'domain_verification_token' })
  domainVerificationToken?: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'domain_verified_at' })
  domainVerifiedAt?: Date | null;

  @Column({ type: 'boolean', name: 'ssl_provisioned', default: false })
  sslProvisioned!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: false })
  isActive!: boolean;

  @Column({ type: 'boolean', name: 'show_devos_branding', default: false })
  showDevosBranding!: boolean;

  @Column({
    type: 'enum',
    enum: BackgroundType,
    name: 'background_type',
    default: BackgroundType.COLOR,
  })
  backgroundType!: BackgroundType;

  @Column({ type: 'varchar', length: 1024, name: 'background_value', default: '#f3f4f6' })
  backgroundValue!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'hero_text' })
  heroText?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'hero_subtext' })
  heroSubtext?: string | null;

  @Column({ type: 'jsonb', name: 'custom_links', default: [] })
  customLinks!: Array<{ text: string; url: string }>;

  @Column({ type: 'boolean', name: 'show_signup', default: false })
  showSignup!: boolean;

  @Column({ type: 'text', nullable: true, name: 'login_page_css' })
  loginPageCss?: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
