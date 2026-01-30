import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('account_deletions')
export class AccountDeletion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  user_id!: string;

  @Column({ type: 'varchar', length: 255, name: 'original_email' })
  @Index()
  original_email!: string;

  @CreateDateColumn({ name: 'deleted_at' })
  deleted_at!: Date;

  @Column({ type: 'timestamp', name: 'hard_delete_scheduled_at' })
  hard_delete_scheduled_at!: Date;

  @Column({ type: 'boolean', default: false })
  completed!: boolean;

  @Column({ type: 'text', nullable: true, name: 'deletion_reason' })
  deletion_reason?: string;
}
