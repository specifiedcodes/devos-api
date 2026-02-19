/**
 * BillingController Unit Tests
 *
 * Story 18-9: Agent Revenue Sharing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BillingController } from '../billing.controller';
import { BillingService } from '../billing.service';
import { StripeConnectService } from '../services/stripe-connect.service';
import { AgentPurchaseService } from '../services/agent-purchase.service';
import { CreatorEarningsService } from '../services/creator-earnings.service';
import { PayoutService } from '../services/payout.service';

describe('BillingController', () => {
  let controller: BillingController;
  let billingService: jest.Mocked<BillingService>;
  let stripeConnectService: jest.Mocked<StripeConnectService>;
  let purchaseService: jest.Mocked<AgentPurchaseService>;
  let earningsService: jest.Mocked<CreatorEarningsService>;
  let payoutService: jest.Mocked<PayoutService>;

  const mockUser = {
    sub: 'user-uuid-123',
    email: 'test@example.com',
  };

  const mockReq = { user: mockUser };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        {
          provide: BillingService,
          useValue: {
            handleWebhook: jest.fn(),
            isConfigured: jest.fn(),
          },
        },
        {
          provide: StripeConnectService,
          useValue: {
            createConnectAccount: jest.fn(),
            createOnboardingLink: jest.fn(),
            getUserAccountStatus: jest.fn(),
            createLoginLink: jest.fn(),
          },
        },
        {
          provide: AgentPurchaseService,
          useValue: {
            createPaymentIntent: jest.fn(),
            processSuccessfulPayment: jest.fn(),
            getUserPurchases: jest.fn(),
            hasPurchasedAccess: jest.fn(),
          },
        },
        {
          provide: CreatorEarningsService,
          useValue: {
            getEarningsSummary: jest.fn(),
            getEarningsBreakdown: jest.fn(),
            getTransactionHistory: jest.fn(),
            getDailyEarnings: jest.fn(),
          },
        },
        {
          provide: PayoutService,
          useValue: {
            requestPayout: jest.fn(),
            getPayoutHistory: jest.fn(),
            calculateAvailableBalance: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<BillingController>(BillingController);
    billingService = module.get(BillingService);
    stripeConnectService = module.get(StripeConnectService);
    purchaseService = module.get(AgentPurchaseService);
    earningsService = module.get(CreatorEarningsService);
    payoutService = module.get(PayoutService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============ Stripe Connect Tests ============

  describe('createConnectAccount', () => {
    it('should create a Stripe Connect account', async () => {
      stripeConnectService.createConnectAccount.mockResolvedValue({
        stripeAccountId: 'acct_test_123',
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        country: 'US',
        defaultCurrency: 'USD',
      });

      const result = await controller.createConnectAccount(mockReq);

      expect(stripeConnectService.createConnectAccount).toHaveBeenCalledWith(
        mockUser.sub,
        mockUser.email,
      );
      expect(result.accountId).toBe('acct_test_123');
    });
  });

  describe('getOnboardingLink', () => {
    it('should create an onboarding link', async () => {
      stripeConnectService.createOnboardingLink.mockResolvedValue({
        url: 'https://connect.stripe.com/setup/test',
        expiresAt: new Date(),
      });

      const dto = {
        refreshUrl: 'https://example.com/refresh',
        returnUrl: 'https://example.com/return',
      };

      const result = await controller.getOnboardingLink(dto, mockReq);

      expect(stripeConnectService.createOnboardingLink).toHaveBeenCalledWith(
        mockUser.sub,
        dto.refreshUrl,
        dto.returnUrl,
      );
      expect(result.url).toBe('https://connect.stripe.com/setup/test');
    });
  });

  describe('getConnectStatus', () => {
    it('should return account status when exists', async () => {
      stripeConnectService.getUserAccountStatus.mockResolvedValue({
        stripeAccountId: 'acct_test_123',
        onboardingComplete: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        country: 'US',
        defaultCurrency: 'USD',
      });

      const result = await controller.getConnectStatus(mockReq);

      expect(result.hasAccount).toBe(true);
      expect(result.onboardingComplete).toBe(true);
      expect(result.payoutsEnabled).toBe(true);
    });

    it('should return no account when not exists', async () => {
      stripeConnectService.getUserAccountStatus.mockResolvedValue(null);

      const result = await controller.getConnectStatus(mockReq);

      expect(result.hasAccount).toBe(false);
    });
  });

  describe('getLoginLink', () => {
    it('should create a login link', async () => {
      stripeConnectService.createLoginLink.mockResolvedValue({
        url: 'https://dashboard.stripe.com/test',
      });

      const result = await controller.getLoginLink(mockReq);

      expect(result.url).toBe('https://dashboard.stripe.com/test');
    });
  });

  // ============ Purchase Tests ============

  describe('createPurchaseIntent', () => {
    it('should create a payment intent for agent purchase', async () => {
      purchaseService.createPaymentIntent.mockResolvedValue({
        paymentIntentId: 'pi_test_123',
        clientSecret: 'pi_secret',
        amount: 1000,
        currency: 'USD',
        platformFeeCents: 200,
        creatorAmountCents: 800,
      });

      const dto = { workspaceId: 'workspace-uuid' };

      const result = await controller.createPurchaseIntent('agent-uuid', dto, mockReq);

      expect(purchaseService.createPaymentIntent).toHaveBeenCalledWith(
        'agent-uuid',
        mockUser.sub,
        'workspace-uuid',
      );
      expect(result.paymentIntentId).toBe('pi_test_123');
    });
  });

  describe('confirmPurchase', () => {
    it('should confirm a purchase', async () => {
      purchaseService.processSuccessfulPayment.mockResolvedValue({
        purchaseId: 'purchase-uuid',
        paymentIntentId: 'pi_test_123',
        amountCents: 1000,
        platformFeeCents: 200,
        creatorAmountCents: 800,
        status: 'succeeded',
      });

      const dto = { paymentIntentId: 'pi_test_123' };

      const result = await controller.confirmPurchase(dto, mockReq);

      expect(result.purchaseId).toBe('purchase-uuid');
      expect(result.status).toBe('succeeded');
    });
  });

  describe('getUserPurchases', () => {
    it('should return paginated purchase history', async () => {
      purchaseService.getUserPurchases.mockResolvedValue({
        purchases: [
          {
            id: 'purchase-1',
            marketplaceAgentId: 'agent-1',
            marketplaceAgent: { displayName: 'Test Agent' } as any,
            buyerUserId: 'user-uuid-123',
            buyerWorkspaceId: 'workspace-uuid',
            installedAgentId: null,
            purchaseType: 'one_time' as any,
            stripePaymentIntentId: 'pi_test_123',
            stripeTransferId: null,
            amountCents: 1000,
            platformFeeCents: 200,
            creatorAmountCents: 800,
            currency: 'USD',
            status: 'completed' as any,
            refundedAt: null,
            refundReason: null,
            refundedBy: null,
            createdAt: new Date(),
          },
        ],
        total: 1,
      });

      const result = await controller.getUserPurchases({ limit: 10, offset: 0 }, mockReq);

      expect(result.purchases).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('checkPurchaseAccess', () => {
    it('should return true if user has access', async () => {
      purchaseService.hasPurchasedAccess.mockResolvedValue(true);

      const result = await controller.checkPurchaseAccess('agent-uuid', mockReq);

      expect(result.hasAccess).toBe(true);
    });

    it('should return false if user does not have access', async () => {
      purchaseService.hasPurchasedAccess.mockResolvedValue(false);

      const result = await controller.checkPurchaseAccess('agent-uuid', mockReq);

      expect(result.hasAccess).toBe(false);
    });
  });

  // ============ Earnings Tests ============

  describe('getEarningsSummary', () => {
    it('should return earnings summary', async () => {
      earningsService.getEarningsSummary.mockResolvedValue({
        totalEarningsCents: 10000,
        pendingEarningsCents: 2000,
        availableForPayoutCents: 5000,
        totalPayoutsCents: 3000,
        lastPayoutAt: new Date(),
        currency: 'USD',
      });

      const result = await controller.getEarningsSummary(mockReq);

      expect(result.totalEarningsCents).toBe(10000);
    });
  });

  describe('getEarningsBreakdown', () => {
    it('should return earnings breakdown', async () => {
      earningsService.getEarningsBreakdown.mockResolvedValue({
        byAgent: [
          { agentId: 'agent-1', agentName: 'Agent 1', totalSales: 10, totalEarningsCents: 5000 },
        ],
        byMonth: [
          { month: '2026-01', sales: 10, earningsCents: 5000 },
        ],
      });

      const result = await controller.getEarningsBreakdown({}, mockReq);

      expect(result.byAgent).toHaveLength(1);
      expect(result.byMonth).toHaveLength(1);
    });
  });

  describe('getTransactionHistory', () => {
    it('should return transaction history', async () => {
      earningsService.getTransactionHistory.mockResolvedValue({
        transactions: [
          {
            id: 'tx-1',
            type: 'sale',
            amountCents: 800,
            description: 'Sale of Test Agent',
            agentName: 'Test Agent',
            createdAt: new Date(),
            status: 'completed',
          },
        ],
        total: 1,
      });

      const result = await controller.getTransactionHistory(mockReq, {}, undefined);

      expect(result.transactions).toHaveLength(1);
    });
  });

  describe('getDailyEarnings', () => {
    it('should return daily earnings', async () => {
      earningsService.getDailyEarnings.mockResolvedValue([
        { date: '2026-01-15', earningsCents: 800, sales: 1 },
        { date: '2026-01-14', earningsCents: 0, sales: 0 },
      ]);

      const result = await controller.getDailyEarnings({ days: 30 }, mockReq);

      expect(result).toHaveLength(2);
    });
  });

  // ============ Payout Tests ============

  describe('requestPayout', () => {
    it('should request a payout', async () => {
      payoutService.requestPayout.mockResolvedValue({
        payoutId: 'payout-uuid',
        amountCents: 5000,
        status: 'processing' as any,
        estimatedArrival: new Date(),
      });

      const result = await controller.requestPayout(mockReq);

      expect(payoutService.requestPayout).toHaveBeenCalledWith(mockUser.sub);
      expect(result.payoutId).toBe('payout-uuid');
    });
  });

  describe('getPayoutHistory', () => {
    it('should return payout history', async () => {
      payoutService.getPayoutHistory.mockResolvedValue({
        payouts: [
          {
            id: 'payout-1',
            payoutAccountId: 'payout-account-uuid',
            stripePayoutId: 'po_test_123',
            amountCents: 5000,
            currency: 'USD',
            status: 'completed' as any,
            description: 'Payout to creator',
            failureReason: null,
            processedAt: new Date(),
            completedAt: new Date(),
            createdAt: new Date(),
          },
        ],
        total: 1,
      });

      const result = await controller.getPayoutHistory({}, mockReq);

      expect(result.payouts).toHaveLength(1);
    });
  });

  describe('getAvailableBalance', () => {
    it('should return available balance', async () => {
      payoutService.calculateAvailableBalance.mockResolvedValue({
        availableCents: 5000,
        pendingCents: 2000,
        totalEarnedCents: 10000,
      });

      const result = await controller.getAvailableBalance(mockReq);

      expect(result.availableCents).toBe(5000);
    });
  });

  describe('checkPayoutEligibility', () => {
    it('should return eligibility status', async () => {
      earningsService.canRequestPayout = jest.fn().mockResolvedValue({
        eligible: true,
        availableAmount: 5000,
      });

      const result = await controller.checkPayoutEligibility(mockReq);

      expect(result.eligible).toBe(true);
      expect(result.availableAmount).toBe(5000);
    });
  });

  // ============ Webhook Tests ============

  describe('handleStripeWebhook', () => {
    it('should handle webhooks with valid signature', async () => {
      billingService.handleWebhook.mockResolvedValue({ received: true });

      const mockReq = {
        headers: { 'stripe-signature': 'sig_test' },
        rawBody: Buffer.from('{"type": "test"}'),
        body: Buffer.from('{"type": "test"}'),
      };

      const result = await controller.handleStripeWebhook(mockReq);

      expect(billingService.handleWebhook).toHaveBeenCalled();
      expect(result.received).toBe(true);
    });

    it('should return false for missing signature', async () => {
      const mockReq = {
        headers: {},
        body: {},
      };

      const result = await controller.handleStripeWebhook(mockReq);

      expect(result.received).toBe(false);
    });
  });
});
