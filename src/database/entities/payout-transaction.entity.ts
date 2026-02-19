/**
 * PayoutTransaction Entity
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * Tracks payouts from DevOS platform to creators via Stripe Connect.
 * Stores payout status, amounts, and processing information.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsUUID, IsInt, IsEnum, IsString, IsOptional, Min } from 'class-validator';
import { CreatorPayoutAccount } from './creator-payout-account.entity';

export enum PayoutStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('payout_transactions')
@Index(['payoutAccountId'])
@Index(['status'])
@Index(['stripePayoutId'])
export class PayoutTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'payout_account_id' })
  @IsUUID()
  payoutAccountId!: string;

  @ManyToOne(() => CreatorPayoutAccount, (account) => account.transactions)
  @JoinColumn({ name: 'payout_account_id' })
  payoutAccount?: CreatorPayoutAccount;

  @Column({ type: 'varchar', length: 255, name: 'stripe_payout_id', nullable: true })
  @IsOptional()
  @IsString()
  stripePayoutId!: string | null;

  @Column({ type: 'int', name: 'amount_cents' })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  @IsString()
  currency!: string;

  @Column({ type: 'varchar', length: 20 })
  @IsEnum(PayoutStatus)
  status!: PayoutStatus;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  description!: string | null;

  @Column({ type: 'text', name: 'failure_reason', nullable: true })
  @IsOptional()
  @IsString()
  failureReason!: string | null;

  @Column({ type: 'timestamp with time zone', name: 'processed_at', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
