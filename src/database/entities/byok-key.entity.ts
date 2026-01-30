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
import { IsUUID, IsNotEmpty, IsEnum, IsBoolean } from 'class-validator';
import { User } from './user.entity';

export enum KeyProvider {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
}

@Entity('byok_secrets')
@Index(['workspaceId', 'isActive'])
export class BYOKKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @Column({ type: 'varchar', length: 100, name: 'key_name' })
  @IsNotEmpty()
  keyName!: string;

  @Column({
    type: 'enum',
    enum: KeyProvider,
  })
  @IsEnum(KeyProvider)
  provider!: KeyProvider;

  @Column({ type: 'text', name: 'encrypted_key' })
  @IsNotEmpty()
  encryptedKey!: string;

  @Column({ type: 'text', name: 'encryption_iv' })
  @IsNotEmpty()
  encryptionIV!: string;

  @Column({ type: 'varchar', length: 20, name: 'key_prefix', nullable: true })
  keyPrefix?: string;

  @Column({ type: 'varchar', length: 4, name: 'key_suffix', nullable: true })
  keySuffix?: string;

  @Column({ type: 'uuid', name: 'created_by_user_id' })
  @IsUUID()
  createdByUserId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy?: User;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'last_used_at' })
  lastUsedAt?: Date;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  @IsBoolean()
  isActive!: boolean;
}
