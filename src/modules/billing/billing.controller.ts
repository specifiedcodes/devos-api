/**
 * BillingController
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * REST API endpoints for billing, Stripe Connect, purchases, earnings, and payouts.
 */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { StripeConnectService } from './services/stripe-connect.service';
import { AgentPurchaseService } from './services/agent-purchase.service';
import { CreatorEarningsService } from './services/creator-earnings.service';
import { PayoutService } from './services/payout.service';
import {
  CreateOnboardingLinkDto,
  EarningsQueryDto,
  PayoutQueryDto,
  CreatePurchaseIntentDto,
  ConfirmPurchaseDto,
  DailyEarningsQueryDto,
} from './dto';

@ApiTags('billing')
@ApiBearerAuth('JWT-auth')
@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly stripeConnectService: StripeConnectService,
    private readonly purchaseService: AgentPurchaseService,
    private readonly earningsService: CreatorEarningsService,
    private readonly payoutService: PayoutService,
  ) {}

  // ============ Creator Payout Setup ============

  @Post('connect/account')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create Stripe Connect account for creator' })
  @ApiResponse({ status: 201, description: 'Stripe Connect account created' })
  @ApiResponse({ status: 400, description: 'Stripe not configured or account already exists' })
  async createConnectAccount(@Req() req: any): Promise<{ accountId: string; onboardingComplete: boolean; payoutsEnabled: boolean }> {
    const userId = req.user?.sub;
    const email = req.user?.email;

    if (!userId || !email) {
      throw new UnauthorizedException('User not authenticated');
    }

    const account = await this.stripeConnectService.createConnectAccount(userId, email);

    return {
      accountId: account.stripeAccountId,
      onboardingComplete: account.onboardingComplete,
      payoutsEnabled: account.payoutsEnabled,
    };
  }

  @Post('connect/onboarding-link')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Get Stripe Connect onboarding link' })
  @ApiResponse({ status: 201, description: 'Onboarding link generated' })
  @ApiResponse({ status: 404, description: 'No Stripe Connect account found' })
  async getOnboardingLink(
    @Body() dto: CreateOnboardingLinkDto,
    @Req() req: any,
  ): Promise<{ url: string; expiresAt: Date }> {
    const userId = req.user?.sub;

    const link = await this.stripeConnectService.createOnboardingLink(
      userId,
      dto.refreshUrl,
      dto.returnUrl,
    );

    return {
      url: link.url,
      expiresAt: link.expiresAt,
    };
  }

  @Get('connect/status')
  @ApiOperation({ summary: 'Get Stripe Connect account status' })
  @ApiResponse({ status: 200, description: 'Account status retrieved' })
  async getConnectStatus(@Req() req: any): Promise<{
    hasAccount: boolean;
    onboardingComplete: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    country?: string;
    defaultCurrency?: string;
  }> {
    const userId = req.user?.sub;

    const status = await this.stripeConnectService.getUserAccountStatus(userId);

    if (!status) {
      return {
        hasAccount: false,
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      };
    }

    return {
      hasAccount: true,
      onboardingComplete: status.onboardingComplete,
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      country: status.country,
      defaultCurrency: status.defaultCurrency,
    };
  }

  @Post('connect/login-link')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Get Stripe dashboard login link' })
  @ApiResponse({ status: 201, description: 'Login link generated' })
  @ApiResponse({ status: 404, description: 'No Stripe Connect account found' })
  async getLoginLink(@Req() req: any): Promise<{ url: string }> {
    const userId = req.user?.sub;

    return this.stripeConnectService.createLoginLink(userId);
  }

  // ============ Agent Purchases ============

  @Post('purchase/:agentId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create payment intent for agent purchase' })
  @ApiResponse({ status: 201, description: 'Payment intent created' })
  @ApiResponse({ status: 400, description: 'Agent is free or already purchased' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async createPurchaseIntent(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: CreatePurchaseIntentDto,
    @Req() req: any,
  ): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    amount: number;
    currency: string;
    platformFeeCents: number;
    creatorAmountCents: number;
  }> {
    const userId = req.user?.sub;

    return this.purchaseService.createPaymentIntent(agentId, userId, dto.workspaceId);
  }

  @Post('purchase/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm payment and complete purchase' })
  @ApiResponse({ status: 200, description: 'Purchase confirmed' })
  @ApiResponse({ status: 404, description: 'Payment intent not found' })
  async confirmPurchase(
    @Body() dto: ConfirmPurchaseDto,
    @Req() req: any,
  ): Promise<{ purchaseId: string; status: string }> {
    const result = await this.purchaseService.processSuccessfulPayment(dto.paymentIntentId);

    return {
      purchaseId: result.purchaseId,
      status: result.status,
    };
  }

  @Get('purchases')
  @ApiOperation({ summary: 'Get purchase history for current user' })
  @ApiResponse({ status: 200, description: 'Purchase history retrieved' })
  async getUserPurchases(
    @Query() query: PayoutQueryDto,
    @Req() req: any,
  ): Promise<{ purchases: any[]; total: number }> {
    const userId = req.user?.sub;

    const result = await this.purchaseService.getUserPurchases(userId, {
      limit: query.limit,
      offset: query.offset,
    });

    return {
      purchases: result.purchases.map((p) => ({
        id: p.id,
        marketplaceAgentId: p.marketplaceAgentId,
        agentName: p.marketplaceAgent?.displayName,
        amountCents: p.amountCents,
        currency: p.currency,
        status: p.status,
        createdAt: p.createdAt,
      })),
      total: result.total,
    };
  }

  @Get('purchases/:agentId/access')
  @ApiOperation({ summary: 'Check if user has purchased access to agent' })
  @ApiResponse({ status: 200, description: 'Access status retrieved' })
  async checkPurchaseAccess(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Req() req: any,
  ): Promise<{ hasAccess: boolean }> {
    const userId = req.user?.sub;

    const hasAccess = await this.purchaseService.hasPurchasedAccess(agentId, userId);

    return { hasAccess };
  }

  // ============ Creator Earnings ============

  @Get('earnings/summary')
  @ApiOperation({ summary: 'Get earnings summary for creator' })
  @ApiResponse({ status: 200, description: 'Earnings summary retrieved' })
  async getEarningsSummary(@Req() req: any): Promise<any> {
    const userId = req.user?.sub;

    return this.earningsService.getEarningsSummary(userId);
  }

  @Get('earnings/breakdown')
  @ApiOperation({ summary: 'Get earnings breakdown by agent and time' })
  @ApiResponse({ status: 200, description: 'Earnings breakdown retrieved' })
  async getEarningsBreakdown(
    @Query() query: EarningsQueryDto,
    @Req() req: any,
  ): Promise<any> {
    const userId = req.user?.sub;

    const options: { startDate?: Date; endDate?: Date } = {};

    if (query.startDate) {
      options.startDate = new Date(query.startDate);
    }

    if (query.endDate) {
      options.endDate = new Date(query.endDate);
    }

    return this.earningsService.getEarningsBreakdown(userId, options);
  }

  @Get('earnings/transactions')
  @ApiOperation({ summary: 'Get transaction history for creator' })
  @ApiResponse({ status: 200, description: 'Transaction history retrieved' })
  async getTransactionHistory(
    @Req() req: any,
    @Query() query: PayoutQueryDto,
    @Query('type') type?: string,
  ): Promise<any> {
    const userId = req.user?.sub;

    return this.earningsService.getTransactionHistory(userId, {
      limit: query.limit,
      offset: query.offset,
      type,
    });
  }

  @Get('earnings/daily')
  @ApiOperation({ summary: 'Get daily earnings for charting' })
  @ApiResponse({ status: 200, description: 'Daily earnings retrieved' })
  async getDailyEarnings(
    @Query() query: DailyEarningsQueryDto,
    @Req() req: any,
  ): Promise<any> {
    const userId = req.user?.sub;

    return this.earningsService.getDailyEarnings(userId, query.days);
  }

  // ============ Payouts ============

  @Post('payouts/request')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request a manual payout' })
  @ApiResponse({ status: 201, description: 'Payout requested' })
  @ApiResponse({ status: 400, description: 'Not eligible for payout' })
  async requestPayout(@Req() req: any): Promise<any> {
    const userId = req.user?.sub;

    return this.payoutService.requestPayout(userId);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Get payout history' })
  @ApiResponse({ status: 200, description: 'Payout history retrieved' })
  async getPayoutHistory(
    @Query() query: PayoutQueryDto,
    @Req() req: any,
  ): Promise<any> {
    const userId = req.user?.sub;

    return this.payoutService.getPayoutHistory(userId, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('payouts/balance')
  @ApiOperation({ summary: 'Get available balance' })
  @ApiResponse({ status: 200, description: 'Balance retrieved' })
  async getAvailableBalance(@Req() req: any): Promise<any> {
    const userId = req.user?.sub;

    return this.payoutService.calculateAvailableBalance(userId);
  }

  @Get('payouts/eligibility')
  @ApiOperation({ summary: 'Check payout eligibility' })
  @ApiResponse({ status: 200, description: 'Eligibility checked' })
  async checkPayoutEligibility(@Req() req: any): Promise<any> {
    const userId = req.user?.sub;

    return this.earningsService.canRequestPayout(userId);
  }

  // ============ Webhooks ============

  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Stripe webhooks' })
  @ApiHeader({ name: 'stripe-signature', description: 'Stripe webhook signature' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 400, description: 'Invalid signature' })
  async handleStripeWebhook(@Req() req: any): Promise<{ received: boolean }> {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      this.logger.warn('Stripe webhook received without signature');
      return { received: false };
    }

    // Get raw body - requires express raw body configuration
    const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));

    return this.billingService.handleWebhook(payload, signature);
  }
}
