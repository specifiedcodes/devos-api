/**
 * AgentPurchase Entity
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * Tracks agent purchases with Stripe Connect payment processing.
 * Stores payment details, revenue split, and purchase status.
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
import { IsUUID, IsNotEmpty, IsInt, IsEnum, IsString, IsOptional, Min } from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';
import { MarketplaceAgent } from './marketplace-agent.entity';
import { InstalledAgent } from './installed-agent.entity';

export enum PurchaseStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  REFUNDED = 'refunded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum PurchaseType {
  ONE_TIME = 'one_time',
  SUBSCRIPTION = 'subscription',
}

@Entity('agent_purchases')
@Index(['buyerUserId'])
@Index(['marketplaceAgentId'])
@Index(['stripePaymentIntentId'])
@Index(['status'])
export class AgentPurchase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'buyer_user_id' })
  @IsUUID()
  buyerUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'buyer_user_id' })
  buyerUser?: User;

  @Column({ type: 'uuid', name: 'buyer_workspace_id' })
  @IsUUID()
  buyerWorkspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'buyer_workspace_id' })
  buyerWorkspace?: Workspace;

  @Column({ type: 'uuid', name: 'marketplace_agent_id' })
  @IsUUID()
  marketplaceAgentId!: string;

  @ManyToOne(() => MarketplaceAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplace_agent_id' })
  marketplaceAgent?: MarketplaceAgent;

  @Column({ type: 'uuid', name: 'installed_agent_id', nullable: true })
  @IsUUID()
  @IsOptional()
  installedAgentId!: string | null;

  @ManyToOne(() => InstalledAgent, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'installed_agent_id' })
  installedAgent?: InstalledAgent | null;

  @Column({ type: 'varchar', length: 20 })
  @IsEnum(PurchaseType)
  purchaseType!: PurchaseType;

  @Column({ type: 'varchar', length: 255, name: 'stripe_payment_intent_id' })
  @IsNotEmpty()
  @IsString()
  stripePaymentIntentId!: string;

  @Column({ type: 'varchar', length: 255, name: 'stripe_transfer_id', nullable: true })
  @IsOptional()
  @IsString()
  stripeTransferId!: string | null;

  @Column({ type: 'int', name: 'amount_cents' })
  @IsInt()
  @Min(0)
  amountCents!: number;

  @Column({ type: 'int', name: 'platform_fee_cents' })
  @IsInt()
  @Min(0)
  platformFeeCents!: number;

  @Column({ type: 'int', name: 'creator_amount_cents' })
  @IsInt()
  @Min(0)
  creatorAmountCents!: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  @IsString()
  currency!: string;

  @Column({ type: 'varchar', length: 20 })
  @IsEnum(PurchaseStatus)
  status!: PurchaseStatus;

  @Column({ type: 'timestamp with time zone', name: 'refunded_at', nullable: true })
  refundedAt!: Date | null;

  @Column({ type: 'text', name: 'refund_reason', nullable: true })
  @IsOptional()
  @IsString()
  refundReason!: string | null;

  @Column({ type: 'uuid', name: 'refunded_by', nullable: true })
  @IsUUID()
  @IsOptional()
  refundedBy!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
