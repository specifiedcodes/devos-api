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
  Matches,
} from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

@Entity('ip_allowlist_entries')
@Index(['workspaceId'])
@Index(['workspaceId', 'isActive'])
export class IpAllowlistEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  /**
   * Single IP address (e.g., '203.0.113.50') or CIDR notation (e.g., '10.0.0.0/8').
   * Validated by the service layer for format correctness.
   */
  @Column({ type: 'varchar', length: 45, name: 'ip_address' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(45) // Covers IPv6 + CIDR suffix
  ipAddress!: string;

  @Column({ type: 'varchar', length: 200 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  description!: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'uuid', name: 'created_by' })
  @IsUUID()
  createdBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
