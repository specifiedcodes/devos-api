/**
 * TemplatePurchase Entity
 *
 * Story 19-10: Template Revenue Sharing
 *
 * Tracks template purchases with Stripe Connect payment processing.
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
import { Template } from './template.entity';

export enum TemplatePurchaseStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  REFUNDED = 'refunded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('template_purchases')
@Index(['buyerUserId'])
@Index(['templateId'])
@Index(['stripePaymentIntentId'])
@Index(['status'])
@Index(['sellerUserId'])
export class TemplatePurchase {
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

  @Column({ type: 'uuid', name: 'template_id' })
  @IsUUID()
  templateId!: string;

  @ManyToOne(() => Template, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template?: Template;

  @Column({ type: 'uuid', name: 'seller_user_id' })
  @IsUUID()
  sellerUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_user_id' })
  sellerUser?: User;

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
  @IsEnum(TemplatePurchaseStatus)
  status!: TemplatePurchaseStatus;

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
