import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { IsNotEmpty, IsUUID, IsOptional } from 'class-validator';
import { User } from './user.entity';
import { WorkspaceMember } from './workspace-member.entity';

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  @IsNotEmpty()
  name!: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  description?: string;

  @Column({ type: 'uuid', name: 'owner_user_id' })
  @IsUUID()
  ownerUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_user_id' })
  owner?: User;

  @Column({ type: 'varchar', length: 255, unique: true, name: 'schema_name' })
  @IsNotEmpty()
  schemaName!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt?: Date;

  @OneToMany(() => WorkspaceMember, (member) => member.workspace)
  members!: WorkspaceMember[];
}
