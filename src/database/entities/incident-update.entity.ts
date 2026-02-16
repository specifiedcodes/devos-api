import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Incident } from './incident.entity';

/**
 * IncidentUpdate Entity
 * Story 14.9: Incident Management (AC2)
 *
 * Timeline entry for an incident. Each status change or update
 * creates a new IncidentUpdate record.
 */
@Entity('incident_updates')
export class IncidentUpdate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  incidentId!: string;

  @ManyToOne(() => Incident, (incident) => incident.updates)
  @JoinColumn({ name: 'incidentId' })
  incident!: Incident;

  @Column({ type: 'text' })
  message!: string;

  @Column({
    type: 'enum',
    enum: ['investigating', 'identified', 'monitoring', 'resolved'],
  })
  status!: 'investigating' | 'identified' | 'monitoring' | 'resolved';

  @Column({ type: 'varchar', length: 50 })
  author!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
