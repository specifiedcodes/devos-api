import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';
import { AgentDefinition } from './agent-definition.entity';

export enum AgentDefinitionAuditEventType {
  AGENT_DEF_CREATED = 'agent_def_created',
  AGENT_DEF_UPDATED = 'agent_def_updated',
  AGENT_DEF_DELETED = 'agent_def_deleted',
  AGENT_DEF_ACTIVATED = 'agent_def_activated',
  AGENT_DEF_DEACTIVATED = 'agent_def_deactivated',
  AGENT_DEF_PUBLISHED = 'agent_def_published',
  AGENT_DEF_UNPUBLISHED = 'agent_def_unpublished',
  AGENT_DEF_VALIDATION_FAILED = 'agent_def_validation_failed',
  // Version management events (Story 18-4)
  AGENT_VERSION_CREATED = 'agent_version_created',
  AGENT_VERSION_PUBLISHED = 'agent_version_published',
  AGENT_VERSION_ROLLBACK = 'agent_version_rollback',
}

@Entity('agent_definition_audit_events')
@Index(['workspaceId'])
@Index(['agentDefinitionId'])
@Index(['eventType'])
@Index(['actorId'])
@Index(['createdAt'])
export class AgentDefinitionAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'uuid', name: 'agent_definition_id', nullable: true })
  @IsOptional()
  @IsUUID()
  agentDefinitionId!: string | null;

  @ManyToOne(() => AgentDefinition, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agent_definition_id' })
  agentDefinition?: AgentDefinition;

  @Column({ type: 'varchar', length: 60, name: 'event_type' })
  @IsNotEmpty()
  eventType!: AgentDefinitionAuditEventType;

  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  @IsOptional()
  @IsUUID()
  actorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: User;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
