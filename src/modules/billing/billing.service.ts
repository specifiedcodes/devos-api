/**
 * BillingService
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * Main service that orchestrates billing operations and webhook handling.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeConnectService } from './services/stripe-connect.service';
import { AgentPurchaseService } from './services/agent-purchase.service';
import { PayoutService } from './services/payout.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null = null;
  private readonly webhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly stripeConnectService: StripeConnectService,
    private readonly purchaseService: AgentPurchaseService,
    private readonly payoutService: PayoutService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2026-01-28.clover',
      });
    }
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '';
  }

  /**
   * Handle incoming Stripe webhooks.
   */
  async handleWebhook(payload: Buffer, signature: string): Promise<{ received: boolean }> {
    if (!this.stripe || !this.webhookSecret) {
      this.logger.warn('Stripe webhook received but not configured');
      return { received: false };
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      this.logger.error(`Webhook signature verification failed: ${error}`);
      throw new Error('Webhook signature verification failed');
    }

    this.logger.log(`Received Stripe webhook: ${event.type}`);

    // Route to appropriate handler
    try {
      if (event.type.startsWith('account.')) {
        await this.stripeConnectService.handleAccountWebhook(event);
      } else if (event.type.startsWith('payout.')) {
        await this.payoutService.handlePayoutWebhook(event);
      } else if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await this.purchaseService.processSuccessfulPayment(paymentIntent.id);
      } else if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        this.logger.warn(`Payment failed for intent ${paymentIntent.id}`);
      } else {
        this.logger.debug(`Unhandled webhook event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(`Error processing webhook ${event.type}: ${error}`);
      // Don't throw - we want to return 200 to Stripe to avoid retries
    }

    return { received: true };
  }

  /**
   * Check if Stripe is configured.
   */
  isConfigured(): boolean {
    return this.stripeConnectService.isConfigured();
  }
}
