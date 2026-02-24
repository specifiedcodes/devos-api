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
  IsInt,
  IsArray,
  MaxLength,
  Min,
} from 'class-validator';
import { Workspace } from './workspace.entity';

@Entity('permission_webhooks')
@Index(['workspaceId'])
@Index(['workspaceId', 'isActive'])
export class PermissionWebhook {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 500 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  url!: string;

  @Column({ type: 'varchar', length: 255, name: 'secret_hash' })
  @IsNotEmpty()
  @IsString()
  secretHash!: string;

  @Column({ type: 'simple-array', name: 'event_types', default: '' })
  @IsArray()
  eventTypes!: string[];

  @Column({ type: 'boolean', name: 'is_active', default: true })
  @IsBoolean()
  isActive!: boolean;

  @Column({ type: 'int', name: 'failure_count', default: 0 })
  @IsInt()
  @Min(0)
  failureCount!: number;

  @Column({ type: 'timestamp with time zone', name: 'last_triggered_at', nullable: true })
  @IsOptional()
  lastTriggeredAt!: Date | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  @IsOptional()
  @IsUUID()
  createdBy!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
