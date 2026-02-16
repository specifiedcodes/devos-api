import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { IncidentUpdate } from './incident-update.entity';

/**
 * Incident Entity
 * Story 14.9: Incident Management (AC1)
 *
 * Represents a platform incident with lifecycle tracking.
 * Incidents go through: investigating -> identified -> monitoring -> resolved
 */
@Entity('incidents')
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({
    type: 'enum',
    enum: ['critical', 'major', 'minor'],
    default: 'minor',
  })
  severity!: 'critical' | 'major' | 'minor';

  @Column({
    type: 'enum',
    enum: ['investigating', 'identified', 'monitoring', 'resolved'],
    default: 'investigating',
  })
  status!: 'investigating' | 'identified' | 'monitoring' | 'resolved';

  @Column({ type: 'simple-array', default: '' })
  affectedServices!: string[];

  @Column({ type: 'uuid', nullable: true })
  alertHistoryId!: string | null;

  @Column({ type: 'varchar', length: 50 })
  createdBy!: string;

  @Column({ type: 'text', nullable: true })
  postMortemUrl!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => IncidentUpdate, (update) => update.incident, { cascade: true })
  updates?: IncidentUpdate[];
}
