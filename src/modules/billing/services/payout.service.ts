/**
 * PayoutService
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * Handles creator payout requests and automatic payout processing.
 * Uses Stripe Connect to transfer funds to creators' bank accounts.
 */
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import Stripe from 'stripe';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';
import { PayoutTransaction, PayoutStatus } from '../../../database/entities/payout-transaction.entity';
import { AgentPurchase, PurchaseStatus } from '../../../database/entities/agent-purchase.entity';
import { StripeConnectService } from './stripe-connect.service';
import { CreatorEarningsService } from './creator-earnings.service';

export interface PayoutRequest {
  payoutId: string;
  amountCents: number;
  status: PayoutStatus;
  estimatedArrival?: Date;
}

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  // Minimum payout: $10.00 USD
  private readonly MIN_PAYOUT_CENTS = 1000;

  constructor(
    @InjectRepository(CreatorPayoutAccount)
    private readonly payoutAccountRepo: Repository<CreatorPayoutAccount>,
    @InjectRepository(PayoutTransaction)
    private readonly payoutTxRepo: Repository<PayoutTransaction>,
    @InjectRepository(AgentPurchase)
    private readonly purchaseRepo: Repository<AgentPurchase>,
    private readonly stripeConnectService: StripeConnectService,
    private readonly creatorEarningsService: CreatorEarningsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Request a manual payout for a creator.
   */
  async requestPayout(creatorUserId: string): Promise<PayoutRequest> {
    // Check eligibility
    const eligibility = await this.creatorEarningsService.canRequestPayout(creatorUserId);

    if (!eligibility.eligible) {
      throw new BadRequestException(eligibility.reason || 'Not eligible for payout');
    }

    // Get payout account
    const payoutAccount = await this.payoutAccountRepo.findOne({
      where: { userId: creatorUserId },
    });

    if (!payoutAccount) {
      throw new NotFoundException('Payout account not found');
    }

    // Check for pending/processing payouts atomically
    const existingPayout = await this.payoutTxRepo.findOne({
      where: {
        payoutAccountId: payoutAccount.id,
        status: PayoutStatus.PENDING,
      },
    });

    if (existingPayout) {
      throw new BadRequestException('You have a pending payout request. Please wait for it to complete.');
    }

    const processingPayout = await this.payoutTxRepo.findOne({
      where: {
        payoutAccountId: payoutAccount.id,
        status: PayoutStatus.PROCESSING,
      },
    });

    if (processingPayout) {
      throw new BadRequestException('A payout is currently being processed. Please wait for it to complete.');
    }

    // Create payout transaction record
    const payoutTx = this.payoutTxRepo.create({
      payoutAccountId: payoutAccount.id,
      amountCents: eligibility.availableAmount,
      currency: 'USD',
      status: PayoutStatus.PENDING,
      description: 'Manual payout request',
    });

    const savedPayout = await this.payoutTxRepo.save(payoutTx);

    this.logger.log(`Created payout request ${savedPayout.id} for user ${creatorUserId}`);

    // Process the payout immediately
    return this.processPayout(savedPayout.id, payoutAccount);
  }

  /**
   * Process a payout through Stripe Connect.
   */
  private async processPayout(
    payoutId: string,
    payoutAccount: CreatorPayoutAccount,
  ): Promise<PayoutRequest> {
    const payout = await this.payoutTxRepo.findOne({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.status !== PayoutStatus.PENDING) {
      throw new BadRequestException('Payout is not in pending status');
    }

    try {
      // Update to processing
      await this.payoutTxRepo.update(
        { id: payoutId },
        { status: PayoutStatus.PROCESSING, processedAt: new Date() },
      );

      const stripe = this.stripeConnectService.getStripeClient();

      // Create Stripe payout to creator's connected account
      const stripePayout = await stripe.payouts.create(
        {
          amount: payout.amountCents,
          currency: payout.currency.toLowerCase(),
          metadata: {
            devos_payout_id: payoutId,
            devos_user_id: payoutAccount.userId,
          },
        },
        {
          stripeAccount: payoutAccount.stripeAccountId,
        },
      );

      // Update with Stripe payout ID
      await this.payoutTxRepo.update(
        { id: payoutId },
        { stripePayoutId: stripePayout.id },
      );

      // Calculate estimated arrival (typically 2-5 business days)
      const estimatedArrival = new Date();
      estimatedArrival.setDate(estimatedArrival.getDate() + 3);

      this.logger.log(`Processed payout ${payoutId} via Stripe payout ${stripePayout.id}`);

      return {
        payoutId,
        amountCents: payout.amountCents,
        status: PayoutStatus.PROCESSING,
        estimatedArrival,
      };
    } catch (error) {
      this.logger.error(`Failed to process payout ${payoutId}: ${error}`);

      // Mark as failed
      await this.payoutTxRepo.update(
        { id: payoutId },
        {
          status: PayoutStatus.FAILED,
          failureReason: error instanceof Error ? error.message : 'Unknown error',
        },
      );

      throw new BadRequestException('Failed to process payout');
    }
  }

  /**
   * Process automatic daily payouts for eligible creators.
   * Called by cron job.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async processAutomaticPayouts(): Promise<{ processed: number; failed: number }> {
    this.logger.log('Starting automatic payout processing');

    // Find all creators with enabled payouts and sufficient balance
    const eligibleAccounts = await this.payoutAccountRepo.find({
      where: {
        payoutsEnabled: true,
      },
    });

    let processed = 0;
    let failed = 0;

    for (const account of eligibleAccounts) {
      try {
        const eligibility = await this.creatorEarningsService.canRequestPayout(account.userId);

        if (eligibility.eligible && eligibility.availableAmount >= this.MIN_PAYOUT_CENTS) {
          // Check for existing pending/processing payouts
          const existingPayout = await this.payoutTxRepo.findOne({
            where: {
              payoutAccountId: account.id,
              status: PayoutStatus.PROCESSING,
            },
          });

          if (!existingPayout) {
            // Create payout transaction
            const payoutTx = this.payoutTxRepo.create({
              payoutAccountId: account.id,
              amountCents: eligibility.availableAmount,
              currency: 'USD',
              status: PayoutStatus.PENDING,
              description: 'Automatic daily payout',
            });

            const savedPayout = await this.payoutTxRepo.save(payoutTx);
            await this.processPayout(savedPayout.id, account);
            processed++;
          }
        }
      } catch (error) {
        this.logger.error(`Failed to process automatic payout for user ${account.userId}: ${error}`);
        failed++;
      }
    }

    this.logger.log(`Automatic payout processing complete: ${processed} processed, ${failed} failed`);

    return { processed, failed };
  }

  /**
   * Get payout history for a creator.
   */
  async getPayoutHistory(
    creatorUserId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ payouts: PayoutTransaction[]; total: number }> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const payoutAccount = await this.payoutAccountRepo.findOne({
      where: { userId: creatorUserId },
    });

    if (!payoutAccount) {
      return { payouts: [], total: 0 };
    }

    const [payouts, total] = await this.payoutTxRepo.findAndCount({
      where: { payoutAccountId: payoutAccount.id },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { payouts, total };
  }

  /**
   * Handle Stripe payout webhooks.
   */
  async handlePayoutWebhook(event: Stripe.Event): Promise<void> {
    this.logger.log(`Processing payout webhook: ${event.type}`);

    switch (event.type) {
      case 'payout.paid': {
        const payout = event.data.object as Stripe.Payout;
        await this.handlePayoutCompleted(payout);
        break;
      }
      case 'payout.failed': {
        const payout = event.data.object as Stripe.Payout;
        await this.handlePayoutFailed(payout);
        break;
      }
      case 'payout.canceled': {
        const payout = event.data.object as Stripe.Payout;
        await this.handlePayoutCancelled(payout);
        break;
      }
      default:
        this.logger.debug(`Unhandled payout webhook event type: ${event.type}`);
    }
  }

  /**
   * Handle payout.paid webhook.
   */
  private async handlePayoutCompleted(stripePayout: Stripe.Payout): Promise<void> {
    const payout = await this.payoutTxRepo.findOne({
      where: { stripePayoutId: stripePayout.id },
    });

    if (!payout) {
      this.logger.warn(`No payout found for Stripe payout ${stripePayout.id}`);
      return;
    }

    await this.payoutTxRepo.update(
      { id: payout.id },
      {
        status: PayoutStatus.COMPLETED,
        completedAt: new Date(),
      },
    );

    this.logger.log(`Payout ${payout.id} completed`);
  }

  /**
   * Handle payout.failed webhook.
   */
  private async handlePayoutFailed(stripePayout: Stripe.Payout): Promise<void> {
    const payout = await this.payoutTxRepo.findOne({
      where: { stripePayoutId: stripePayout.id },
    });

    if (!payout) {
      this.logger.warn(`No payout found for Stripe payout ${stripePayout.id}`);
      return;
    }

    await this.payoutTxRepo.update(
      { id: payout.id },
      {
        status: PayoutStatus.FAILED,
        failureReason: stripePayout.failure_message || 'Payout failed',
      },
    );

    this.logger.log(`Payout ${payout.id} failed: ${stripePayout.failure_message}`);
  }

  /**
   * Handle payout.canceled webhook.
   */
  private async handlePayoutCancelled(stripePayout: Stripe.Payout): Promise<void> {
    const payout = await this.payoutTxRepo.findOne({
      where: { stripePayoutId: stripePayout.id },
    });

    if (!payout) {
      this.logger.warn(`No payout found for Stripe payout ${stripePayout.id}`);
      return;
    }

    await this.payoutTxRepo.update(
      { id: payout.id },
      {
        status: PayoutStatus.CANCELLED,
        failureReason: 'Payout was cancelled',
      },
    );

    this.logger.log(`Payout ${payout.id} cancelled`);
  }

  /**
   * Calculate available balance for a creator.
   */
  async calculateAvailableBalance(creatorUserId: string): Promise<{
    availableCents: number;
    pendingCents: number;
    totalEarnedCents: number;
  }> {
    const summary = await this.creatorEarningsService.getEarningsSummary(creatorUserId);

    return {
      availableCents: summary.availableForPayoutCents,
      pendingCents: summary.pendingEarningsCents,
      totalEarnedCents: summary.totalEarningsCents,
    };
  }

  /**
   * Get a specific payout by ID.
   */
  async getPayout(payoutId: string, creatorUserId: string): Promise<PayoutTransaction> {
    const payoutAccount = await this.payoutAccountRepo.findOne({
      where: { userId: creatorUserId },
    });

    if (!payoutAccount) {
      throw new NotFoundException('Payout account not found');
    }

    const payout = await this.payoutTxRepo.findOne({
      where: { id: payoutId, payoutAccountId: payoutAccount.id },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    return payout;
  }
}
