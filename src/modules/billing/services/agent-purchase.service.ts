/**
 * AgentPurchaseService
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * Handles agent purchases with Stripe Connect payment processing.
 * Implements 80/20 revenue split between creators and platform.
 */
import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import Stripe from 'stripe';
import { MarketplaceAgent, MarketplacePricingType, MarketplaceAgentStatus } from '../../../database/entities/marketplace-agent.entity';
import { InstalledAgent } from '../../../database/entities/installed-agent.entity';
import { AgentPurchase, PurchaseStatus, PurchaseType } from '../../../database/entities/agent-purchase.entity';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';
import { StripeConnectService } from './stripe-connect.service';

export interface PurchaseResult {
  purchaseId: string;
  paymentIntentId: string;
  amountCents: number;
  platformFeeCents: number;
  creatorAmountCents: number;
  status: 'succeeded' | 'pending' | 'failed';
}

export interface PricingCalculation {
  priceCents: number;
  platformFeeCents: number; // 20% of price
  creatorAmountCents: number; // 80% of price
  currency: string;
}

@Injectable()
export class AgentPurchaseService {
  private readonly logger = new Logger(AgentPurchaseService.name);

  // Revenue split: 80% to creator, 20% to DevOS platform
  private readonly PLATFORM_FEE_PERCENT = 0.20;
  private readonly CREATOR_PERCENT = 0.80;

  // Refund window in days
  private readonly REFUND_WINDOW_DAYS = 14;

  constructor(
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentRepo: Repository<MarketplaceAgent>,
    @InjectRepository(InstalledAgent)
    private readonly installedAgentRepo: Repository<InstalledAgent>,
    @InjectRepository(AgentPurchase)
    private readonly purchaseRepo: Repository<AgentPurchase>,
    @InjectRepository(CreatorPayoutAccount)
    private readonly payoutAccountRepo: Repository<CreatorPayoutAccount>,
    private readonly stripeConnectService: StripeConnectService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Calculate pricing breakdown for an agent purchase.
   */
  calculatePricing(priceCents: number): PricingCalculation {
    const platformFeeCents = Math.round(priceCents * this.PLATFORM_FEE_PERCENT);
    const creatorAmountCents = priceCents - platformFeeCents;

    return {
      priceCents,
      platformFeeCents,
      creatorAmountCents,
      currency: 'USD',
    };
  }

  /**
   * Create a payment intent for purchasing an agent.
   * Uses Stripe Connect to split payment between platform and creator.
   */
  async createPaymentIntent(
    marketplaceAgentId: string,
    buyerUserId: string,
    buyerWorkspaceId: string,
  ): Promise<{ paymentIntentId: string; clientSecret: string; amount: number; currency: string; platformFeeCents: number; creatorAmountCents: number }> {
    // Find the agent
    const agent = await this.marketplaceAgentRepo.findOne({
      where: { id: marketplaceAgentId },
      relations: ['publisher'],
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    // Check if agent is published
    if (agent.status !== MarketplaceAgentStatus.PUBLISHED) {
      throw new BadRequestException('Agent is not available for purchase');
    }

    // Check if agent is paid
    if (agent.pricingType === MarketplacePricingType.FREE) {
      throw new BadRequestException('This agent is free and does not require payment');
    }

    if (!agent.priceCents || agent.priceCents <= 0) {
      throw new BadRequestException('Agent price is not configured');
    }

    // Check if user already purchased
    const existingPurchase = await this.purchaseRepo.findOne({
      where: {
        buyerUserId,
        marketplaceAgentId,
        status: PurchaseStatus.COMPLETED,
      },
    });

    if (existingPurchase) {
      throw new BadRequestException('You have already purchased this agent');
    }

    // Calculate pricing
    const pricing = this.calculatePricing(agent.priceCents);

    // Get creator's Stripe Connect account for transfer
    const creatorPayoutAccount = await this.payoutAccountRepo.findOne({
      where: { userId: agent.publisherUserId },
    });

    // Create pending purchase record
    const pendingPurchase = this.purchaseRepo.create({
      buyerUserId,
      buyerWorkspaceId,
      marketplaceAgentId,
      purchaseType: PurchaseType.ONE_TIME,
      stripePaymentIntentId: 'pending',
      amountCents: pricing.priceCents,
      platformFeeCents: pricing.platformFeeCents,
      creatorAmountCents: pricing.creatorAmountCents,
      currency: pricing.currency,
      status: PurchaseStatus.PENDING,
    });

    const savedPurchase = await this.purchaseRepo.save(pendingPurchase);

    try {
      const stripe = this.stripeConnectService.getStripeClient();

      // Build payment intent params
      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: pricing.priceCents,
        currency: pricing.currency.toLowerCase(),
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          purchase_id: savedPurchase.id,
          marketplace_agent_id: marketplaceAgentId,
          buyer_user_id: buyerUserId,
          buyer_workspace_id: buyerWorkspaceId,
          creator_user_id: agent.publisherUserId,
        },
      };

      // Add transfer data if creator has Stripe Connect account
      if (creatorPayoutAccount?.payoutsEnabled) {
        paymentIntentParams.application_fee_amount = pricing.platformFeeCents;
        paymentIntentParams.transfer_data = {
          destination: creatorPayoutAccount.stripeAccountId,
        };
      }

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

      // Update purchase with payment intent ID
      await this.purchaseRepo.update(
        { id: savedPurchase.id },
        { stripePaymentIntentId: paymentIntent.id },
      );

      this.logger.log(`Created payment intent ${paymentIntent.id} for agent ${marketplaceAgentId}`);

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret!,
        amount: pricing.priceCents,
        currency: pricing.currency,
        platformFeeCents: pricing.platformFeeCents,
        creatorAmountCents: pricing.creatorAmountCents,
      };
    } catch (error) {
      // Mark purchase as failed
      await this.purchaseRepo.update(
        { id: savedPurchase.id },
        { status: PurchaseStatus.FAILED },
      );

      this.logger.error(`Failed to create payment intent: ${error}`);
      throw new BadRequestException('Failed to create payment intent');
    }
  }

  /**
   * Process a successful payment and create purchase record.
   * Transfers creator's share to their Stripe Connect account.
   */
  async processSuccessfulPayment(paymentIntentId: string): Promise<PurchaseResult> {
    const purchase = await this.purchaseRepo.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
      relations: ['marketplaceAgent'],
    });

    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }

    if (purchase.status === PurchaseStatus.COMPLETED) {
      // Already processed
      return {
        purchaseId: purchase.id,
        paymentIntentId: purchase.stripePaymentIntentId,
        amountCents: purchase.amountCents,
        platformFeeCents: purchase.platformFeeCents,
        creatorAmountCents: purchase.creatorAmountCents,
        status: 'succeeded',
      };
    }

    try {
      const stripe = this.stripeConnectService.getStripeClient();

      // Verify payment intent status
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        this.logger.warn(`Payment intent ${paymentIntentId} status: ${paymentIntent.status}`);
        return {
          purchaseId: purchase.id,
          paymentIntentId: purchase.stripePaymentIntentId,
          amountCents: purchase.amountCents,
          platformFeeCents: purchase.platformFeeCents,
          creatorAmountCents: purchase.creatorAmountCents,
          status: paymentIntent.status === 'processing' ? 'pending' : 'failed',
        };
      }

      // Update purchase status
      await this.purchaseRepo.update(
        { id: purchase.id },
        { status: PurchaseStatus.COMPLETED },
      );

      // Extract transfer ID if available from the latest charge
      // Stripe API: paymentIntent.latest_charge can be a string (charge ID) or expanded object
      const latestCharge = paymentIntent.latest_charge;
      const transferId = typeof latestCharge === 'object' && latestCharge !== null
        ? (latestCharge as Stripe.Charge).transfer
        : null;
      if (transferId && typeof transferId === 'string') {
        await this.purchaseRepo.update(
          { id: purchase.id },
          { stripeTransferId: transferId },
        );
      }

      this.logger.log(`Completed purchase ${purchase.id} for agent ${purchase.marketplaceAgentId}`);

      return {
        purchaseId: purchase.id,
        paymentIntentId: purchase.stripePaymentIntentId,
        amountCents: purchase.amountCents,
        platformFeeCents: purchase.platformFeeCents,
        creatorAmountCents: purchase.creatorAmountCents,
        status: 'succeeded',
      };
    } catch (error) {
      this.logger.error(`Failed to process payment: ${error}`);
      await this.purchaseRepo.update(
        { id: purchase.id },
        { status: PurchaseStatus.FAILED },
      );
      throw new BadRequestException('Failed to process payment');
    }
  }

  /**
   * Check if a user has purchased access to a paid agent.
   */
  async hasPurchasedAccess(marketplaceAgentId: string, userId: string): Promise<boolean> {
    const purchase = await this.purchaseRepo.findOne({
      where: {
        marketplaceAgentId,
        buyerUserId: userId,
        status: PurchaseStatus.COMPLETED,
      },
    });

    return !!purchase;
  }

  /**
   * Get purchase history for a user.
   */
  async getUserPurchases(
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ purchases: AgentPurchase[]; total: number }> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const [purchases, total] = await this.purchaseRepo.findAndCount({
      where: { buyerUserId: userId },
      relations: ['marketplaceAgent'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { purchases, total };
  }

  /**
   * Get a specific purchase by ID.
   */
  async getPurchase(purchaseId: string, userId: string): Promise<AgentPurchase> {
    const purchase = await this.purchaseRepo.findOne({
      where: { id: purchaseId },
      relations: ['marketplaceAgent', 'installedAgent'],
    });

    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }

    if (purchase.buyerUserId !== userId) {
      throw new ForbiddenException('You do not have access to this purchase');
    }

    return purchase;
  }

  /**
   * Handle refund for a purchase (within refund window).
   */
  async processRefund(
    purchaseId: string,
    reason: string,
    actorId: string,
  ): Promise<{ refundId: string; amount: number }> {
    const purchase = await this.purchaseRepo.findOne({
      where: { id: purchaseId },
    });

    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }

    if (purchase.status !== PurchaseStatus.COMPLETED) {
      throw new BadRequestException('Only completed purchases can be refunded');
    }

    // Check refund window
    const refundDeadline = new Date(purchase.createdAt);
    refundDeadline.setDate(refundDeadline.getDate() + this.REFUND_WINDOW_DAYS);

    if (new Date() > refundDeadline) {
      throw new BadRequestException(`Refund window has expired (${this.REFUND_WINDOW_DAYS} days)`);
    }

    try {
      const stripe = this.stripeConnectService.getStripeClient();

      // Create refund
      const refund = await stripe.refunds.create({
        payment_intent: purchase.stripePaymentIntentId,
        reason: 'requested_by_customer',
        metadata: {
          original_purchase_id: purchaseId,
          refund_reason: reason,
          refunded_by: actorId,
        },
      });

      // Update purchase record
      await this.purchaseRepo.update(
        { id: purchaseId },
        {
          status: PurchaseStatus.REFUNDED,
          refundedAt: new Date(),
          refundReason: reason,
          refundedBy: actorId,
        },
      );

      this.logger.log(`Refunded purchase ${purchaseId}, refund ID: ${refund.id}`);

      return {
        refundId: refund.id,
        amount: refund.amount,
      };
    } catch (error) {
      this.logger.error(`Failed to process refund: ${error}`);
      throw new BadRequestException('Failed to process refund');
    }
  }

  /**
   * Link an installed agent to a purchase.
   */
  async linkInstalledAgent(
    purchaseId: string,
    installedAgentId: string,
    userId: string,
  ): Promise<void> {
    const purchase = await this.purchaseRepo.findOne({
      where: { id: purchaseId, buyerUserId: userId },
    });

    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }

    await this.purchaseRepo.update(
      { id: purchaseId },
      { installedAgentId },
    );
  }

  /**
   * Get purchases for a creator's agents (for earnings calculation).
   */
  async getCreatorPurchases(
    creatorUserId: string,
    options?: { startDate?: Date; endDate?: Date },
  ): Promise<AgentPurchase[]> {
    const queryBuilder = this.purchaseRepo
      .createQueryBuilder('purchase')
      .innerJoinAndSelect('purchase.marketplaceAgent', 'agent')
      .where('agent.publisherUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: PurchaseStatus.COMPLETED });

    if (options?.startDate) {
      queryBuilder.andWhere('purchase.createdAt >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options?.endDate) {
      queryBuilder.andWhere('purchase.createdAt <= :endDate', {
        endDate: options.endDate,
      });
    }

    queryBuilder.orderBy('purchase.createdAt', 'DESC');

    return queryBuilder.getMany();
  }
}
