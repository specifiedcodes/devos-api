/**
 * AgentSubscription Entity
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * Future subscription support for marketplace agents.
 * Currently supports one-time purchases; this entity is created for future expansion.
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
} from 'typeorm';
import { IsUUID, IsNotEmpty, IsEnum, IsString, IsBoolean, IsInt, Min } from 'class-validator';
import { User } from './user.entity';
import { MarketplaceAgent } from './marketplace-agent.entity';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  TRIALING = 'trialing',
  UNPAID = 'unpaid',
  PAUSED = 'paused',
}

@Entity('agent_subscriptions')
@Index(['userId'])
@Index(['marketplaceAgentId'])
@Index(['status'])
@Index(['stripeSubscriptionId'])
export class AgentSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  @IsUUID()
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'uuid', name: 'marketplace_agent_id' })
  @IsUUID()
  marketplaceAgentId!: string;

  @ManyToOne(() => MarketplaceAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplace_agent_id' })
  marketplaceAgent?: MarketplaceAgent;

  @Column({ type: 'varchar', length: 255, name: 'stripe_subscription_id' })
  @IsNotEmpty()
  @IsString()
  stripeSubscriptionId!: string;

  @Column({ type: 'varchar', length: 255, name: 'stripe_price_id' })
  @IsNotEmpty()
  @IsString()
  stripePriceId!: string;

  @Column({ type: 'varchar', length: 20 })
  @IsEnum(SubscriptionStatus)
  status!: SubscriptionStatus;

  @Column({ type: 'int', name: 'current_period_start' })
  @IsInt()
  @Min(0)
  currentPeriodStart!: number;

  @Column({ type: 'int', name: 'current_period_end' })
  @IsInt()
  @Min(0)
  currentPeriodEnd!: number;

  @Column({ type: 'boolean', name: 'cancel_at_period_end', default: false })
  @IsBoolean()
  cancelAtPeriodEnd!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
