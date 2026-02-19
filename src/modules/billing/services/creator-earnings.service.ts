/**
 * CreatorEarningsService
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * Provides earnings analytics and transaction history for creators.
 * Aggregates sales, refunds, and payout data.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentPurchase, PurchaseStatus } from '../../../database/entities/agent-purchase.entity';
import { PayoutTransaction, PayoutStatus } from '../../../database/entities/payout-transaction.entity';
import { MarketplaceAgent } from '../../../database/entities/marketplace-agent.entity';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';

export interface EarningsSummary {
  totalEarningsCents: number;
  pendingEarningsCents: number;
  availableForPayoutCents: number;
  totalPayoutsCents: number;
  lastPayoutAt: Date | null;
  currency: string;
}

export interface EarningsBreakdown {
  byAgent: Array<{
    agentId: string;
    agentName: string;
    totalSales: number;
    totalEarningsCents: number;
  }>;
  byMonth: Array<{
    month: string;
    sales: number;
    earningsCents: number;
  }>;
}

export interface TransactionListItem {
  id: string;
  type: 'sale' | 'payout' | 'refund' | 'adjustment';
  amountCents: number;
  description: string;
  agentName?: string;
  createdAt: Date;
  status: string;
}

@Injectable()
export class CreatorEarningsService {
  private readonly logger = new Logger(CreatorEarningsService.name);

  // Minimum payout threshold: $10.00 USD
  private readonly MIN_PAYOUT_THRESHOLD_CENTS = 1000;

  constructor(
    @InjectRepository(AgentPurchase)
    private readonly purchaseRepo: Repository<AgentPurchase>,
    @InjectRepository(PayoutTransaction)
    private readonly payoutRepo: Repository<PayoutTransaction>,
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentRepo: Repository<MarketplaceAgent>,
    @InjectRepository(CreatorPayoutAccount)
    private readonly payoutAccountRepo: Repository<CreatorPayoutAccount>,
  ) {}

  /**
   * Get earnings summary for a creator.
   */
  async getEarningsSummary(creatorUserId: string): Promise<EarningsSummary> {
    // Get total completed sales earnings
    const salesResult = await this.purchaseRepo
      .createQueryBuilder('purchase')
      .select('SUM(purchase.creatorAmountCents)', 'totalEarnings')
      .innerJoin('purchase.marketplaceAgent', 'agent')
      .where('agent.publisherUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: PurchaseStatus.COMPLETED })
      .getRawOne();

    const totalEarningsCents = parseInt(salesResult?.totalEarnings || '0', 10);

    // Get refunded amounts
    const refundedResult = await this.purchaseRepo
      .createQueryBuilder('purchase')
      .select('SUM(purchase.creatorAmountCents)', 'refundedEarnings')
      .innerJoin('purchase.marketplaceAgent', 'agent')
      .where('agent.publisherUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: PurchaseStatus.REFUNDED })
      .getRawOne();

    const refundedCents = parseInt(refundedResult?.refundedEarnings || '0', 10);

    // Get total payouts
    const payoutsResult = await this.payoutRepo
      .createQueryBuilder('payout')
      .select('SUM(payout.amountCents)', 'totalPayouts')
      .innerJoin('payout.payoutAccount', 'account')
      .where('account.userId = :creatorUserId', { creatorUserId })
      .andWhere('payout.status IN (:...statuses)', {
        statuses: [PayoutStatus.COMPLETED, PayoutStatus.PROCESSING],
      })
      .getRawOne();

    const totalPayoutsCents = parseInt(payoutsResult?.totalPayouts || '0', 10);

    // Get pending payouts
    const pendingPayoutsResult = await this.payoutRepo
      .createQueryBuilder('payout')
      .select('SUM(payout.amountCents)', 'pendingPayouts')
      .innerJoin('payout.payoutAccount', 'account')
      .where('account.userId = :creatorUserId', { creatorUserId })
      .andWhere('payout.status = :status', { status: PayoutStatus.PROCESSING })
      .getRawOne();

    const pendingPayoutsCents = parseInt(pendingPayoutsResult?.pendingPayouts || '0', 10);

    // Get last payout date
    const lastPayout = await this.payoutRepo
      .createQueryBuilder('payout')
      .innerJoin('payout.payoutAccount', 'account')
      .where('account.userId = :creatorUserId', { creatorUserId })
      .andWhere('payout.status = :status', { status: PayoutStatus.COMPLETED })
      .orderBy('payout.completedAt', 'DESC')
      .limit(1)
      .getOne();

    // Calculate available balance (earnings - refunds - payouts)
    const availableForPayoutCents = Math.max(
      0,
      totalEarningsCents - refundedCents - totalPayoutsCents - pendingPayoutsCents,
    );

    return {
      totalEarningsCents,
      pendingEarningsCents: pendingPayoutsCents,
      availableForPayoutCents,
      totalPayoutsCents,
      lastPayoutAt: lastPayout?.completedAt || null,
      currency: 'USD',
    };
  }

  /**
   * Get detailed earnings breakdown by agent and time period.
   */
  async getEarningsBreakdown(
    creatorUserId: string,
    options?: { startDate?: Date; endDate?: Date },
  ): Promise<EarningsBreakdown> {
    // Earnings by agent
    const agentStatsQuery = this.purchaseRepo
      .createQueryBuilder('purchase')
      .select('agent.id', 'agentId')
      .addSelect('agent.displayName', 'agentName')
      .addSelect('COUNT(purchase.id)', 'totalSales')
      .addSelect('SUM(purchase.creatorAmountCents)', 'totalEarnings')
      .innerJoin('purchase.marketplaceAgent', 'agent')
      .where('agent.publisherUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: PurchaseStatus.COMPLETED })
      .groupBy('agent.id')
      .addGroupBy('agent.displayName')
      .orderBy('totalEarnings', 'DESC');

    if (options?.startDate) {
      agentStatsQuery.andWhere('purchase.createdAt >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options?.endDate) {
      agentStatsQuery.andWhere('purchase.createdAt <= :endDate', {
        endDate: options.endDate,
      });
    }

    const agentStats = await agentStatsQuery.getRawMany();

    // Earnings by month
    const monthStatsQuery = this.purchaseRepo
      .createQueryBuilder('purchase')
      .select("TO_CHAR(purchase.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(purchase.id)', 'sales')
      .addSelect('SUM(purchase.creatorAmountCents)', 'earnings')
      .innerJoin('purchase.marketplaceAgent', 'agent')
      .where('agent.publisherUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: PurchaseStatus.COMPLETED })
      .groupBy("TO_CHAR(purchase.createdAt, 'YYYY-MM')")
      .orderBy('month', 'DESC')
      .limit(12);

    if (options?.startDate) {
      monthStatsQuery.andWhere('purchase.createdAt >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options?.endDate) {
      monthStatsQuery.andWhere('purchase.createdAt <= :endDate', {
        endDate: options.endDate,
      });
    }

    const monthStats = await monthStatsQuery.getRawMany();

    return {
      byAgent: agentStats.map((stat) => ({
        agentId: stat.agentId,
        agentName: stat.agentName,
        totalSales: parseInt(stat.totalSales, 10),
        totalEarningsCents: parseInt(stat.totalEarnings || '0', 10),
      })),
      byMonth: monthStats.map((stat) => ({
        month: stat.month,
        sales: parseInt(stat.sales, 10),
        earningsCents: parseInt(stat.earnings || '0', 10),
      })),
    };
  }

  /**
   * Get transaction history for a creator (sales, payouts, refunds).
   * Note: This implementation fetches slightly more records than needed to ensure
   * correct pagination after merge-sort. For very large datasets, consider a
   * unified database view or cursor-based pagination.
   */
  async getTransactionHistory(
    creatorUserId: string,
    options?: { limit?: number; offset?: number; type?: string },
  ): Promise<{ transactions: TransactionListItem[]; total: number }> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    // Fetch limit + offset records from each source to ensure correct pagination after merge
    const fetchLimit = limit + offset;

    const transactions: TransactionListItem[] = [];

    // Get sales (completed and refunded)
    if (!options?.type || options?.type === 'sale') {
      const salesQuery = this.purchaseRepo
        .createQueryBuilder('purchase')
        .select([
          'purchase.id AS id',
          'purchase.creatorAmountCents AS "amountCents"',
          'purchase.createdAt AS "createdAt"',
          'purchase.status AS status',
          'agent.displayName AS "agentName"',
        ])
        .innerJoin('purchase.marketplaceAgent', 'agent')
        .where('agent.publisherUserId = :creatorUserId', { creatorUserId })
        .andWhere('purchase.status IN (:...statuses)', {
          statuses: [PurchaseStatus.COMPLETED, PurchaseStatus.REFUNDED],
        });

      const sales = await salesQuery
        .orderBy('purchase.createdAt', 'DESC')
        .limit(fetchLimit)
        .getRawMany();

      for (const sale of sales) {
        const isRefund = sale.status === PurchaseStatus.REFUNDED;
        transactions.push({
          id: sale.id,
          type: isRefund ? 'refund' : 'sale',
          amountCents: isRefund ? -sale.amountCents : sale.amountCents,
          description: isRefund ? `Refund for ${sale.agentName}` : `Sale of ${sale.agentName}`,
          agentName: sale.agentName,
          createdAt: sale.createdAt,
          status: sale.status,
        });
      }
    }

    // Get payouts if not filtering or filtering by payout
    if (!options?.type || options?.type === 'payout') {
      const payouts = await this.payoutRepo
        .createQueryBuilder('payout')
        .innerJoin('payout.payoutAccount', 'account')
        .where('account.userId = :creatorUserId', { creatorUserId })
        .orderBy('payout.createdAt', 'DESC')
        .limit(fetchLimit)
        .getMany();

      for (const payout of payouts) {
        transactions.push({
          id: payout.id,
          type: 'payout',
          amountCents: -payout.amountCents,
          description: payout.description || 'Payout to bank account',
          createdAt: payout.createdAt,
          status: payout.status,
        });
      }
    }

    // Sort all transactions by date descending
    transactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Get total count
    let totalSales = 0;
    let totalPayouts = 0;

    if (!options?.type || options?.type === 'sale') {
      totalSales = await this.purchaseRepo
        .createQueryBuilder('purchase')
        .innerJoin('purchase.marketplaceAgent', 'agent')
        .where('agent.publisherUserId = :creatorUserId', { creatorUserId })
        .andWhere('purchase.status IN (:...statuses)', {
          statuses: [PurchaseStatus.COMPLETED, PurchaseStatus.REFUNDED],
        })
        .getCount();
    }

    if (!options?.type || options?.type === 'payout') {
      totalPayouts = await this.payoutRepo
        .createQueryBuilder('payout')
        .innerJoin('payout.payoutAccount', 'account')
        .where('account.userId = :creatorUserId', { creatorUserId })
        .getCount();
    }

    const total = totalSales + totalPayouts;

    return {
      transactions: transactions.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * Check if creator is eligible for payout.
   */
  async canRequestPayout(
    creatorUserId: string,
  ): Promise<{ eligible: boolean; availableAmount: number; reason?: string }> {
    // Check if creator has a payout account
    const payoutAccount = await this.payoutAccountRepo.findOne({
      where: { userId: creatorUserId },
    });

    if (!payoutAccount) {
      return {
        eligible: false,
        availableAmount: 0,
        reason: 'You need to set up a Stripe Connect account first',
      };
    }

    if (!payoutAccount.payoutsEnabled) {
      return {
        eligible: false,
        availableAmount: 0,
        reason: 'Your Stripe account is not set up for payouts',
      };
    }

    // Get available balance
    const summary = await this.getEarningsSummary(creatorUserId);

    if (summary.availableForPayoutCents < this.MIN_PAYOUT_THRESHOLD_CENTS) {
      return {
        eligible: false,
        availableAmount: summary.availableForPayoutCents,
        reason: `Minimum payout threshold is $${(this.MIN_PAYOUT_THRESHOLD_CENTS / 100).toFixed(2)}`,
      };
    }

    return {
      eligible: true,
      availableAmount: summary.availableForPayoutCents,
    };
  }

  /**
   * Get daily earnings for charting (last N days).
   */
  async getDailyEarnings(
    creatorUserId: string,
    days: number = 30,
  ): Promise<Array<{ date: string; earningsCents: number; sales: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const dailyStats = await this.purchaseRepo
      .createQueryBuilder('purchase')
      .select("TO_CHAR(purchase.createdAt, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(purchase.id)', 'sales')
      .addSelect('SUM(purchase.creatorAmountCents)', 'earnings')
      .innerJoin('purchase.marketplaceAgent', 'agent')
      .where('agent.publisherUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: PurchaseStatus.COMPLETED })
      .andWhere('purchase.createdAt >= :startDate', { startDate })
      .groupBy("TO_CHAR(purchase.createdAt, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();

    // Create a map for quick lookup
    const statsMap = new Map<string, { earningsCents: number; sales: number }>();
    for (const stat of dailyStats) {
      statsMap.set(stat.date, {
        earningsCents: parseInt(stat.earnings || '0', 10),
        sales: parseInt(stat.sales, 10),
      });
    }

    // Fill in missing days with zeros
    const result: Array<{ date: string; earningsCents: number; sales: number }> = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const stat = statsMap.get(dateStr) || { earningsCents: 0, sales: 0 };
      result.push({
        date: dateStr,
        ...stat,
      });
    }

    return result;
  }
}
