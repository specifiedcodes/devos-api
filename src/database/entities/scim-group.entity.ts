import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, Index, OneToMany,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Workspace } from './workspace.entity';
import { ScimGroupMembership } from './scim-group-membership.entity';

@Entity('scim_groups')
@Index(['workspaceId', 'externalId'], { unique: true })
@Index(['workspaceId'])
export class ScimGroup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 255, name: 'external_id' })
  @IsNotEmpty()
  externalId!: string;

  @Column({ type: 'varchar', length: 255, name: 'display_name' })
  @IsNotEmpty()
  displayName!: string;

  @Column({ type: 'varchar', length: 20, name: 'mapped_role', nullable: true })
  @IsOptional()
  mappedRole!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @OneToMany(() => ScimGroupMembership, (m) => m.group, { cascade: true })
  memberships?: ScimGroupMembership[];

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
