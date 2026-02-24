/**
 * TemplateBillingController Unit Tests
 *
 * Story 19-10: Template Revenue Sharing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { TemplateBillingController } from '../controllers/template-billing.controller';
import { TemplatePurchaseService } from '../services/template-purchase.service';
import { TemplateCreatorEarningsService } from '../services/template-creator-earnings.service';

describe('TemplateBillingController', () => {
  let controller: TemplateBillingController;
  let purchaseService: jest.Mocked<TemplatePurchaseService>;
  let earningsService: jest.Mocked<TemplateCreatorEarningsService>;

  const mockUserId = 'test-user-uuid';
  const mockTemplateId = 'template-uuid';
  const mockWorkspaceId = 'workspace-uuid';

  const createMockRequest = (userId?: string) => ({
    user: userId ? { sub: userId, email: 'test@test.com' } : undefined,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateBillingController],
      providers: [
        {
          provide: TemplatePurchaseService,
          useValue: {
            createPaymentIntent: jest.fn(),
            processSuccessfulPayment: jest.fn(),
            getUserTemplatePurchases: jest.fn(),
            hasPurchasedAccess: jest.fn(),
            processRefund: jest.fn(),
          },
        },
        {
          provide: TemplateCreatorEarningsService,
          useValue: {
            getEarningsSummary: jest.fn(),
            getEarningsBreakdown: jest.fn(),
            getTransactionHistory: jest.fn(),
            getDailyEarnings: jest.fn(),
            canRequestPayout: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TemplateBillingController>(TemplateBillingController);
    purchaseService = module.get(TemplatePurchaseService) as jest.Mocked<TemplatePurchaseService>;
    earningsService = module.get(TemplateCreatorEarningsService) as jest.Mocked<TemplateCreatorEarningsService>;
  });

  describe('createPurchaseIntent', () => {
    it('should create payment intent for authenticated user', async () => {
      purchaseService.createPaymentIntent.mockResolvedValue({
        paymentIntentId: 'pi_test',
        clientSecret: 'cs_test',
        amount: 1000,
        currency: 'USD',
        platformFeeCents: 200,
        creatorAmountCents: 800,
      });

      const result = await controller.createPurchaseIntent(
        mockTemplateId,
        { workspaceId: mockWorkspaceId },
        createMockRequest(mockUserId),
      );

      expect(result.paymentIntentId).toBe('pi_test');
      expect(purchaseService.createPaymentIntent).toHaveBeenCalledWith(
        mockTemplateId,
        mockUserId,
        mockWorkspaceId,
      );
    });

    it('should throw UnauthorizedException when not authenticated', async () => {
      await expect(
        controller.createPurchaseIntent(
          mockTemplateId,
          { workspaceId: mockWorkspaceId },
          createMockRequest(),
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('confirmPurchase', () => {
    it('should confirm purchase and return result', async () => {
      purchaseService.processSuccessfulPayment.mockResolvedValue({
        purchaseId: 'purchase-123',
        paymentIntentId: 'pi_test',
        amountCents: 1000,
        platformFeeCents: 200,
        creatorAmountCents: 800,
        status: 'succeeded',
      });

      const result = await controller.confirmPurchase(
        { paymentIntentId: 'pi_test' },
        createMockRequest(mockUserId),
      );

      expect(result.purchaseId).toBe('purchase-123');
      expect(result.status).toBe('succeeded');
    });

    it('should throw UnauthorizedException when not authenticated', async () => {
      await expect(
        controller.confirmPurchase({ paymentIntentId: 'pi_test' }, createMockRequest()),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getUserTemplatePurchases', () => {
    it('should return purchase history with mapped fields', async () => {
      purchaseService.getUserTemplatePurchases.mockResolvedValue({
        purchases: [
          {
            id: 'p1',
            templateId: mockTemplateId,
            template: { displayName: 'Test Template' } as any,
            amountCents: 1000,
            platformFeeCents: 200,
            creatorAmountCents: 800,
            currency: 'USD',
            status: 'completed' as any,
            createdAt: new Date('2026-01-15'),
          } as any,
        ],
        total: 1,
      });

      const result = await controller.getUserTemplatePurchases(
        10,
        0,
        createMockRequest(mockUserId),
      );

      expect(result.total).toBe(1);
      expect(result.purchases[0].templateName).toBe('Test Template');
    });

    it('should throw UnauthorizedException when not authenticated', async () => {
      await expect(
        controller.getUserTemplatePurchases(10, 0, createMockRequest()),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('checkPurchaseAccess', () => {
    it('should return access status', async () => {
      purchaseService.hasPurchasedAccess.mockResolvedValue(true);

      const result = await controller.checkPurchaseAccess(
        mockTemplateId,
        createMockRequest(mockUserId),
      );

      expect(result.hasAccess).toBe(true);
    });

    it('should throw UnauthorizedException when not authenticated', async () => {
      await expect(
        controller.checkPurchaseAccess(mockTemplateId, createMockRequest()),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('requestRefund', () => {
    it('should process refund and return result', async () => {
      purchaseService.processRefund.mockResolvedValue({
        refundId: 're_test',
        amount: 1000,
      });

      const result = await controller.requestRefund(
        'purchase-uuid',
        { reason: 'Not satisfied' },
        createMockRequest(mockUserId),
      );

      expect(result.refundId).toBe('re_test');
      expect(purchaseService.processRefund).toHaveBeenCalledWith(
        'purchase-uuid',
        'Not satisfied',
        mockUserId,
      );
    });

    it('should throw UnauthorizedException when not authenticated', async () => {
      await expect(
        controller.requestRefund('purchase-uuid', { reason: 'test' }, createMockRequest()),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getEarningsSummary', () => {
    it('should return earnings summary', async () => {
      earningsService.getEarningsSummary.mockResolvedValue({
        totalEarningsCents: 5000,
        pendingEarningsCents: 200,
        availableForPayoutCents: 3800,
        totalPayoutsCents: 1000,
        lastPayoutAt: null,
        currency: 'USD',
      });

      const result = await controller.getEarningsSummary(createMockRequest(mockUserId));

      expect(result.totalEarningsCents).toBe(5000);
    });
  });

  describe('getEarningsBreakdown', () => {
    it('should return earnings breakdown with date filters', async () => {
      earningsService.getEarningsBreakdown.mockResolvedValue({
        byTemplate: [],
        byMonth: [],
      });

      await controller.getEarningsBreakdown(
        { startDate: '2026-01-01', endDate: '2026-02-01' },
        createMockRequest(mockUserId),
      );

      expect(earningsService.getEarningsBreakdown).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
      );
    });
  });

  describe('getTransactionHistory', () => {
    it('should pass query parameters to service', async () => {
      earningsService.getTransactionHistory.mockResolvedValue({
        transactions: [],
        total: 0,
      });

      await controller.getTransactionHistory(
        { limit: 25, offset: 10, type: 'sale' },
        createMockRequest(mockUserId),
      );

      expect(earningsService.getTransactionHistory).toHaveBeenCalledWith(
        mockUserId,
        { limit: 25, offset: 10, type: 'sale' },
      );
    });
  });

  describe('getDailyEarnings', () => {
    it('should return daily earnings data', async () => {
      earningsService.getDailyEarnings.mockResolvedValue([
        { date: '2026-02-01', earningsCents: 1000, sales: 2 },
      ]);

      const result = await controller.getDailyEarnings(
        { days: 7 },
        createMockRequest(mockUserId),
      );

      expect(result).toHaveLength(1);
      expect(earningsService.getDailyEarnings).toHaveBeenCalledWith(mockUserId, 7);
    });
  });

  describe('checkPayoutEligibility', () => {
    it('should return payout eligibility', async () => {
      earningsService.canRequestPayout.mockResolvedValue({
        eligible: true,
        availableAmount: 5000,
      });

      const result = await controller.checkPayoutEligibility(createMockRequest(mockUserId));

      expect(result.eligible).toBe(true);
    });

    it('should throw UnauthorizedException when not authenticated', async () => {
      await expect(
        controller.checkPayoutEligibility(createMockRequest()),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
