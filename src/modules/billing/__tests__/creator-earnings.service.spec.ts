/**
 * CreatorEarningsService Unit Tests
 *
 * Story 18-9: Agent Revenue Sharing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreatorEarningsService } from '../services/creator-earnings.service';
import { AgentPurchase, PurchaseStatus } from '../../../database/entities/agent-purchase.entity';
import { PayoutTransaction, PayoutStatus } from '../../../database/entities/payout-transaction.entity';
import { MarketplaceAgent } from '../../../database/entities/marketplace-agent.entity';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';

describe('CreatorEarningsService', () => {
  let service: CreatorEarningsService;
  let purchaseRepo: jest.Mocked<Repository<AgentPurchase>>;
  let payoutRepo: jest.Mocked<Repository<PayoutTransaction>>;
  let marketplaceAgentRepo: jest.Mocked<Repository<MarketplaceAgent>>;
  let payoutAccountRepo: jest.Mocked<Repository<CreatorPayoutAccount>>;

  const mockCreatorUserId = 'creator-user-uuid';

  const mockQueryBuilder = () => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getCount: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorEarningsService,
        {
          provide: getRepositoryToken(AgentPurchase),
          useValue: {
            createQueryBuilder: jest.fn(() => mockQueryBuilder()),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PayoutTransaction),
          useValue: {
            createQueryBuilder: jest.fn(() => mockQueryBuilder()),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MarketplaceAgent),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CreatorPayoutAccount),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CreatorEarningsService>(CreatorEarningsService);
    purchaseRepo = module.get(getRepositoryToken(AgentPurchase));
    payoutRepo = module.get(getRepositoryToken(PayoutTransaction));
    marketplaceAgentRepo = module.get(getRepositoryToken(MarketplaceAgent));
    payoutAccountRepo = module.get(getRepositoryToken(CreatorPayoutAccount));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getEarningsSummary', () => {
    it('should return earnings summary with correct calculations', async () => {
      // Mock total earnings query
      const mockPurchaseQb = mockQueryBuilder();
      (purchaseRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockPurchaseQb)
        .mockReturnValueOnce(mockPurchaseQb);

      mockPurchaseQb.getRawOne
        .mockResolvedValueOnce({ totalEarnings: '8000' }) // Total earnings
        .mockResolvedValueOnce({ refundedEarnings: '500' }); // Refunded

      // Mock payout queries
      const mockPayoutQb = mockQueryBuilder();
      (payoutRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockPayoutQb)
        .mockReturnValueOnce(mockPayoutQb)
        .mockReturnValueOnce(mockPayoutQb);

      mockPayoutQb.getRawOne
        .mockResolvedValueOnce({ totalPayouts: '3000' }) // Total payouts
        .mockResolvedValueOnce({ pendingPayouts: '500' }); // Pending

      mockPayoutQb.getOne.mockResolvedValueOnce({
        completedAt: new Date('2026-01-15'),
      });

      const result = await service.getEarningsSummary(mockCreatorUserId);

      expect(result.totalEarningsCents).toBe(8000);
      // available = total - refunded - payouts - pending = 8000 - 500 - 3000 - 500 = 4000
      expect(result.availableForPayoutCents).toBe(4000);
      expect(result.totalPayoutsCents).toBe(3000);
      expect(result.pendingEarningsCents).toBe(500);
      expect(result.currency).toBe('USD');
    });

    it('should handle zero earnings', async () => {
      const mockPurchaseQb = mockQueryBuilder();
      (purchaseRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockPurchaseQb)
        .mockReturnValueOnce(mockPurchaseQb);

      mockPurchaseQb.getRawOne
        .mockResolvedValueOnce({ totalEarnings: null })
        .mockResolvedValueOnce({ refundedEarnings: null });

      const mockPayoutQb = mockQueryBuilder();
      (payoutRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockPayoutQb)
        .mockReturnValueOnce(mockPayoutQb)
        .mockReturnValueOnce(mockPayoutQb);

      mockPayoutQb.getRawOne
        .mockResolvedValueOnce({ totalPayouts: null })
        .mockResolvedValueOnce({ pendingPayouts: null });
      mockPayoutQb.getOne.mockResolvedValueOnce(null);

      const result = await service.getEarningsSummary(mockCreatorUserId);

      expect(result.totalEarningsCents).toBe(0);
      expect(result.availableForPayoutCents).toBe(0);
      expect(result.lastPayoutAt).toBeNull();
    });
  });

  describe('getEarningsBreakdown', () => {
    it('should return earnings breakdown by agent and month', async () => {
      const mockPurchaseQb = mockQueryBuilder();
      (purchaseRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockPurchaseQb)
        .mockReturnValueOnce(mockPurchaseQb);

      mockPurchaseQb.getRawMany
        .mockResolvedValueOnce([
          { agentId: 'agent-1', agentName: 'Agent One', totalSales: '10', totalEarnings: '5000' },
          { agentId: 'agent-2', agentName: 'Agent Two', totalSales: '5', totalEarnings: '3000' },
        ])
        .mockResolvedValueOnce([
          { month: '2026-01', sales: '8', earnings: '4000' },
          { month: '2025-12', sales: '7', earnings: '4000' },
        ]);

      const result = await service.getEarningsBreakdown(mockCreatorUserId);

      expect(result.byAgent).toHaveLength(2);
      expect(result.byAgent[0].agentName).toBe('Agent One');
      expect(result.byAgent[0].totalSales).toBe(10);
      expect(result.byAgent[0].totalEarningsCents).toBe(5000);

      expect(result.byMonth).toHaveLength(2);
      expect(result.byMonth[0].month).toBe('2026-01');
    });

    it('should filter by date range', async () => {
      const mockPurchaseQb = mockQueryBuilder();
      (purchaseRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockPurchaseQb)
        .mockReturnValueOnce(mockPurchaseQb);

      mockPurchaseQb.getRawMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      await service.getEarningsBreakdown(mockCreatorUserId, { startDate, endDate });

      // Verify andWhere was called with date filters
      expect(mockPurchaseQb.andWhere).toHaveBeenCalled();
    });
  });

  describe('getTransactionHistory', () => {
    it('should return transaction history with sales and payouts', async () => {
      const mockPurchaseQb = mockQueryBuilder();
      const mockPayoutQb = mockQueryBuilder();

      (purchaseRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockPurchaseQb);
      (payoutRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockPayoutQb);

      mockPurchaseQb.getRawMany.mockResolvedValueOnce([
        {
          id: 'purchase-1',
          amountCents: 800,
          createdAt: new Date('2026-01-15'),
          status: PurchaseStatus.COMPLETED,
          agentName: 'Test Agent',
        },
      ]);

      mockPayoutQb.getMany.mockResolvedValueOnce([
        {
          id: 'payout-1',
          amountCents: 500,
          createdAt: new Date('2026-01-20'),
          status: PayoutStatus.COMPLETED,
          description: 'Payout',
        },
      ]);

      mockPurchaseQb.getCount.mockResolvedValueOnce(1);
      mockPayoutQb.getCount.mockResolvedValueOnce(1);

      const result = await service.getTransactionHistory(mockCreatorUserId);

      expect(result.transactions.length).toBeGreaterThan(0);
      expect(result.total).toBe(2);
    });

    it('should filter by transaction type', async () => {
      const mockPurchaseQb = mockQueryBuilder();
      (purchaseRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockPurchaseQb);

      mockPurchaseQb.getRawMany.mockResolvedValue([]);
      mockPurchaseQb.getCount.mockResolvedValue(0);

      // Filter by sale type
      const result = await service.getTransactionHistory(mockCreatorUserId, { type: 'sale' });

      expect(result).toBeDefined();
    });
  });

  describe('canRequestPayout', () => {
    it('should return eligible when all conditions are met', async () => {
      payoutAccountRepo.findOne.mockResolvedValue({
        userId: mockCreatorUserId,
        payoutsEnabled: true,
      } as CreatorPayoutAccount);

      // Mock getEarningsSummary
      const mockPurchaseQb = mockQueryBuilder();
      const mockPayoutQb = mockQueryBuilder();

      (purchaseRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockPurchaseQb)
        .mockReturnValueOnce(mockPurchaseQb);
      (payoutRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockPayoutQb)
        .mockReturnValueOnce(mockPayoutQb)
        .mockReturnValueOnce(mockPayoutQb);

      mockPurchaseQb.getRawOne
        .mockResolvedValueOnce({ totalEarnings: '2000' })
        .mockResolvedValueOnce({ refundedEarnings: '0' });
      mockPayoutQb.getRawOne
        .mockResolvedValueOnce({ totalPayouts: '0' })
        .mockResolvedValueOnce({ pendingPayouts: '0' });
      mockPayoutQb.getOne.mockResolvedValueOnce(null);

      const result = await service.canRequestPayout(mockCreatorUserId);

      expect(result.eligible).toBe(true);
      expect(result.availableAmount).toBe(2000);
    });

    it('should return not eligible when no payout account exists', async () => {
      payoutAccountRepo.findOne.mockResolvedValue(null);

      const result = await service.canRequestPayout(mockCreatorUserId);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Stripe Connect account');
    });

    it('should return not eligible when payouts are disabled', async () => {
      payoutAccountRepo.findOne.mockResolvedValue({
        userId: mockCreatorUserId,
        payoutsEnabled: false,
      } as CreatorPayoutAccount);

      const result = await service.canRequestPayout(mockCreatorUserId);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('not set up for payouts');
    });

    it('should return not eligible when below minimum threshold', async () => {
      payoutAccountRepo.findOne.mockResolvedValue({
        userId: mockCreatorUserId,
        payoutsEnabled: true,
      } as CreatorPayoutAccount);

      // Mock low earnings
      const mockPurchaseQb = mockQueryBuilder();
      const mockPayoutQb = mockQueryBuilder();

      (purchaseRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockPurchaseQb)
        .mockReturnValueOnce(mockPurchaseQb);
      (payoutRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(mockPayoutQb)
        .mockReturnValueOnce(mockPayoutQb)
        .mockReturnValueOnce(mockPayoutQb);

      mockPurchaseQb.getRawOne
        .mockResolvedValueOnce({ totalEarnings: '500' }) // Below $10 minimum
        .mockResolvedValueOnce({ refundedEarnings: '0' });
      mockPayoutQb.getRawOne
        .mockResolvedValueOnce({ totalPayouts: '0' })
        .mockResolvedValueOnce({ pendingPayouts: '0' });
      mockPayoutQb.getOne.mockResolvedValueOnce(null);

      const result = await service.canRequestPayout(mockCreatorUserId);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Minimum payout threshold');
    });
  });

  describe('getDailyEarnings', () => {
    it('should return daily earnings for the last N days', async () => {
      const mockPurchaseQb = mockQueryBuilder();
      (purchaseRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockPurchaseQb);

      mockPurchaseQb.getRawMany.mockResolvedValue([
        { date: '2026-01-15', sales: '3', earnings: '2400' },
        { date: '2026-01-14', sales: '2', earnings: '1600' },
      ]);

      const result = await service.getDailyEarnings(mockCreatorUserId, 7);

      // Should return 7 days of data
      expect(result.length).toBe(7);
    });

    it('should fill missing days with zeros', async () => {
      const mockPurchaseQb = mockQueryBuilder();
      (purchaseRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockPurchaseQb);

      // Only one day has data
      mockPurchaseQb.getRawMany.mockResolvedValue([
        { date: '2026-01-15', sales: '1', earnings: '800' },
      ]);

      const result = await service.getDailyEarnings(mockCreatorUserId, 3);

      expect(result.length).toBe(3);
      // Other days should have zeros
      const zeroDays = result.filter((d) => d.earningsCents === 0);
      expect(zeroDays.length).toBeGreaterThan(0);
    });
  });
});
