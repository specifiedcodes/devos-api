import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsUUID, IsBoolean, IsOptional } from 'class-validator';
import { Workspace } from './workspace.entity';

@Entity('ip_allowlist_configs')
@Index(['workspaceId'], { unique: true })
export class IpAllowlistConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', unique: true })
  @IsUUID()
  workspaceId!: string;

  @OneToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'boolean', default: false, name: 'is_enabled' })
  @IsBoolean()
  isEnabled!: boolean;

  /**
   * Grace period: 24 hours after enabling where all IPs are allowed
   * but denials are logged. Allows admins to verify the allowlist
   * before hard enforcement begins.
   */
  @Column({ type: 'timestamp', nullable: true, name: 'grace_period_ends_at' })
  @IsOptional()
  gracePeriodEndsAt!: Date | null;

  /**
   * Emergency disable: Owner can disable enforcement for 1 hour
   * to recover access if misconfigured.
   */
  @Column({ type: 'timestamp', nullable: true, name: 'emergency_disable_until' })
  @IsOptional()
  emergencyDisableUntil!: Date | null;

  /**
   * User who last enabled/modified the allowlist config.
   */
  @Column({ type: 'uuid', name: 'last_modified_by', nullable: true })
  @IsOptional()
  lastModifiedBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
