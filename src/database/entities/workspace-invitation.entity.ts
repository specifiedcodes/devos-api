import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsUUID, IsEmail, IsEnum } from 'class-validator';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';
import { WorkspaceRole } from './workspace-member.entity';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Entity('workspace_invitations')
@Index(['workspaceId'])
@Index(['email'])
@Index(['token'], { unique: true })
@Index(['workspaceId', 'email', 'status'])
export class WorkspaceInvitation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @ManyToOne(() => Workspace)
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ type: 'varchar', length: 255 })
  @IsEmail()
  email!: string;

  @Column({
    type: 'enum',
    enum: WorkspaceRole,
    default: WorkspaceRole.DEVELOPER,
  })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;

  @Column({ type: 'uuid', name: 'inviter_user_id' })
  @IsUUID()
  inviterUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'inviter_user_id' })
  inviter?: User;

  @Column({ type: 'varchar', length: 255, unique: true })
  token!: string; // SHA-256 hash of actual token

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt!: Date;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
  })
  @IsEnum(InvitationStatus)
  status!: InvitationStatus;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
