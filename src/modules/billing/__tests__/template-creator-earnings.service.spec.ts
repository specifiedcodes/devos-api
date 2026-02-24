/**
 * TemplateCreatorEarningsService Unit Tests
 *
 * Story 19-10: Template Revenue Sharing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TemplateCreatorEarningsService } from '../services/template-creator-earnings.service';
import { TemplatePurchase, TemplatePurchaseStatus } from '../../../database/entities/template-purchase.entity';
import { PayoutTransaction, PayoutStatus } from '../../../database/entities/payout-transaction.entity';
import { Template } from '../../../database/entities/template.entity';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';

describe('TemplateCreatorEarningsService', () => {
  let service: TemplateCreatorEarningsService;
  let purchaseRepo: jest.Mocked<Repository<TemplatePurchase>>;
  let payoutRepo: jest.Mocked<Repository<PayoutTransaction>>;
  let payoutAccountRepo: jest.Mocked<Repository<CreatorPayoutAccount>>;

  const mockCreatorUserId = 'creator-user-uuid';

  const createMockQueryBuilder = (overrides: Record<string, any> = {}) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(null),
    getRawMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    ...overrides,
  });

  beforeEach(async () => {
    const mockRepo = () => ({
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(() => createMockQueryBuilder()),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateCreatorEarningsService,
        {
          provide: getRepositoryToken(TemplatePurchase),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(PayoutTransaction),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(Template),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(CreatorPayoutAccount),
          useValue: mockRepo(),
        },
      ],
    }).compile();

    service = module.get<TemplateCreatorEarningsService>(TemplateCreatorEarningsService);
    purchaseRepo = module.get(getRepositoryToken(TemplatePurchase));
    payoutRepo = module.get(getRepositoryToken(PayoutTransaction));
    payoutAccountRepo = module.get(getRepositoryToken(CreatorPayoutAccount));
  });

  describe('getEarningsSummary', () => {
    it('should return earnings summary with zero values when no data', async () => {
      const result = await service.getEarningsSummary(mockCreatorUserId);

      expect(result).toEqual({
        totalEarningsCents: 0,
        pendingEarningsCents: 0,
        availableForPayoutCents: 0,
        totalPayoutsCents: 0,
        lastPayoutAt: null,
        currency: 'USD',
      });
    });

    it('should calculate available balance correctly', async () => {
      // Setup earnings query
      const earningsQb = createMockQueryBuilder({
        getRawOne: jest.fn()
          .mockResolvedValueOnce({ totalEarnings: '5000' }) // total earnings
          .mockResolvedValueOnce({ refundedEarnings: '500' }), // refunded
      });

      // Setup payout queries
      const payoutQb = createMockQueryBuilder({
        getRawOne: jest.fn()
          .mockResolvedValueOnce({ totalPayouts: '1000' }) // total payouts
          .mockResolvedValueOnce({ pendingPayouts: '200' }), // pending
        getOne: jest.fn().mockResolvedValue(null),
      });

      let purchaseCallCount = 0;
      purchaseRepo.createQueryBuilder.mockImplementation(() => {
        purchaseCallCount++;
        return earningsQb as any;
      });

      let payoutCallCount = 0;
      payoutRepo.createQueryBuilder.mockImplementation(() => {
        payoutCallCount++;
        return payoutQb as any;
      });

      const result = await service.getEarningsSummary(mockCreatorUserId);

      expect(result.totalEarningsCents).toBe(5000);
      // Available = 5000 - 500 - 1000 - 200 = 3300
      expect(result.availableForPayoutCents).toBe(3300);
    });

    it('should clamp available balance to zero when negative', async () => {
      const earningsQb = createMockQueryBuilder({
        getRawOne: jest.fn()
          .mockResolvedValueOnce({ totalEarnings: '100' })
          .mockResolvedValueOnce({ refundedEarnings: '0' }),
      });

      const payoutQb = createMockQueryBuilder({
        getRawOne: jest.fn()
          .mockResolvedValueOnce({ totalPayouts: '200' }) // More than earnings
          .mockResolvedValueOnce({ pendingPayouts: '0' }),
        getOne: jest.fn().mockResolvedValue(null),
      });

      purchaseRepo.createQueryBuilder.mockReturnValue(earningsQb as any);
      payoutRepo.createQueryBuilder.mockReturnValue(payoutQb as any);

      const result = await service.getEarningsSummary(mockCreatorUserId);
      expect(result.availableForPayoutCents).toBe(0);
    });
  });

  describe('getEarningsBreakdown', () => {
    it('should return empty breakdown when no data', async () => {
      const result = await service.getEarningsBreakdown(mockCreatorUserId);

      expect(result.byTemplate).toEqual([]);
      expect(result.byMonth).toEqual([]);
    });

    it('should return template breakdown with correct types', async () => {
      const qb = createMockQueryBuilder({
        getRawMany: jest.fn()
          .mockResolvedValueOnce([
            { templateId: 't1', templateName: 'Template 1', totalSales: '5', totalEarnings: '4000' },
          ])
          .mockResolvedValueOnce([
            { month: '2026-01', sales: '3', earnings: '2400' },
          ]),
      });

      purchaseRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getEarningsBreakdown(mockCreatorUserId);

      expect(result.byTemplate).toEqual([
        { templateId: 't1', templateName: 'Template 1', totalSales: 5, totalEarningsCents: 4000 },
      ]);
      expect(result.byMonth).toEqual([
        { month: '2026-01', sales: 3, earningsCents: 2400 },
      ]);
    });

    it('should apply date filters', async () => {
      const qb = createMockQueryBuilder();
      purchaseRepo.createQueryBuilder.mockReturnValue(qb as any);

      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-02-01');

      await service.getEarningsBreakdown(mockCreatorUserId, { startDate, endDate });

      // Should have been called with date filters
      expect(qb.andWhere).toHaveBeenCalled();
    });
  });

  describe('getTransactionHistory', () => {
    it('should return empty transactions when no data', async () => {
      const result = await service.getTransactionHistory(mockCreatorUserId);

      expect(result.transactions).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should merge and sort sales and payouts by date', async () => {
      const saleDate = new Date('2026-02-10');
      const payoutDate = new Date('2026-02-15');

      const salesQb = createMockQueryBuilder({
        getRawMany: jest.fn().mockResolvedValue([
          {
            id: 'sale-1',
            amountCents: 800,
            createdAt: saleDate,
            status: TemplatePurchaseStatus.COMPLETED,
            templateName: 'Template A',
          },
        ]),
        getCount: jest.fn().mockResolvedValue(1),
      });

      const payoutsQb = createMockQueryBuilder({
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'payout-1',
            amountCents: 500,
            createdAt: payoutDate,
            status: PayoutStatus.COMPLETED,
            description: 'Monthly payout',
          },
        ]),
        getCount: jest.fn().mockResolvedValue(1),
      });

      purchaseRepo.createQueryBuilder.mockReturnValue(salesQb as any);
      payoutRepo.createQueryBuilder.mockReturnValue(payoutsQb as any);

      const result = await service.getTransactionHistory(mockCreatorUserId);

      expect(result.total).toBe(2);
      // Payout should come first (more recent)
      expect(result.transactions[0].type).toBe('payout');
      expect(result.transactions[1].type).toBe('sale');
    });

    it('should filter by transaction type', async () => {
      const salesQb = createMockQueryBuilder({
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });

      purchaseRepo.createQueryBuilder.mockReturnValue(salesQb as any);

      await service.getTransactionHistory(mockCreatorUserId, { type: 'sale' });

      // Payout repo should not be called when filtering by sale
      expect(payoutRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should mark refunded purchases as refund type', async () => {
      const salesQb = createMockQueryBuilder({
        getRawMany: jest.fn().mockResolvedValue([
          {
            id: 'refund-1',
            amountCents: 800,
            createdAt: new Date(),
            status: TemplatePurchaseStatus.REFUNDED,
            templateName: 'Template B',
          },
        ]),
        getCount: jest.fn().mockResolvedValue(1),
      });

      purchaseRepo.createQueryBuilder.mockReturnValue(salesQb as any);

      const result = await service.getTransactionHistory(mockCreatorUserId, { type: 'sale' });

      expect(result.transactions[0].type).toBe('refund');
      expect(result.transactions[0].amountCents).toBeLessThan(0);
    });
  });

  describe('canRequestPayout', () => {
    it('should return not eligible when no payout account', async () => {
      payoutAccountRepo.findOne.mockResolvedValue(null);

      const result = await service.canRequestPayout(mockCreatorUserId);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Stripe Connect');
    });

    it('should return not eligible when payouts not enabled', async () => {
      payoutAccountRepo.findOne.mockResolvedValue({
        userId: mockCreatorUserId,
        payoutsEnabled: false,
      } as CreatorPayoutAccount);

      const result = await service.canRequestPayout(mockCreatorUserId);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('not set up for payouts');
    });

    it('should return not eligible when below $25 threshold', async () => {
      payoutAccountRepo.findOne.mockResolvedValue({
        userId: mockCreatorUserId,
        payoutsEnabled: true,
      } as CreatorPayoutAccount);

      // Mock earnings summary returning low balance
      const earningsQb = createMockQueryBuilder({
        getRawOne: jest.fn()
          .mockResolvedValueOnce({ totalEarnings: '1000' }) // $10 total
          .mockResolvedValueOnce({ refundedEarnings: '0' }),
      });

      const payoutQb = createMockQueryBuilder({
        getRawOne: jest.fn()
          .mockResolvedValueOnce({ totalPayouts: '0' })
          .mockResolvedValueOnce({ pendingPayouts: '0' }),
        getOne: jest.fn().mockResolvedValue(null),
      });

      purchaseRepo.createQueryBuilder.mockReturnValue(earningsQb as any);
      payoutRepo.createQueryBuilder.mockReturnValue(payoutQb as any);

      const result = await service.canRequestPayout(mockCreatorUserId);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('$25.00');
    });

    it('should return eligible when above threshold', async () => {
      payoutAccountRepo.findOne.mockResolvedValue({
        userId: mockCreatorUserId,
        payoutsEnabled: true,
      } as CreatorPayoutAccount);

      const earningsQb = createMockQueryBuilder({
        getRawOne: jest.fn()
          .mockResolvedValueOnce({ totalEarnings: '5000' })
          .mockResolvedValueOnce({ refundedEarnings: '0' }),
      });

      const payoutQb = createMockQueryBuilder({
        getRawOne: jest.fn()
          .mockResolvedValueOnce({ totalPayouts: '0' })
          .mockResolvedValueOnce({ pendingPayouts: '0' }),
        getOne: jest.fn().mockResolvedValue(null),
      });

      purchaseRepo.createQueryBuilder.mockReturnValue(earningsQb as any);
      payoutRepo.createQueryBuilder.mockReturnValue(payoutQb as any);

      const result = await service.canRequestPayout(mockCreatorUserId);

      expect(result.eligible).toBe(true);
      expect(result.availableAmount).toBe(5000);
    });
  });

  describe('getDailyEarnings', () => {
    it('should return filled daily earnings with zeros for missing days', async () => {
      const qb = createMockQueryBuilder({
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      purchaseRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getDailyEarnings(mockCreatorUserId, 7);

      expect(result).toHaveLength(7);
      result.forEach((day) => {
        expect(day.earningsCents).toBe(0);
        expect(day.sales).toBe(0);
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it('should default to 30 days', async () => {
      const qb = createMockQueryBuilder({
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      purchaseRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getDailyEarnings(mockCreatorUserId);

      expect(result).toHaveLength(30);
    });
  });
});
