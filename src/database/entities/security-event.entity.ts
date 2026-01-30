import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum SecurityEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  TWO_FACTOR_ENABLED = '2fa_enabled',
  TWO_FACTOR_DISABLED = '2fa_disabled',
  TWO_FACTOR_VERIFIED = '2fa_verified',
  TWO_FACTOR_FAILED = '2fa_failed',
  PASSWORD_CHANGED = 'password_changed',
  PASSWORD_CHANGE_FAILED = 'password_change_failed',
  ACCOUNT_DELETED = 'account_deleted',
  ACCOUNT_DELETION_FAILED = 'account_deletion_failed',
  RATE_LIMIT_HIT = 'rate_limit_hit',
  TOKEN_REVOKED = 'token_revoked',
  SESSION_CREATED = 'session_created',
  SESSION_DELETED = 'session_deleted',
  ANOMALY_DETECTED = 'anomaly_detected',
  WORKSPACE_CREATED = 'workspace_created',
  WORKSPACE_CREATION_FAILED = 'workspace_creation_failed',
  WORKSPACE_DELETED = 'workspace_deleted',
  WORKSPACE_SWITCHED = 'workspace_switched',
}

@Entity('security_events')
@Index(['user_id', 'event_type'])
@Index(['created_at'])
@Index(['ip_address'])
export class SecurityEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  user_id?: string;

  @Column({ type: 'varchar', nullable: true })
  email?: string; // For failed login attempts where user doesn't exist

  @Column({ type: 'enum', enum: SecurityEventType })
  event_type!: SecurityEventType;

  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;

  @Column({ type: 'text', nullable: true })
  user_agent?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // Additional event-specific data

  @Column({ type: 'varchar', nullable: true })
  reason?: string; // For failures: invalid_password, account_locked, etc.

  @CreateDateColumn()
  created_at!: Date;
}
