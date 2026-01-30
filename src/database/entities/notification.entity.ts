import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsUUID, IsOptional, IsJSON, IsString } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

@Entity('notifications')
@Index(['workspaceId', 'userId'])
@Index(['workspaceId', 'userId', 'readAt'])
@Index(['createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 50 })
  @IsString()
  type!: string; // 'spending_alert', 'task_complete', etc.

  @Column({ type: 'varchar', length: 255 })
  @IsString()
  title!: string;

  @Column({ type: 'text' })
  @IsString()
  message!: string;

  @Column({ type: 'jsonb', default: {} })
  @IsJSON()
  @IsOptional()
  metadata?: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true, name: 'read_at' })
  @IsOptional()
  readAt?: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
