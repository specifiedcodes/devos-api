import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { IsEmail, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';
import { WorkspaceMember } from './workspace-member.entity';
import { BackupCode } from './backup-code.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  @IsNotEmpty()
  passwordHash!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'two_factor_secret' })
  @IsOptional()
  twoFactorSecret!: string | null;

  @Column({ type: 'boolean', default: false, name: 'two_factor_enabled' })
  @IsBoolean()
  twoFactorEnabled!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'last_login_at' })
  @IsOptional()
  lastLoginAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  @Index()
  @IsOptional()
  deletedAt!: Date | null;

  @OneToMany(() => WorkspaceMember, (member) => member.user)
  workspaceMembers!: WorkspaceMember[];

  @OneToMany(() => BackupCode, (backupCode) => backupCode.user)
  backupCodes!: BackupCode[];
}
