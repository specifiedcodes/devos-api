import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../../database/entities/user.entity';
import { Workspace } from '../../../database/entities/workspace.entity';

@Entity('analytics_events')
@Index(['userId', 'eventType', 'timestamp'])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  @Index()
  workspaceId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  @Index()
  eventType!: string;

  @Column({ name: 'event_data', type: 'jsonb', default: {} })
  eventData!: Record<string, any>;

  @Column({ name: 'timestamp', type: 'timestamptz', default: () => 'NOW()' })
  @Index()
  timestamp!: Date;

  @Column({ name: 'session_id', type: 'varchar', length: 255, nullable: true })
  sessionId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;
}
