import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { IsUUID, IsNotEmpty } from 'class-validator';

@Entity('audit_logs')
@Index(['workspaceId', 'createdAt'])
@Index(['resourceType', 'resourceId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  @IsUUID()
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  @IsNotEmpty()
  action!: string;

  @Column({ type: 'varchar', length: 50, name: 'resource_type' })
  @IsNotEmpty()
  resourceType!: string;

  @Column({ type: 'varchar', length: 255, name: 'resource_id' })
  @IsNotEmpty()
  resourceId!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'varchar', length: 45, nullable: true, name: 'ip_address' })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true, name: 'user_agent' })
  userAgent?: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
