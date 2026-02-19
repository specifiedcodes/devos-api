/**
 * PayoutService Unit Tests
 *
 * Story 18-9: Agent Revenue Sharing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayoutService } from '../services/payout.service';
import { StripeConnectService } from '../services/stripe-connect.service';
import { CreatorEarningsService } from '../services/creator-earnings.service';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';
import { PayoutTransaction, PayoutStatus } from '../../../database/entities/payout-transaction.entity';
import { AgentPurchase } from '../../../database/entities/agent-purchase.entity';

describe('PayoutService', () => {
  let service: PayoutService;
  let payoutAccountRepo: jest.Mocked<Repository<CreatorPayoutAccount>>;
  let payoutTxRepo: jest.Mocked<Repository<PayoutTransaction>>;
  let purchaseRepo: jest.Mocked<Repository<AgentPurchase>>;
  let stripeConnectService: jest.Mocked<StripeConnectService>;
  let creatorEarningsService: jest.Mocked<CreatorEarningsService>;
  let mockStripe: any;

  const mockCreatorUserId = 'creator-user-uuid';
  const mockPayoutAccountId = 'payout-account-uuid';
  const mockStripeAccountId = 'acct_test_123';

  beforeEach(async () => {
    mockStripe = {
      payouts: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutService,
        {
          provide: getRepositoryToken(CreatorPayoutAccount),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PayoutTransaction),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AgentPurchase),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: StripeConnectService,
          useValue: {
            getStripeClient: jest.fn(() => mockStripe),
            isConfigured: jest.fn(() => true),
          },
        },
        {
          provide: CreatorEarningsService,
          useValue: {
            canRequestPayout: jest.fn(),
            getEarningsSummary: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PayoutService>(PayoutService);
    payoutAccountRepo = module.get(getRepositoryToken(CreatorPayoutAccount));
    payoutTxRepo = module.get(getRepositoryToken(PayoutTransaction));
    purchaseRepo = module.get(getRepositoryToken(AgentPurchase));
    stripeConnectService = module.get(StripeConnectService);
    creatorEarningsService = module.get(CreatorEarningsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestPayout', () => {
    it('should create and process a payout request', async () => {
      const savedPayout = {
        id: 'payout-tx-id',
        payoutAccountId: mockPayoutAccountId,
        stripePayoutId: null,
        amountCents: 5000,
        currency: 'USD',
        status: PayoutStatus.PENDING,
        description: null,
        failureReason: null,
        processedAt: null,
        completedAt: null,
        createdAt: new Date(),
      };

      creatorEarningsService.canRequestPayout.mockResolvedValue({
        eligible: true,
        availableAmount: 5000, // $50.00
      });

      payoutAccountRepo.findOne.mockResolvedValue({
        id: mockPayoutAccountId,
        userId: mockCreatorUserId,
        stripeAccountId: mockStripeAccountId,
        payoutsEnabled: true,
      } as CreatorPayoutAccount);

      payoutTxRepo.findOne
        .mockResolvedValueOnce(null) // No PENDING payouts (first check)
        .mockResolvedValueOnce(null) // No PROCESSING payouts (second check)
        .mockResolvedValueOnce(savedPayout); // Lookup in processPayout

      payoutTxRepo.create.mockReturnValue(savedPayout as PayoutTransaction);

      payoutTxRepo.save.mockResolvedValue(savedPayout as PayoutTransaction);

      payoutTxRepo.update.mockResolvedValue({} as any);

      mockStripe.payouts.create.mockResolvedValue({
        id: 'po_test_123',
        status: 'pending',
      });

      const result = await service.requestPayout(mockCreatorUserId);

      expect(result.payoutId).toBe('payout-tx-id');
      expect(result.amountCents).toBe(5000);
      expect(result.status).toBe(PayoutStatus.PROCESSING);
    });

    it('should throw BadRequestException if not eligible', async () => {
      creatorEarningsService.canRequestPayout.mockResolvedValue({
        eligible: false,
        availableAmount: 500,
        reason: 'Minimum payout threshold is $10.00',
      });

      await expect(service.requestPayout(mockCreatorUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if no payout account exists', async () => {
      creatorEarningsService.canRequestPayout.mockResolvedValue({
        eligible: true,
        availableAmount: 5000,
      });

      payoutAccountRepo.findOne.mockResolvedValue(null);

      await expect(service.requestPayout(mockCreatorUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if there is a pending payout', async () => {
      creatorEarningsService.canRequestPayout.mockResolvedValue({
        eligible: true,
        availableAmount: 5000,
      });

      payoutAccountRepo.findOne.mockResolvedValue({
        id: mockPayoutAccountId,
        userId: mockCreatorUserId,
        stripeAccountId: mockStripeAccountId,
        payoutsEnabled: true,
      } as CreatorPayoutAccount);

      payoutTxRepo.findOne.mockResolvedValue({
        id: 'existing-payout',
        status: PayoutStatus.PENDING,
      } as PayoutTransaction);

      await expect(service.requestPayout(mockCreatorUserId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getPayoutHistory', () => {
    it('should return paginated payout history', async () => {
      payoutAccountRepo.findOne.mockResolvedValue({
        id: mockPayoutAccountId,
        userId: mockCreatorUserId,
      } as CreatorPayoutAccount);

      const mockPayouts = [
        {
          id: 'payout-1',
          amountCents: 5000,
          status: PayoutStatus.COMPLETED,
          createdAt: new Date('2026-01-15'),
        },
        {
          id: 'payout-2',
          amountCents: 3000,
          status: PayoutStatus.PROCESSING,
          createdAt: new Date('2026-01-20'),
        },
      ];

      payoutTxRepo.findAndCount.mockResolvedValue([mockPayouts as PayoutTransaction[], 2]);

      const result = await service.getPayoutHistory(mockCreatorUserId, {
        limit: 10,
        offset: 0,
      });

      expect(result.payouts).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty array if no payout account exists', async () => {
      payoutAccountRepo.findOne.mockResolvedValue(null);

      const result = await service.getPayoutHistory(mockCreatorUserId);

      expect(result.payouts).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('calculateAvailableBalance', () => {
    it('should return available balance', async () => {
      creatorEarningsService.getEarningsSummary.mockResolvedValue({
        totalEarningsCents: 10000,
        pendingEarningsCents: 2000,
        availableForPayoutCents: 5000,
        totalPayoutsCents: 3000,
        lastPayoutAt: new Date('2026-01-15'),
        currency: 'USD',
      });

      const result = await service.calculateAvailableBalance(mockCreatorUserId);

      expect(result.availableCents).toBe(5000);
      expect(result.pendingCents).toBe(2000);
      expect(result.totalEarnedCents).toBe(10000);
    });
  });

  describe('getPayout', () => {
    it('should return a specific payout', async () => {
      payoutAccountRepo.findOne.mockResolvedValue({
        id: mockPayoutAccountId,
        userId: mockCreatorUserId,
      } as CreatorPayoutAccount);

      const mockPayout = {
        id: 'payout-1',
        payoutAccountId: mockPayoutAccountId,
        amountCents: 5000,
        status: PayoutStatus.COMPLETED,
      };

      payoutTxRepo.findOne.mockResolvedValue(mockPayout as PayoutTransaction);

      const result = await service.getPayout('payout-1', mockCreatorUserId);

      expect(result.id).toBe('payout-1');
      expect(result.amountCents).toBe(5000);
    });

    it('should throw NotFoundException if payout account not found', async () => {
      payoutAccountRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getPayout('payout-1', mockCreatorUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if payout not found', async () => {
      payoutAccountRepo.findOne.mockResolvedValue({
        id: mockPayoutAccountId,
        userId: mockCreatorUserId,
      } as CreatorPayoutAccount);

      payoutTxRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getPayout('payout-1', mockCreatorUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('handlePayoutWebhook', () => {
    it('should handle payout.paid webhook', async () => {
      const mockPayoutTx = {
        id: 'payout-tx-id',
        stripePayoutId: 'po_test_123',
        status: PayoutStatus.PROCESSING,
      };

      payoutTxRepo.findOne.mockResolvedValue(mockPayoutTx as PayoutTransaction);
      payoutTxRepo.update.mockResolvedValue({} as any);

      await service.handlePayoutWebhook({
        type: 'payout.paid',
        data: {
          object: {
            id: 'po_test_123',
          } as any,
        },
      } as any);

      expect(payoutTxRepo.update).toHaveBeenCalledWith(
        { id: 'payout-tx-id' },
        expect.objectContaining({
          status: PayoutStatus.COMPLETED,
        }),
      );
    });

    it('should handle payout.failed webhook', async () => {
      const mockPayoutTx = {
        id: 'payout-tx-id',
        stripePayoutId: 'po_test_123',
        status: PayoutStatus.PROCESSING,
      };

      payoutTxRepo.findOne.mockResolvedValue(mockPayoutTx as PayoutTransaction);
      payoutTxRepo.update.mockResolvedValue({} as any);

      await service.handlePayoutWebhook({
        type: 'payout.failed',
        data: {
          object: {
            id: 'po_test_123',
            failure_message: 'Bank account closed',
          } as any,
        },
      } as any);

      expect(payoutTxRepo.update).toHaveBeenCalledWith(
        { id: 'payout-tx-id' },
        expect.objectContaining({
          status: PayoutStatus.FAILED,
          failureReason: 'Bank account closed',
        }),
      );
    });

    it('should handle payout.canceled webhook', async () => {
      const mockPayoutTx = {
        id: 'payout-tx-id',
        stripePayoutId: 'po_test_123',
        status: PayoutStatus.PROCESSING,
      };

      payoutTxRepo.findOne.mockResolvedValue(mockPayoutTx as PayoutTransaction);
      payoutTxRepo.update.mockResolvedValue({} as any);

      await service.handlePayoutWebhook({
        type: 'payout.canceled',
        data: {
          object: {
            id: 'po_test_123',
          } as any,
        },
      } as any);

      expect(payoutTxRepo.update).toHaveBeenCalledWith(
        { id: 'payout-tx-id' },
        expect.objectContaining({
          status: PayoutStatus.CANCELLED,
        }),
      );
    });
  });

  describe('processAutomaticPayouts', () => {
    it('should process automatic payouts for eligible creators', async () => {
      const savedPayout = {
        id: 'auto-payout-id',
        payoutAccountId: mockPayoutAccountId,
        stripePayoutId: null,
        amountCents: 5000,
        currency: 'USD',
        status: PayoutStatus.PENDING,
        description: null,
        failureReason: null,
        processedAt: null,
        completedAt: null,
        createdAt: new Date(),
      };

      payoutAccountRepo.find.mockResolvedValue([
        {
          id: mockPayoutAccountId,
          userId: mockCreatorUserId,
          stripeAccountId: mockStripeAccountId,
          payoutsEnabled: true,
        },
      ] as CreatorPayoutAccount[]);

      creatorEarningsService.canRequestPayout.mockResolvedValue({
        eligible: true,
        availableAmount: 5000,
      });

      payoutTxRepo.findOne
        .mockResolvedValueOnce(null) // No existing PROCESSING payouts (first check in processAutomaticPayouts)
        .mockResolvedValueOnce(savedPayout); // Lookup in processPayout

      payoutTxRepo.create.mockReturnValue(savedPayout as PayoutTransaction);
      payoutTxRepo.save.mockResolvedValue(savedPayout as PayoutTransaction);
      payoutTxRepo.update.mockResolvedValue({} as any);

      mockStripe.payouts.create.mockResolvedValue({
        id: 'po_auto_123',
      });

      const result = await service.processAutomaticPayouts();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should skip creators below minimum threshold', async () => {
      payoutAccountRepo.find.mockResolvedValue([
        {
          id: mockPayoutAccountId,
          userId: mockCreatorUserId,
          payoutsEnabled: true,
        },
      ] as CreatorPayoutAccount[]);

      creatorEarningsService.canRequestPayout.mockResolvedValue({
        eligible: false,
        availableAmount: 500, // Below $10 minimum
        reason: 'Below threshold',
      });

      const result = await service.processAutomaticPayouts();

      expect(result.processed).toBe(0);
    });

    it('should skip creators with existing processing payouts', async () => {
      payoutAccountRepo.find.mockResolvedValue([
        {
          id: mockPayoutAccountId,
          userId: mockCreatorUserId,
          payoutsEnabled: true,
        },
      ] as CreatorPayoutAccount[]);

      creatorEarningsService.canRequestPayout.mockResolvedValue({
        eligible: true,
        availableAmount: 5000,
      });

      payoutTxRepo.findOne.mockResolvedValue({
        id: 'existing-payout',
        status: PayoutStatus.PROCESSING,
      } as PayoutTransaction);

      const result = await service.processAutomaticPayouts();

      expect(result.processed).toBe(0);
    });
  });
});
