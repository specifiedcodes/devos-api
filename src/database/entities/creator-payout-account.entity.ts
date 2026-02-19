/**
 * CreatorPayoutAccount Entity
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * Stores Stripe Connect account information for creators who want to
 * monetize their marketplace agents and receive payouts.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { IsUUID, IsNotEmpty, IsBoolean, IsString, IsOptional, IsInt, Min } from 'class-validator';
import { User } from './user.entity';
import { PayoutTransaction } from './payout-transaction.entity';

@Entity('creator_payout_accounts')
@Index(['userId'], { unique: true })
@Index(['stripeAccountId'])
export class CreatorPayoutAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  @IsUUID()
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 255, name: 'stripe_account_id' })
  @IsNotEmpty()
  @IsString()
  stripeAccountId!: string;

  @Column({ type: 'boolean', name: 'onboarding_complete', default: false })
  @IsBoolean()
  onboardingComplete!: boolean;

  @Column({ type: 'boolean', name: 'charges_enabled', default: false })
  @IsBoolean()
  chargesEnabled!: boolean;

  @Column({ type: 'boolean', name: 'payouts_enabled', default: false })
  @IsBoolean()
  payoutsEnabled!: boolean;

  @Column({ type: 'varchar', length: 2, nullable: true })
  @IsOptional()
  @IsString()
  country: string | null = null;

  @Column({ type: 'varchar', length: 3, name: 'default_currency', default: 'USD' })
  @IsString()
  defaultCurrency!: string;

  @Column({ type: 'timestamp with time zone', name: 'onboarding_completed_at', nullable: true })
  onboardingCompletedAt!: Date | null;

  @OneToMany(() => PayoutTransaction, (tx) => tx.payoutAccount)
  transactions?: PayoutTransaction[];

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
