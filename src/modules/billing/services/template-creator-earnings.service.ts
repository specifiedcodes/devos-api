/**
 * TemplateCreatorEarningsService
 *
 * Story 19-10: Template Revenue Sharing
 *
 * Provides template-specific earnings analytics and transaction history for creators.
 * Aggregates template sales, refunds, and payout data.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplatePurchase, TemplatePurchaseStatus } from '../../../database/entities/template-purchase.entity';
import { PayoutTransaction, PayoutStatus } from '../../../database/entities/payout-transaction.entity';
import { Template } from '../../../database/entities/template.entity';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';

export interface TemplateEarningsSummary {
  totalEarningsCents: number;
  pendingEarningsCents: number;
  availableForPayoutCents: number;
  totalPayoutsCents: number;
  lastPayoutAt: Date | null;
  currency: string;
}

export interface TemplateEarningsBreakdown {
  byTemplate: Array<{
    templateId: string;
    templateName: string;
    totalSales: number;
    totalEarningsCents: number;
  }>;
  byMonth: Array<{
    month: string;
    sales: number;
    earningsCents: number;
  }>;
}

export interface TemplateTransactionListItem {
  id: string;
  type: 'sale' | 'payout' | 'refund' | 'adjustment';
  amountCents: number;
  description: string;
  templateName?: string;
  createdAt: Date;
  status: string;
}

@Injectable()
export class TemplateCreatorEarningsService {
  private readonly logger = new Logger(TemplateCreatorEarningsService.name);

  // Minimum payout threshold: $25.00 USD (per epic spec)
  private readonly MIN_PAYOUT_THRESHOLD_CENTS = 2500;

  constructor(
    @InjectRepository(TemplatePurchase)
    private readonly purchaseRepo: Repository<TemplatePurchase>,
    @InjectRepository(PayoutTransaction)
    private readonly payoutRepo: Repository<PayoutTransaction>,
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(CreatorPayoutAccount)
    private readonly payoutAccountRepo: Repository<CreatorPayoutAccount>,
  ) {}

  /**
   * Get template earnings summary for a creator.
   */
  async getEarningsSummary(creatorUserId: string): Promise<TemplateEarningsSummary> {
    // Get total completed template sales earnings
    const salesResult = await this.purchaseRepo
      .createQueryBuilder('purchase')
      .select('SUM(purchase.creatorAmountCents)', 'totalEarnings')
      .where('purchase.sellerUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: TemplatePurchaseStatus.COMPLETED })
      .getRawOne();

    const totalEarningsCents = parseInt(salesResult?.totalEarnings || '0', 10);

    // Get refunded amounts
    const refundedResult = await this.purchaseRepo
      .createQueryBuilder('purchase')
      .select('SUM(purchase.creatorAmountCents)', 'refundedEarnings')
      .where('purchase.sellerUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: TemplatePurchaseStatus.REFUNDED })
      .getRawOne();

    const refundedCents = parseInt(refundedResult?.refundedEarnings || '0', 10);

    // Get total payouts (shared with agent payouts via same payout account)
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
   * Get detailed template earnings breakdown by template and time period.
   */
  async getEarningsBreakdown(
    creatorUserId: string,
    options?: { startDate?: Date; endDate?: Date },
  ): Promise<TemplateEarningsBreakdown> {
    // Earnings by template
    const templateStatsQuery = this.purchaseRepo
      .createQueryBuilder('purchase')
      .select('template.id', 'templateId')
      .addSelect('template.displayName', 'templateName')
      .addSelect('COUNT(purchase.id)', 'totalSales')
      .addSelect('SUM(purchase.creatorAmountCents)', 'totalEarnings')
      .innerJoin('purchase.template', 'template')
      .where('purchase.sellerUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: TemplatePurchaseStatus.COMPLETED })
      .groupBy('template.id')
      .addGroupBy('template.displayName')
      .orderBy('"totalEarnings"', 'DESC');

    if (options?.startDate) {
      templateStatsQuery.andWhere('purchase.createdAt >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options?.endDate) {
      templateStatsQuery.andWhere('purchase.createdAt <= :endDate', {
        endDate: options.endDate,
      });
    }

    const templateStats = await templateStatsQuery.getRawMany();

    // Earnings by month
    const monthStatsQuery = this.purchaseRepo
      .createQueryBuilder('purchase')
      .select("TO_CHAR(purchase.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(purchase.id)', 'sales')
      .addSelect('SUM(purchase.creatorAmountCents)', 'earnings')
      .where('purchase.sellerUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: TemplatePurchaseStatus.COMPLETED })
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
      byTemplate: templateStats.map((stat) => ({
        templateId: stat.templateId,
        templateName: stat.templateName,
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
   * Get template transaction history for a creator.
   */
  async getTransactionHistory(
    creatorUserId: string,
    options?: { limit?: number; offset?: number; type?: string },
  ): Promise<{ transactions: TemplateTransactionListItem[]; total: number }> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const fetchLimit = limit + offset;

    const transactions: TemplateTransactionListItem[] = [];

    // Get template sales (completed and refunded)
    if (!options?.type || options?.type === 'sale') {
      const salesQuery = this.purchaseRepo
        .createQueryBuilder('purchase')
        .select([
          'purchase.id AS id',
          'purchase.creatorAmountCents AS "amountCents"',
          'purchase.createdAt AS "createdAt"',
          'purchase.status AS status',
          'template.displayName AS "templateName"',
        ])
        .innerJoin('purchase.template', 'template')
        .where('purchase.sellerUserId = :creatorUserId', { creatorUserId })
        .andWhere('purchase.status IN (:...statuses)', {
          statuses: [TemplatePurchaseStatus.COMPLETED, TemplatePurchaseStatus.REFUNDED],
        });

      const sales = await salesQuery
        .orderBy('purchase.createdAt', 'DESC')
        .limit(fetchLimit)
        .getRawMany();

      for (const sale of sales) {
        const isRefund = sale.status === TemplatePurchaseStatus.REFUNDED;
        transactions.push({
          id: sale.id,
          type: isRefund ? 'refund' : 'sale',
          amountCents: isRefund ? -sale.amountCents : sale.amountCents,
          description: isRefund
            ? `Template refund for ${sale.templateName}`
            : `Template sale of ${sale.templateName}`,
          templateName: sale.templateName,
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
    transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Get total count
    let totalSales = 0;
    let totalPayouts = 0;

    if (!options?.type || options?.type === 'sale') {
      totalSales = await this.purchaseRepo
        .createQueryBuilder('purchase')
        .where('purchase.sellerUserId = :creatorUserId', { creatorUserId })
        .andWhere('purchase.status IN (:...statuses)', {
          statuses: [TemplatePurchaseStatus.COMPLETED, TemplatePurchaseStatus.REFUNDED],
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
   * Check if creator is eligible for template payout.
   */
  async canRequestPayout(creatorUserId: string): Promise<{
    eligible: boolean;
    availableAmount: number;
    reason?: string;
  }> {
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
   * Get daily template earnings for charting (last N days).
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
      .where('purchase.sellerUserId = :creatorUserId', { creatorUserId })
      .andWhere('purchase.status = :status', { status: TemplatePurchaseStatus.COMPLETED })
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
