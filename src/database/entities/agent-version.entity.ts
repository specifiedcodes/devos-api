/**
 * AgentVersion Entity
 *
 * Story 18-4: Agent Versioning
 *
 * Stores versioned snapshots of agent definitions.
 * Supports semantic versioning with pre-release tags.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsBoolean, IsUUID, Matches, MaxLength } from 'class-validator';
import { AgentDefinition } from './agent-definition.entity';
import { User } from './user.entity';

@Entity('agent_versions')
@Index(['agentDefinitionId', 'version'], { unique: true })
@Index(['agentDefinitionId'])
@Index(['createdBy'])
@Index(['isPublished'])
export class AgentVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'agent_definition_id' })
  @IsUUID()
  agentDefinitionId!: string;

  @ManyToOne(() => AgentDefinition, (def) => def.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_definition_id' })
  agentDefinition?: AgentDefinition;

  @Column({ type: 'varchar', length: 50 })
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, {
    message: 'version must follow semver format (e.g., 1.0.0, 1.0.0-beta.1)',
  })
  version!: string;

  @Column({ type: 'jsonb', name: 'definition_snapshot' })
  @IsNotEmpty()
  definitionSnapshot!: Record<string, unknown>; // Complete agent spec at this version

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @MaxLength(5000)
  changelog!: string | null;

  @Column({ type: 'boolean', name: 'is_published', default: false })
  @IsBoolean()
  isPublished!: boolean;

  @Column({ type: 'timestamp with time zone', name: 'published_at', nullable: true })
  publishedAt!: Date | null;

  @Column({ type: 'uuid', name: 'created_by' })
  @IsUUID()
  createdBy!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
