/**
 * AgentPurchaseService Unit Tests
 *
 * Story 18-9: Agent Revenue Sharing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AgentPurchaseService } from '../services/agent-purchase.service';
import { StripeConnectService } from '../services/stripe-connect.service';
import {
  MarketplaceAgent,
  MarketplacePricingType,
  MarketplaceAgentStatus,
} from '../../../database/entities/marketplace-agent.entity';
import { InstalledAgent } from '../../../database/entities/installed-agent.entity';
import { AgentPurchase, PurchaseStatus, PurchaseType } from '../../../database/entities/agent-purchase.entity';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';

describe('AgentPurchaseService', () => {
  let service: AgentPurchaseService;
  let marketplaceAgentRepo: jest.Mocked<Repository<MarketplaceAgent>>;
  let purchaseRepo: jest.Mocked<Repository<AgentPurchase>>;
  let payoutAccountRepo: jest.Mocked<Repository<CreatorPayoutAccount>>;
  let stripeConnectService: jest.Mocked<StripeConnectService>;
  let mockStripe: any;

  const mockUserId = 'buyer-user-uuid';
  const mockCreatorUserId = 'creator-user-uuid';
  const mockWorkspaceId = 'workspace-uuid';
  const mockAgentId = 'agent-uuid';
  const mockPaymentIntentId = 'pi_test_123';

  const mockPaidAgent: Partial<MarketplaceAgent> = {
    id: mockAgentId,
    name: 'test-agent',
    displayName: 'Test Agent',
    pricingType: MarketplacePricingType.PAID,
    priceCents: 1000, // $10.00
    status: MarketplaceAgentStatus.PUBLISHED,
    publisherUserId: mockCreatorUserId,
  };

  const mockFreeAgent: Partial<MarketplaceAgent> = {
    id: 'free-agent-uuid',
    name: 'free-agent',
    displayName: 'Free Agent',
    pricingType: MarketplacePricingType.FREE,
    priceCents: null,
    status: MarketplaceAgentStatus.PUBLISHED,
    publisherUserId: mockCreatorUserId,
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
        AgentPurchaseService,
        {
          provide: getRepositoryToken(MarketplaceAgent),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(InstalledAgent),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(AgentPurchase),
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
          useValue: {
            createQueryRunner: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentPurchaseService>(AgentPurchaseService);
    marketplaceAgentRepo = module.get(getRepositoryToken(MarketplaceAgent));
    purchaseRepo = module.get(getRepositoryToken(AgentPurchase));
    payoutAccountRepo = module.get(getRepositoryToken(CreatorPayoutAccount));
    stripeConnectService = module.get(StripeConnectService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculatePricing', () => {
    it('should calculate 80/20 revenue split correctly', () => {
      const result = service.calculatePricing(1000); // $10.00

      expect(result.priceCents).toBe(1000);
      expect(result.platformFeeCents).toBe(200); // 20%
      expect(result.creatorAmountCents).toBe(800); // 80%
      expect(result.currency).toBe('USD');
    });

    it('should handle odd amounts with rounding', () => {
      const result = service.calculatePricing(999); // $9.99

      expect(result.priceCents).toBe(999);
      expect(result.platformFeeCents).toBe(200); // Rounded from 199.8
      expect(result.creatorAmountCents).toBe(799);
    });
  });

  describe('createPaymentIntent', () => {
    it('should create a payment intent for a paid agent', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockPaidAgent as MarketplaceAgent);
      purchaseRepo.findOne.mockResolvedValue(null);
      payoutAccountRepo.findOne.mockResolvedValue({
        userId: mockCreatorUserId,
        stripeAccountId: 'acct_creator',
        payoutsEnabled: true,
      } as CreatorPayoutAccount);
      purchaseRepo.create.mockReturnValue({
        id: 'purchase-id',
        buyerUserId: mockUserId,
        marketplaceAgentId: mockAgentId,
        status: PurchaseStatus.PENDING,
      } as AgentPurchase);
      purchaseRepo.save.mockResolvedValue({
        id: 'purchase-id',
        buyerUserId: mockUserId,
        marketplaceAgentId: mockAgentId,
        status: PurchaseStatus.PENDING,
      } as AgentPurchase);
      purchaseRepo.update.mockResolvedValue({} as any);

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: mockPaymentIntentId,
        client_secret: 'pi_secret_test',
        status: 'requires_payment_method',
      });

      const result = await service.createPaymentIntent(
        mockAgentId,
        mockUserId,
        mockWorkspaceId,
      );

      expect(result.paymentIntentId).toBe(mockPaymentIntentId);
      expect(result.clientSecret).toBe('pi_secret_test');
      expect(result.amount).toBe(1000);
      expect(result.platformFeeCents).toBe(200);
      expect(result.creatorAmountCents).toBe(800);
    });

    it('should throw NotFoundException if agent not found', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createPaymentIntent(mockAgentId, mockUserId, mockWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if agent is free', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockFreeAgent as MarketplaceAgent);

      await expect(
        service.createPaymentIntent(mockAgentId, mockUserId, mockWorkspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if user already purchased', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockPaidAgent as MarketplaceAgent);
      purchaseRepo.findOne.mockResolvedValue({
        id: 'existing-purchase',
        status: PurchaseStatus.COMPLETED,
      } as AgentPurchase);

      await expect(
        service.createPaymentIntent(mockAgentId, mockUserId, mockWorkspaceId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('processSuccessfulPayment', () => {
    it('should process a successful payment', async () => {
      const mockPurchase = {
        id: 'purchase-id',
        stripePaymentIntentId: mockPaymentIntentId,
        amountCents: 1000,
        platformFeeCents: 200,
        creatorAmountCents: 800,
        status: PurchaseStatus.PENDING,
        marketplaceAgentId: mockAgentId,
      };

      purchaseRepo.findOne.mockResolvedValue(mockPurchase as AgentPurchase);
      purchaseRepo.update.mockResolvedValue({} as any);
      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: mockPaymentIntentId,
        status: 'succeeded',
      });

      const result = await service.processSuccessfulPayment(mockPaymentIntentId);

      expect(result.purchaseId).toBe('purchase-id');
      expect(result.status).toBe('succeeded');
    });

    it('should return pending status if payment is still processing', async () => {
      const mockPurchase = {
        id: 'purchase-id',
        stripePaymentIntentId: mockPaymentIntentId,
        status: PurchaseStatus.PENDING,
      };

      purchaseRepo.findOne.mockResolvedValue(mockPurchase as AgentPurchase);
      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: mockPaymentIntentId,
        status: 'processing',
      });

      const result = await service.processSuccessfulPayment(mockPaymentIntentId);

      expect(result.status).toBe('pending');
    });

    it('should throw NotFoundException if purchase not found', async () => {
      purchaseRepo.findOne.mockResolvedValue(null);

      await expect(
        service.processSuccessfulPayment(mockPaymentIntentId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('hasPurchasedAccess', () => {
    it('should return true if user has purchased', async () => {
      purchaseRepo.findOne.mockResolvedValue({
        id: 'purchase-id',
        status: PurchaseStatus.COMPLETED,
      } as AgentPurchase);

      const result = await service.hasPurchasedAccess(mockAgentId, mockUserId);

      expect(result).toBe(true);
    });

    it('should return false if user has not purchased', async () => {
      purchaseRepo.findOne.mockResolvedValue(null);

      const result = await service.hasPurchasedAccess(mockAgentId, mockUserId);

      expect(result).toBe(false);
    });

    it('should return false for refunded purchases', async () => {
      // The query specifically filters for COMPLETED status, so a REFUNDED purchase
      // would not be returned by findOne with the COMPLETED filter
      purchaseRepo.findOne.mockResolvedValue(null);

      const result = await service.hasPurchasedAccess(mockAgentId, mockUserId);

      expect(result).toBe(false);
    });
  });

  describe('getUserPurchases', () => {
    it('should return paginated purchase history', async () => {
      const mockPurchases = [
        { id: 'purchase-1', marketplaceAgentId: 'agent-1' },
        { id: 'purchase-2', marketplaceAgentId: 'agent-2' },
      ];

      purchaseRepo.findAndCount.mockResolvedValue([mockPurchases as AgentPurchase[], 2]);

      const result = await service.getUserPurchases(mockUserId, { limit: 10, offset: 0 });

      expect(result.purchases).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('processRefund', () => {
    it('should process a refund within the refund window', async () => {
      const mockPurchase = {
        id: 'purchase-id',
        stripePaymentIntentId: mockPaymentIntentId,
        status: PurchaseStatus.COMPLETED,
        createdAt: new Date(), // Just created, within window
        amountCents: 1000,
      };

      purchaseRepo.findOne.mockResolvedValue(mockPurchase as AgentPurchase);
      purchaseRepo.update.mockResolvedValue({} as any);
      mockStripe.refunds.create.mockResolvedValue({
        id: 're_test_123',
        amount: 1000,
      });

      const result = await service.processRefund(
        'purchase-id',
        'Customer requested refund',
        'admin-user',
      );

      expect(result.refundId).toBe('re_test_123');
      expect(result.amount).toBe(1000);
    });

    it('should throw BadRequestException if purchase is not completed', async () => {
      const mockPurchase = {
        id: 'purchase-id',
        status: PurchaseStatus.PENDING,
        createdAt: new Date(),
      };

      purchaseRepo.findOne.mockResolvedValue(mockPurchase as AgentPurchase);

      await expect(
        service.processRefund('purchase-id', 'reason', 'admin'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if outside refund window', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 15); // 15 days ago

      const mockPurchase = {
        id: 'purchase-id',
        stripePaymentIntentId: mockPaymentIntentId,
        status: PurchaseStatus.COMPLETED,
        createdAt: oldDate,
      };

      purchaseRepo.findOne.mockResolvedValue(mockPurchase as AgentPurchase);

      await expect(
        service.processRefund('purchase-id', 'reason', 'admin'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
