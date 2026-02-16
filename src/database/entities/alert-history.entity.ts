import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AlertRule } from './alert-rule.entity';

/**
 * AlertHistory Entity
 * Story 14.8: Alert Rules & Notifications (AC2)
 *
 * Records alert firing events, acknowledgments, and resolutions.
 */
@Entity('alert_history')
export class AlertHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  alertRuleId!: string;

  @ManyToOne(() => AlertRule)
  @JoinColumn({ name: 'alertRuleId' })
  alertRule!: AlertRule;

  @Column({ type: 'varchar', length: 255 })
  alertName!: string;

  @Column({
    type: 'enum',
    enum: ['critical', 'warning', 'info'],
  })
  severity!: 'critical' | 'warning' | 'info';

  @Column({
    type: 'enum',
    enum: ['fired', 'acknowledged', 'silenced', 'resolved', 'auto_resolved'],
    default: 'fired',
  })
  status!: 'fired' | 'acknowledged' | 'silenced' | 'resolved' | 'auto_resolved';

  @Column({ type: 'text' })
  message!: string; // Human-readable alert message

  @Column({ type: 'jsonb', nullable: true })
  context!: Record<string, any>; // Snapshot of values when alert fired

  @Column({ type: 'simple-array', nullable: true })
  notifiedChannels!: string[]; // Channels where notification was sent

  @Column({ type: 'varchar', length: 50, nullable: true })
  acknowledgedBy!: string; // Admin userId who acknowledged

  @Column({ type: 'timestamp', nullable: true })
  acknowledgedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt!: Date;

  @Column({ type: 'text', nullable: true })
  resolutionNote!: string;

  @CreateDateColumn()
  firedAt!: Date;
}
