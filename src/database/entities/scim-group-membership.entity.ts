import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { IsUUID } from 'class-validator';
import { ScimGroup } from './scim-group.entity';
import { User } from './user.entity';

@Entity('scim_group_memberships')
@Index(['groupId', 'userId'], { unique: true })
@Index(['userId'])
export class ScimGroupMembership {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'group_id' })
  @IsUUID()
  groupId!: string;

  @ManyToOne(() => ScimGroup, (g) => g.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group?: ScimGroup;

  @Column({ type: 'uuid', name: 'user_id' })
  @IsUUID()
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
