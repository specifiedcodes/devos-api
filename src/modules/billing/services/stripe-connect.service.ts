/**
 * StripeConnectService
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * Handles Stripe Connect account creation and management for creators.
 * Uses Stripe Express accounts for simplified onboarding.
 */
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';

export interface StripeConnectAccount {
  stripeAccountId: string;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  country: string;
  defaultCurrency: string;
}

export interface OnboardingLink {
  url: string;
  expiresAt: Date;
}

@Injectable()
export class StripeConnectService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeConnectService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(CreatorPayoutAccount)
    private readonly payoutAccountRepo: Repository<CreatorPayoutAccount>,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not configured - Stripe Connect features will be disabled');
      // Create a dummy stripe instance to prevent null errors
      this.stripe = new Stripe('sk_test_dummy', {
        apiVersion: '2026-01-28.clover',
      });
      return;
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
    });
  }

  /**
   * Check if Stripe is properly configured
   */
  isConfigured(): boolean {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    return !!secretKey && !secretKey.includes('dummy');
  }

  /**
   * Create a Stripe Connect Express account for a creator.
   * This allows them to receive payouts from agent sales.
   */
  async createConnectAccount(
    userId: string,
    email: string,
    country: string = 'US',
  ): Promise<StripeConnectAccount> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    // Check if user already has a payout account
    const existingAccount = await this.payoutAccountRepo.findOne({
      where: { userId },
    });

    if (existingAccount) {
      // Return existing account status
      return this.getAccountStatus(existingAccount.stripeAccountId);
    }

    try {
      // Create Stripe Connect Express account
      const account = await this.stripe.accounts.create({
        type: 'express',
        country,
        email,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        business_type: 'individual',
        metadata: {
          devos_user_id: userId,
        },
      });

      // Save to database
      const payoutAccount = this.payoutAccountRepo.create({
        userId,
        stripeAccountId: account.id,
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        country,
        defaultCurrency: 'USD',
      });

      await this.payoutAccountRepo.save(payoutAccount);

      this.logger.log(`Created Stripe Connect account ${account.id} for user ${userId}`);

      return {
        stripeAccountId: account.id,
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        country,
        defaultCurrency: 'USD',
      };
    } catch (error) {
      this.logger.error(`Failed to create Stripe Connect account: ${error}`);
      throw new BadRequestException('Failed to create Stripe Connect account');
    }
  }

  /**
   * Generate an onboarding link for the creator to complete their Stripe setup.
   */
  async createOnboardingLink(
    userId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<OnboardingLink> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    const payoutAccount = await this.payoutAccountRepo.findOne({
      where: { userId },
    });

    if (!payoutAccount) {
      throw new NotFoundException('No Stripe Connect account found. Please create one first.');
    }

    try {
      const accountLink = await this.stripe.accountLinks.create({
        account: payoutAccount.stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      return {
        url: accountLink.url,
        expiresAt: new Date(accountLink.expires_at * 1000),
      };
    } catch (error) {
      this.logger.error(`Failed to create onboarding link: ${error}`);
      throw new BadRequestException('Failed to create onboarding link');
    }
  }

  /**
   * Get the current status of a creator's Stripe Connect account.
   */
  async getAccountStatus(stripeAccountId: string): Promise<StripeConnectAccount> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    try {
      const account = await this.stripe.accounts.retrieve(stripeAccountId);

      return {
        stripeAccountId: account.id,
        onboardingComplete: account.details_submitted ?? false,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        country: account.country ?? 'US',
        defaultCurrency: account.default_currency ?? 'USD',
      };
    } catch (error) {
      this.logger.error(`Failed to get account status: ${error}`);
      throw new BadRequestException('Failed to get account status');
    }
  }

  /**
   * Get the payout account for a user (from database).
   */
  async getPayoutAccount(userId: string): Promise<CreatorPayoutAccount | null> {
    return this.payoutAccountRepo.findOne({
      where: { userId },
    });
  }

  /**
   * Get the Stripe Connect account status for a user.
   */
  async getUserAccountStatus(userId: string): Promise<StripeConnectAccount | null> {
    const payoutAccount = await this.getPayoutAccount(userId);
    if (!payoutAccount) {
      return null;
    }

    // Sync status from Stripe and return
    const status = await this.getAccountStatus(payoutAccount.stripeAccountId);

    // Update local cache
    await this.payoutAccountRepo.update(
      { userId },
      {
        onboardingComplete: status.onboardingComplete,
        chargesEnabled: status.chargesEnabled,
        payoutsEnabled: status.payoutsEnabled,
        country: status.country,
        defaultCurrency: status.defaultCurrency,
      },
    );

    return status;
  }

  /**
   * Create a login link for creators to manage their Stripe account.
   */
  async createLoginLink(userId: string): Promise<{ url: string }> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    const payoutAccount = await this.getPayoutAccount(userId);
    if (!payoutAccount) {
      throw new NotFoundException('No Stripe Connect account found');
    }

    try {
      const loginLink = await this.stripe.accounts.createLoginLink(
        payoutAccount.stripeAccountId,
      );

      return { url: loginLink.url };
    } catch (error) {
      this.logger.error(`Failed to create login link: ${error}`);
      throw new BadRequestException('Failed to create login link');
    }
  }

  /**
   * Handle Stripe webhooks for account updates.
   */
  async handleAccountWebhook(event: Stripe.Event): Promise<void> {
    this.logger.log(`Processing Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        await this.handleAccountUpdated(account);
        break;
      }
      case 'account.application.deauthorized': {
        const application = event.data.object as unknown as Stripe.Application;
        // The application object has a property that references the account
        const accountId = (application as any).account as string;
        if (accountId) {
          await this.handleAccountDeauthorizedById(accountId);
        }
        break;
      }
      default:
        this.logger.debug(`Unhandled webhook event type: ${event.type}`);
    }
  }

  /**
   * Handle account.updated webhook.
   */
  private async handleAccountUpdated(account: Stripe.Account): Promise<void> {
    const userId = account.metadata?.devos_user_id;
    if (!userId) {
      this.logger.warn(`Account ${account.id} updated but no devos_user_id in metadata`);
      return;
    }

    const updateData = {
      onboardingComplete: account.details_submitted ?? false,
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      country: account.country ?? null,
      defaultCurrency: account.default_currency ?? 'USD',
    };

    // Set onboarding completed at if just completed
    if (account.details_submitted) {
      const existing = await this.payoutAccountRepo.findOne({
        where: { stripeAccountId: account.id },
      });
      if (existing && !existing.onboardingComplete) {
        (updateData as any).onboardingCompletedAt = new Date();
      }
    }

    await this.payoutAccountRepo.update({ stripeAccountId: account.id }, updateData as any);

    this.logger.log(`Updated payout account status for Stripe account ${account.id}`);
  }

  /**
   * Handle account deauthorization.
   */
  private async handleAccountDeauthorized(account: Stripe.Account): Promise<void> {
    const payoutAccount = await this.payoutAccountRepo.findOne({
      where: { stripeAccountId: account.id },
    });

    if (payoutAccount) {
      // Mark account as disabled rather than deleting
      await this.payoutAccountRepo.update(
        { stripeAccountId: account.id },
        {
          chargesEnabled: false,
          payoutsEnabled: false,
        },
      );
      this.logger.log(`Deauthorized Stripe account ${account.id}`);
    }
  }

  /**
   * Handle account deauthorization by account ID.
   */
  private async handleAccountDeauthorizedById(stripeAccountId: string): Promise<void> {
    const payoutAccount = await this.payoutAccountRepo.findOne({
      where: { stripeAccountId },
    });

    if (payoutAccount) {
      // Mark account as disabled rather than deleting
      await this.payoutAccountRepo.update(
        { stripeAccountId },
        {
          chargesEnabled: false,
          payoutsEnabled: false,
        },
      );
      this.logger.log(`Deauthorized Stripe account ${stripeAccountId}`);
    }
  }

  /**
   * Get the Stripe client for direct operations.
   */
  getStripeClient(): Stripe {
    return this.stripe;
  }
}
