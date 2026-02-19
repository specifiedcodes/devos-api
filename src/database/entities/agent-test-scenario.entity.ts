/**
 * Agent Test Scenario Entity
 *
 * Story 18-3: Agent Sandbox Testing
 *
 * Represents pre-built or custom test scenarios for validating agent behavior.
 * Can be workspace-specific or reusable across agents.
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AgentDefinition, AgentDefinitionCategory } from './agent-definition.entity';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

@Entity('agent_test_scenarios')
@Index(['workspaceId'])
@Index(['agentDefinitionId'])
@Index(['category'])
@Index(['isBuiltIn'])
export class AgentTestScenario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'uuid', name: 'agent_definition_id', nullable: true })
  agentDefinitionId?: string | null;

  @ManyToOne(() => AgentDefinition, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agent_definition_id' })
  agentDefinition?: AgentDefinition | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    type: 'enum',
    enum: AgentDefinitionCategory,
    nullable: true,
  })
  category?: AgentDefinitionCategory | null;

  @Column({ type: 'boolean', name: 'is_built_in', default: false })
  isBuiltIn!: boolean;

  @Column({ type: 'jsonb', name: 'sample_input' })
  sampleInput!: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'expected_behavior', nullable: true })
  expectedBehavior?: Record<string, unknown> | null;

  @Column({ type: 'text', name: 'setup_script', nullable: true })
  setupScript?: string | null;

  @Column({ type: 'text', name: 'validation_script', nullable: true })
  validationScript?: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
