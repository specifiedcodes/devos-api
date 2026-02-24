/**
 * TemplatePurchaseService
 *
 * Story 19-10: Template Revenue Sharing
 *
 * Handles template purchases with Stripe Connect payment processing.
 * Implements 80/20 revenue split between creators and platform.
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import Stripe from 'stripe';
import { Template, TemplatePricingType } from '../../../database/entities/template.entity';
import { TemplatePurchase, TemplatePurchaseStatus } from '../../../database/entities/template-purchase.entity';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';
import { StripeConnectService } from './stripe-connect.service';

export interface TemplatePricingCalculation {
  priceCents: number;
  platformFeeCents: number; // 20% of price
  creatorAmountCents: number; // 80% of price
  currency: string;
}

export interface TemplatePurchaseResult {
  purchaseId: string;
  paymentIntentId: string;
  amountCents: number;
  platformFeeCents: number;
  creatorAmountCents: number;
  status: 'succeeded' | 'pending' | 'failed';
}

@Injectable()
export class TemplatePurchaseService {
  private readonly logger = new Logger(TemplatePurchaseService.name);

  // Revenue split: 80% to creator, 20% to DevOS platform
  private readonly PLATFORM_FEE_PERCENT = 0.20;
  private readonly CREATOR_PERCENT = 0.80;

  // Refund window in days
  private readonly REFUND_WINDOW_DAYS = 7;

  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(TemplatePurchase)
    private readonly purchaseRepo: Repository<TemplatePurchase>,
    @InjectRepository(CreatorPayoutAccount)
    private readonly payoutAccountRepo: Repository<CreatorPayoutAccount>,
    private readonly stripeConnectService: StripeConnectService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Calculate pricing breakdown for a template purchase.
   */
  calculatePricing(priceCents: number): TemplatePricingCalculation {
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
   * Create a payment intent for purchasing a template.
   * Uses Stripe Connect to split payment between platform and creator.
   */
  async createPaymentIntent(
    templateId: string,
    buyerUserId: string,
    buyerWorkspaceId: string,
  ): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    amount: number;
    currency: string;
    platformFeeCents: number;
    creatorAmountCents: number;
  }> {
    // Find the template
    const template = await this.templateRepo.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Check if template is published
    if (!template.isPublished) {
      throw new BadRequestException('Template is not available for purchase');
    }

    // Check if template is paid
    if (template.pricingType === TemplatePricingType.FREE) {
      throw new BadRequestException('This template is free and does not require payment');
    }

    if (!template.priceCents || template.priceCents <= 0) {
      throw new BadRequestException('Template price is not configured');
    }

    // Prevent self-purchase
    if (template.createdBy === buyerUserId) {
      throw new BadRequestException('You cannot purchase your own template');
    }

    // Check if user already purchased
    const existingPurchase = await this.purchaseRepo.findOne({
      where: {
        buyerUserId,
        templateId,
        status: TemplatePurchaseStatus.COMPLETED,
      },
    });

    if (existingPurchase) {
      throw new BadRequestException('You have already purchased this template');
    }

    // Ensure template has a creator
    if (!template.createdBy) {
      throw new BadRequestException('Template has no creator assigned');
    }

    // Calculate pricing
    const pricing = this.calculatePricing(template.priceCents);

    // Get creator's Stripe Connect account for transfer
    const creatorPayoutAccount = await this.payoutAccountRepo.findOne({
      where: { userId: template.createdBy },
    });

    // Create pending purchase record
    const pendingPurchase = this.purchaseRepo.create({
      buyerUserId,
      buyerWorkspaceId,
      templateId,
      sellerUserId: template.createdBy,
      stripePaymentIntentId: 'pending',
      amountCents: pricing.priceCents,
      platformFeeCents: pricing.platformFeeCents,
      creatorAmountCents: pricing.creatorAmountCents,
      currency: pricing.currency,
      status: TemplatePurchaseStatus.PENDING,
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
          template_id: templateId,
          buyer_user_id: buyerUserId,
          buyer_workspace_id: buyerWorkspaceId,
          creator_user_id: template.createdBy,
          purchase_type: 'template',
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

      this.logger.log(`Created payment intent ${paymentIntent.id} for template ${templateId}`);

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
        { status: TemplatePurchaseStatus.FAILED },
      );

      this.logger.error(`Failed to create payment intent: ${error}`);
      throw new BadRequestException('Failed to create payment intent');
    }
  }

  /**
   * Process a successful payment and create purchase record.
   */
  async processSuccessfulPayment(paymentIntentId: string): Promise<TemplatePurchaseResult> {
    const purchase = await this.purchaseRepo.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
      relations: ['template'],
    });

    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }

    if (purchase.status === TemplatePurchaseStatus.COMPLETED) {
      // Already processed (idempotent)
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
        { status: TemplatePurchaseStatus.COMPLETED },
      );

      // Extract transfer ID if available from the latest charge
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

      this.logger.log(`Completed template purchase ${purchase.id} for template ${purchase.templateId}`);

      return {
        purchaseId: purchase.id,
        paymentIntentId: purchase.stripePaymentIntentId,
        amountCents: purchase.amountCents,
        platformFeeCents: purchase.platformFeeCents,
        creatorAmountCents: purchase.creatorAmountCents,
        status: 'succeeded',
      };
    } catch (error) {
      this.logger.error(`Failed to process template payment: ${error}`);
      await this.purchaseRepo.update(
        { id: purchase.id },
        { status: TemplatePurchaseStatus.FAILED },
      );
      throw new BadRequestException('Failed to process payment');
    }
  }

  /**
   * Check if a user has purchased access to a paid template.
   */
  async hasPurchasedAccess(templateId: string, userId: string): Promise<boolean> {
    const purchase = await this.purchaseRepo.findOne({
      where: {
        templateId,
        buyerUserId: userId,
        status: TemplatePurchaseStatus.COMPLETED,
      },
    });

    return !!purchase;
  }

  /**
   * Get purchase history for a user (template purchases only).
   */
  async getUserTemplatePurchases(
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ purchases: TemplatePurchase[]; total: number }> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const [purchases, total] = await this.purchaseRepo.findAndCount({
      where: { buyerUserId: userId },
      relations: ['template'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { purchases, total };
  }

  /**
   * Handle refund for a template purchase (within 7-day refund window).
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

    // Only the buyer can request a refund
    if (purchase.buyerUserId !== actorId) {
      throw new ForbiddenException('Only the buyer can request a refund');
    }

    if (purchase.status !== TemplatePurchaseStatus.COMPLETED) {
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
          purchase_type: 'template',
        },
      });

      // Update purchase record
      await this.purchaseRepo.update(
        { id: purchaseId },
        {
          status: TemplatePurchaseStatus.REFUNDED,
          refundedAt: new Date(),
          refundReason: reason,
          refundedBy: actorId,
        },
      );

      this.logger.log(`Refunded template purchase ${purchaseId}, refund ID: ${refund.id}`);

      return {
        refundId: refund.id,
        amount: refund.amount,
      };
    } catch (error) {
      this.logger.error(`Failed to process template refund: ${error}`);
      throw new BadRequestException('Failed to process refund');
    }
  }

  /**
   * Get purchases for a creator's templates (for earnings calculation).
   */
  async getCreatorTemplatePurchases(
    creatorUserId: string,
    options?: { startDate?: Date; endDate?: Date },
  ): Promise<TemplatePurchase[]> {
    const queryBuilder = this.purchaseRepo
      .createQueryBuilder('purchase')
      .innerJoinAndSelect('purchase.template', 'template')
      .where('purchase.sellerUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: TemplatePurchaseStatus.COMPLETED });

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
