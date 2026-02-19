/**
 * InstalledAgent Entity
 *
 * Story 18-5: Agent Marketplace Backend
 *
 * Tracks marketplace agents installed to workspaces.
 * Installation creates a copy of the agent definition in the target workspace.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { IsUUID, IsNotEmpty, IsOptional, IsBoolean, IsString, MaxLength } from 'class-validator';
import { MarketplaceAgent } from './marketplace-agent.entity';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

@Entity('installed_agents')
@Unique(['workspaceId', 'marketplaceAgentId'])
@Index(['workspaceId'])
@Index(['marketplaceAgentId'])
@Index(['installedBy'])
export class InstalledAgent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'uuid', name: 'marketplace_agent_id' })
  @IsUUID()
  marketplaceAgentId!: string;

  @ManyToOne(() => MarketplaceAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplace_agent_id' })
  marketplaceAgent?: MarketplaceAgent;

  @Column({ type: 'uuid', name: 'installed_by' })
  @IsUUID()
  installedBy!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'installed_by' })
  installer?: User | null;

  @Column({ type: 'varchar', length: 50, name: 'installed_version' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  installedVersion!: string;

  @Column({ type: 'boolean', name: 'auto_update', default: false })
  @IsBoolean()
  autoUpdate!: boolean;

  @Column({ type: 'uuid', name: 'local_definition_id', nullable: true })
  @IsOptional()
  @IsUUID()
  localDefinitionId!: string | null; // Reference to copied AgentDefinition in workspace

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'installed_at' })
  installedAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
