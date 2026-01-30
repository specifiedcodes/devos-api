import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { IsUUID, IsOptional, IsJSON } from 'class-validator';
import { Workspace } from './workspace.entity';

@Entity('workspace_settings')
export class WorkspaceSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true, name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @OneToOne(() => Workspace)
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'workspace_type' })
  @IsOptional()
  workspaceType?: string; // 'client', 'internal'

  @Column({ type: 'jsonb', nullable: true })
  @IsJSON()
  @IsOptional()
  tags?: string[];

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'default_deployment_platform' })
  @IsOptional()
  defaultDeploymentPlatform?: string; // 'railway', 'vercel'

  @Column({ type: 'jsonb', nullable: true, name: 'project_preferences' })
  @IsJSON()
  @IsOptional()
  projectPreferences?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true, name: 'notification_preferences' })
  @IsJSON()
  @IsOptional()
  notificationPreferences?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  @IsJSON()
  @IsOptional()
  branding?: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
