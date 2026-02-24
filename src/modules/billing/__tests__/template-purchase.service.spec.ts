/**
 * TemplatePurchaseService Unit Tests
 *
 * Story 19-10: Template Revenue Sharing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TemplatePurchaseService } from '../services/template-purchase.service';
import { StripeConnectService } from '../services/stripe-connect.service';
import { Template, TemplatePricingType } from '../../../database/entities/template.entity';
import { TemplatePurchase, TemplatePurchaseStatus } from '../../../database/entities/template-purchase.entity';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';

describe('TemplatePurchaseService', () => {
  let service: TemplatePurchaseService;
  let templateRepo: jest.Mocked<Repository<Template>>;
  let purchaseRepo: jest.Mocked<Repository<TemplatePurchase>>;
  let payoutAccountRepo: jest.Mocked<Repository<CreatorPayoutAccount>>;
  let stripeConnectService: jest.Mocked<StripeConnectService>;
  let mockStripe: any;

  const mockBuyerUserId = 'buyer-user-uuid';
  const mockCreatorUserId = 'creator-user-uuid';
  const mockWorkspaceId = 'workspace-uuid';
  const mockTemplateId = 'template-uuid';
  const mockPaymentIntentId = 'pi_test_123';

  const mockPaidTemplate: Partial<Template> = {
    id: mockTemplateId,
    name: 'premium-template',
    displayName: 'Premium Template',
    pricingType: TemplatePricingType.PAID,
    priceCents: 1000, // $10.00
    isPublished: true,
    createdBy: mockCreatorUserId,
  };

  const mockFreeTemplate: Partial<Template> = {
    id: 'free-template-uuid',
    name: 'free-template',
    displayName: 'Free Template',
    pricingType: TemplatePricingType.FREE,
    priceCents: null,
    isPublished: true,
    createdBy: mockCreatorUserId,
  };

  const mockPurchase: Partial<TemplatePurchase> = {
    id: 'purchase-uuid',
    buyerUserId: mockBuyerUserId,
    buyerWorkspaceId: mockWorkspaceId,
    templateId: mockTemplateId,
    sellerUserId: mockCreatorUserId,
    stripePaymentIntentId: mockPaymentIntentId,
    amountCents: 1000,
    platformFeeCents: 200,
    creatorAmountCents: 800,
    currency: 'USD',
    status: TemplatePurchaseStatus.PENDING,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockStripe = {
      paymentIntents: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
      refunds: {
        create: jest.fn(),
      },
    };

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const mockRepo = () => ({
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(() => mockQueryBuilder),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatePurchaseService,
        {
          provide: getRepositoryToken(Template),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(TemplatePurchase),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(CreatorPayoutAccount),
          useValue: mockRepo(),
        },
        {
          provide: StripeConnectService,
          useValue: {
            getStripeClient: jest.fn(() => mockStripe),
            isConfigured: jest.fn(() => true),
          },
        },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TemplatePurchaseService>(TemplatePurchaseService);
    templateRepo = module.get(getRepositoryToken(Template));
    purchaseRepo = module.get(getRepositoryToken(TemplatePurchase));
    payoutAccountRepo = module.get(getRepositoryToken(CreatorPayoutAccount));
    stripeConnectService = module.get(StripeConnectService) as jest.Mocked<StripeConnectService>;
  });

  describe('calculatePricing', () => {
    it('should calculate 80/20 revenue split correctly', () => {
      const result = service.calculatePricing(1000);
      expect(result.priceCents).toBe(1000);
      expect(result.platformFeeCents).toBe(200);
      expect(result.creatorAmountCents).toBe(800);
      expect(result.currency).toBe('USD');
    });

    it('should round platform fee for odd amounts', () => {
      const result = service.calculatePricing(999);
      expect(result.platformFeeCents).toBe(200);
      expect(result.creatorAmountCents).toBe(799);
    });

    it('should handle minimum price', () => {
      const result = service.calculatePricing(500);
      expect(result.platformFeeCents).toBe(100);
      expect(result.creatorAmountCents).toBe(400);
    });

    it('should handle maximum price', () => {
      const result = service.calculatePricing(49999);
      expect(result.platformFeeCents).toBe(10000);
      expect(result.creatorAmountCents).toBe(39999);
    });
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent for paid template', async () => {
      templateRepo.findOne.mockResolvedValue(mockPaidTemplate as Template);
      purchaseRepo.findOne.mockResolvedValue(null);
      payoutAccountRepo.findOne.mockResolvedValue({
        payoutsEnabled: true,
        stripeAccountId: 'acct_test_123',
      } as CreatorPayoutAccount);
      purchaseRepo.create.mockReturnValue(mockPurchase as TemplatePurchase);
      purchaseRepo.save.mockResolvedValue(mockPurchase as TemplatePurchase);
      purchaseRepo.update.mockResolvedValue({} as any);

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: mockPaymentIntentId,
        client_secret: 'pi_secret_test',
      });

      const result = await service.createPaymentIntent(
        mockTemplateId,
        mockBuyerUserId,
        mockWorkspaceId,
      );

      expect(result.paymentIntentId).toBe(mockPaymentIntentId);
      expect(result.clientSecret).toBe('pi_secret_test');
      expect(result.amount).toBe(1000);
      expect(result.currency).toBe('USD');
      expect(result.platformFeeCents).toBe(200);
      expect(result.creatorAmountCents).toBe(800);
    });

    it('should throw NotFoundException for non-existent template', async () => {
      templateRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createPaymentIntent(mockTemplateId, mockBuyerUserId, mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for free template', async () => {
      templateRepo.findOne.mockResolvedValue(mockFreeTemplate as Template);

      await expect(
        service.createPaymentIntent('free-template-uuid', mockBuyerUserId, mockWorkspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for unpublished template', async () => {
      templateRepo.findOne.mockResolvedValue({
        ...mockPaidTemplate,
        isPublished: false,
      } as Template);

      await expect(
        service.createPaymentIntent(mockTemplateId, mockBuyerUserId, mockWorkspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for self-purchase', async () => {
      templateRepo.findOne.mockResolvedValue(mockPaidTemplate as Template);

      await expect(
        service.createPaymentIntent(mockTemplateId, mockCreatorUserId, mockWorkspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already purchased', async () => {
      templateRepo.findOne.mockResolvedValue(mockPaidTemplate as Template);
      purchaseRepo.findOne.mockResolvedValue(mockPurchase as TemplatePurchase);

      await expect(
        service.createPaymentIntent(mockTemplateId, mockBuyerUserId, mockWorkspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include transfer_data when creator has Stripe Connect', async () => {
      templateRepo.findOne.mockResolvedValue(mockPaidTemplate as Template);
      purchaseRepo.findOne.mockResolvedValue(null);
      payoutAccountRepo.findOne.mockResolvedValue({
        payoutsEnabled: true,
        stripeAccountId: 'acct_test_123',
      } as CreatorPayoutAccount);
      purchaseRepo.create.mockReturnValue(mockPurchase as TemplatePurchase);
      purchaseRepo.save.mockResolvedValue(mockPurchase as TemplatePurchase);
      purchaseRepo.update.mockResolvedValue({} as any);

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: mockPaymentIntentId,
        client_secret: 'pi_secret_test',
      });

      await service.createPaymentIntent(mockTemplateId, mockBuyerUserId, mockWorkspaceId);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          application_fee_amount: 200,
          transfer_data: { destination: 'acct_test_123' },
          metadata: expect.objectContaining({ purchase_type: 'template' }),
        }),
      );
    });

    it('should mark purchase as failed when Stripe errors', async () => {
      templateRepo.findOne.mockResolvedValue(mockPaidTemplate as Template);
      purchaseRepo.findOne.mockResolvedValue(null);
      payoutAccountRepo.findOne.mockResolvedValue(null);
      purchaseRepo.create.mockReturnValue(mockPurchase as TemplatePurchase);
      purchaseRepo.save.mockResolvedValue(mockPurchase as TemplatePurchase);
      purchaseRepo.update.mockResolvedValue({} as any);

      mockStripe.paymentIntents.create.mockRejectedValue(new Error('Stripe error'));

      await expect(
        service.createPaymentIntent(mockTemplateId, mockBuyerUserId, mockWorkspaceId),
      ).rejects.toThrow(BadRequestException);

      expect(purchaseRepo.update).toHaveBeenCalledWith(
        { id: mockPurchase.id },
        { status: TemplatePurchaseStatus.FAILED },
      );
    });
  });

  describe('processSuccessfulPayment', () => {
    it('should process successful payment and mark as completed', async () => {
      purchaseRepo.findOne.mockResolvedValue({
        ...mockPurchase,
        status: TemplatePurchaseStatus.PENDING,
      } as TemplatePurchase);
      purchaseRepo.update.mockResolvedValue({} as any);

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: mockPaymentIntentId,
        status: 'succeeded',
        latest_charge: null,
      });

      const result = await service.processSuccessfulPayment(mockPaymentIntentId);

      expect(result.status).toBe('succeeded');
      expect(result.purchaseId).toBe(mockPurchase.id);
      expect(purchaseRepo.update).toHaveBeenCalledWith(
        { id: mockPurchase.id },
        { status: TemplatePurchaseStatus.COMPLETED },
      );
    });

    it('should be idempotent for already-completed purchases', async () => {
      purchaseRepo.findOne.mockResolvedValue({
        ...mockPurchase,
        status: TemplatePurchaseStatus.COMPLETED,
      } as TemplatePurchase);

      const result = await service.processSuccessfulPayment(mockPaymentIntentId);

      expect(result.status).toBe('succeeded');
      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for unknown payment intent', async () => {
      purchaseRepo.findOne.mockResolvedValue(null);

      await expect(
        service.processSuccessfulPayment('pi_unknown'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return pending status for processing payment intent', async () => {
      purchaseRepo.findOne.mockResolvedValue({
        ...mockPurchase,
        status: TemplatePurchaseStatus.PENDING,
      } as TemplatePurchase);

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: mockPaymentIntentId,
        status: 'processing',
      });

      const result = await service.processSuccessfulPayment(mockPaymentIntentId);
      expect(result.status).toBe('pending');
    });
  });

  describe('hasPurchasedAccess', () => {
    it('should return true when user has completed purchase', async () => {
      purchaseRepo.findOne.mockResolvedValue({
        ...mockPurchase,
        status: TemplatePurchaseStatus.COMPLETED,
      } as TemplatePurchase);

      const result = await service.hasPurchasedAccess(mockTemplateId, mockBuyerUserId);
      expect(result).toBe(true);
    });

    it('should return false when no purchase exists', async () => {
      purchaseRepo.findOne.mockResolvedValue(null);

      const result = await service.hasPurchasedAccess(mockTemplateId, mockBuyerUserId);
      expect(result).toBe(false);
    });
  });

  describe('getUserTemplatePurchases', () => {
    it('should return paginated purchase history', async () => {
      purchaseRepo.findAndCount.mockResolvedValue([
        [mockPurchase as TemplatePurchase],
        1,
      ]);

      const result = await service.getUserTemplatePurchases(mockBuyerUserId, { limit: 10, offset: 0 });

      expect(result.purchases).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should use default pagination when not specified', async () => {
      purchaseRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getUserTemplatePurchases(mockBuyerUserId);

      expect(purchaseRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
        }),
      );
    });
  });

  describe('processRefund', () => {
    const completedPurchase = {
      ...mockPurchase,
      status: TemplatePurchaseStatus.COMPLETED,
      createdAt: new Date(), // Recent purchase (within 7-day window)
    };

    it('should process refund within window', async () => {
      purchaseRepo.findOne.mockResolvedValue(completedPurchase as TemplatePurchase);
      purchaseRepo.update.mockResolvedValue({} as any);

      mockStripe.refunds.create.mockResolvedValue({
        id: 're_test_123',
        amount: 1000,
      });

      const result = await service.processRefund(
        'purchase-uuid',
        'Not satisfied',
        mockBuyerUserId,
      );

      expect(result.refundId).toBe('re_test_123');
      expect(result.amount).toBe(1000);
      expect(purchaseRepo.update).toHaveBeenCalledWith(
        { id: 'purchase-uuid' },
        expect.objectContaining({
          status: TemplatePurchaseStatus.REFUNDED,
          refundReason: 'Not satisfied',
          refundedBy: mockBuyerUserId,
        }),
      );
    });

    it('should throw NotFoundException for unknown purchase', async () => {
      purchaseRepo.findOne.mockResolvedValue(null);

      await expect(
        service.processRefund('unknown', 'reason', mockBuyerUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-buyer requests refund', async () => {
      purchaseRepo.findOne.mockResolvedValue(completedPurchase as TemplatePurchase);

      await expect(
        service.processRefund('purchase-uuid', 'reason', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for non-completed purchase', async () => {
      purchaseRepo.findOne.mockResolvedValue({
        ...mockPurchase,
        buyerUserId: mockBuyerUserId,
        status: TemplatePurchaseStatus.PENDING,
      } as TemplatePurchase);

      await expect(
        service.processRefund('purchase-uuid', 'reason', mockBuyerUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when refund window expired', async () => {
      const oldPurchase = {
        ...completedPurchase,
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      };
      purchaseRepo.findOne.mockResolvedValue(oldPurchase as TemplatePurchase);

      await expect(
        service.processRefund('purchase-uuid', 'reason', mockBuyerUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCreatorTemplatePurchases', () => {
    it('should query purchases for creator with date filters', async () => {
      const mockQueryBuilder = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      purchaseRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-02-01');

      await service.getCreatorTemplatePurchases(mockCreatorUserId, { startDate, endDate });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'purchase.sellerUserId = :creatorUserId',
        { creatorUserId: mockCreatorUserId },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(3); // status + startDate + endDate
    });
  });
});
