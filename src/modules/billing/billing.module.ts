/**
 * BillingModule
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * NestJS module for Stripe Connect integration, agent purchases,
 * creator earnings, and payouts.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeConnectService } from './services/stripe-connect.service';
import { AgentPurchaseService } from './services/agent-purchase.service';
import { CreatorEarningsService } from './services/creator-earnings.service';
import { PayoutService } from './services/payout.service';
import { CreatorPayoutAccount } from '../../database/entities/creator-payout-account.entity';
import { AgentPurchase } from '../../database/entities/agent-purchase.entity';
import { PayoutTransaction } from '../../database/entities/payout-transaction.entity';
import { MarketplaceAgent } from '../../database/entities/marketplace-agent.entity';
import { InstalledAgent } from '../../database/entities/installed-agent.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreatorPayoutAccount,
      AgentPurchase,
      PayoutTransaction,
      MarketplaceAgent,
      InstalledAgent,
    ]),
  ],
  controllers: [BillingController],
  providers: [
    BillingService,
    StripeConnectService,
    AgentPurchaseService,
    CreatorEarningsService,
    PayoutService,
  ],
  exports: [
    BillingService,
    StripeConnectService,
    AgentPurchaseService,
    CreatorEarningsService,
    PayoutService,
  ],
})
export class BillingModule {}
