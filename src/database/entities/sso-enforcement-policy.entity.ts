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
import { IsOptional, IsUUID, IsBoolean, IsInt, Min, Max, IsArray, IsString, MaxLength } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

@Entity('sso_enforcement_policies')
@Index(['workspaceId'], { unique: true })
export class SsoEnforcementPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  enforced!: boolean;

  @Column({ type: 'integer', name: 'grace_period_hours', default: 72 })
  @IsInt()
  @Min(0)
  @Max(720)
  gracePeriodHours!: number;

  @Column({ type: 'timestamp with time zone', name: 'grace_period_start', nullable: true })
  @IsOptional()
  gracePeriodStart!: Date | null;

  @Column({ type: 'timestamp with time zone', name: 'grace_period_end', nullable: true })
  @IsOptional()
  gracePeriodEnd!: Date | null;

  @Column({ type: 'text', array: true, name: 'bypass_emails', default: () => "ARRAY[]::text[]" })
  @IsArray()
  bypassEmails!: string[];

  @Column({ type: 'boolean', name: 'bypass_service_accounts', default: true })
  @IsBoolean()
  bypassServiceAccounts!: boolean;

  @Column({ type: 'boolean', name: 'owner_bypass_enabled', default: true })
  @IsBoolean()
  ownerBypassEnabled!: boolean;

  @Column({ type: 'boolean', name: 'password_login_blocked', default: false })
  @IsBoolean()
  passwordLoginBlocked!: boolean;

  @Column({ type: 'boolean', name: 'registration_blocked', default: false })
  @IsBoolean()
  registrationBlocked!: boolean;

  @Column({ type: 'varchar', length: 500, name: 'enforcement_message', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  enforcementMessage!: string | null;

  @Column({ type: 'timestamp with time zone', name: 'enforced_at', nullable: true })
  @IsOptional()
  enforcedAt!: Date | null;

  @Column({ type: 'uuid', name: 'enforced_by', nullable: true })
  @IsOptional()
  @IsUUID()
  enforcedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'enforced_by' })
  enforcedByUser?: User;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
