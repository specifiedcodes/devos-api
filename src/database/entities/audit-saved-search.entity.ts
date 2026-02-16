import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * AuditSavedSearch Entity
 * Story 14.10: Audit Log Viewer (AC2)
 *
 * Stores saved audit log search configurations for admins.
 * Searches can be personal or shared with all admins.
 */
@Entity('audit_saved_searches')
@Index(['createdBy'])
@Index(['isShared'])
export class AuditSavedSearch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 50, name: 'created_by' })
  createdBy!: string;

  @Column({ type: 'jsonb' })
  filters!: Record<string, any>;

  @Column({ type: 'boolean', default: false, name: 'is_shared' })
  isShared!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
