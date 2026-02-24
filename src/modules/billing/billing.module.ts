/**
 * BillingModule
 *
 * Story 18-9: Agent Revenue Sharing
 * Story 19-10: Template Revenue Sharing
 *
 * NestJS module for Stripe Connect integration, agent purchases,
 * template purchases, creator earnings, and payouts.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeConnectService } from './services/stripe-connect.service';
import { AgentPurchaseService } from './services/agent-purchase.service';
import { CreatorEarningsService } from './services/creator-earnings.service';
import { PayoutService } from './services/payout.service';
// Story 19-10: Template Revenue Sharing
import { TemplatePurchaseService } from './services/template-purchase.service';
import { TemplateCreatorEarningsService } from './services/template-creator-earnings.service';
import { TemplateBillingController } from './controllers/template-billing.controller';
import { CreatorPayoutAccount } from '../../database/entities/creator-payout-account.entity';
import { AgentPurchase } from '../../database/entities/agent-purchase.entity';
import { PayoutTransaction } from '../../database/entities/payout-transaction.entity';
import { MarketplaceAgent } from '../../database/entities/marketplace-agent.entity';
import { InstalledAgent } from '../../database/entities/installed-agent.entity';
// Story 19-10: Template entities
import { Template } from '../../database/entities/template.entity';
import { TemplatePurchase } from '../../database/entities/template-purchase.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreatorPayoutAccount,
      AgentPurchase,
      PayoutTransaction,
      MarketplaceAgent,
      InstalledAgent,
      // Story 19-10: Template entities
      Template,
      TemplatePurchase,
    ]),
  ],
  controllers: [
    BillingController,
    // Story 19-10: Template billing controller
    TemplateBillingController,
  ],
  providers: [
    BillingService,
    StripeConnectService,
    AgentPurchaseService,
    CreatorEarningsService,
    PayoutService,
    // Story 19-10: Template billing services
    TemplatePurchaseService,
    TemplateCreatorEarningsService,
  ],
  exports: [
    BillingService,
    StripeConnectService,
    AgentPurchaseService,
    CreatorEarningsService,
    PayoutService,
    // Story 19-10: Template billing exports
    TemplatePurchaseService,
    TemplateCreatorEarningsService,
  ],
})
export class BillingModule {}
