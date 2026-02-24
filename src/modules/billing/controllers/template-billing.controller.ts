/**
 * TemplateBillingController
 *
 * Story 19-10: Template Revenue Sharing
 *
 * REST API endpoints for template purchases, earnings, and payouts.
 * Follows existing BillingController patterns from Story 18-9.
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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TemplatePurchaseService } from '../services/template-purchase.service';
import { TemplateCreatorEarningsService } from '../services/template-creator-earnings.service';
import {
  CreateTemplatePurchaseIntentDto,
  ConfirmTemplatePurchaseDto,
  TemplateRefundDto,
  TemplateEarningsQueryDto,
  TemplateTransactionQueryDto,
  TemplateDailyEarningsQueryDto,
} from '../dto/template-billing.dto';

@ApiTags('template-billing')
@ApiBearerAuth('JWT-auth')
@Controller('billing/templates')
@UseGuards(JwtAuthGuard)
export class TemplateBillingController {
  private readonly logger = new Logger(TemplateBillingController.name);

  constructor(
    private readonly purchaseService: TemplatePurchaseService,
    private readonly earningsService: TemplateCreatorEarningsService,
  ) {}

  // ============ Template Purchases ============

  // Static route MUST come before parameterized route to avoid `:templateId` matching 'confirm'
  @Post('purchase/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm template payment and complete purchase' })
  @ApiResponse({ status: 200, description: 'Purchase confirmed' })
  async confirmPurchase(
    @Body() dto: ConfirmTemplatePurchaseDto,
    @Req() req: Record<string, any>,
  ): Promise<{ purchaseId: string; status: string }> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const result = await this.purchaseService.processSuccessfulPayment(dto.paymentIntentId);

    return {
      purchaseId: result.purchaseId,
      status: result.status,
    };
  }

  @Post('purchase/:templateId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create payment intent for template purchase' })
  @ApiResponse({ status: 201, description: 'Payment intent created' })
  @ApiResponse({ status: 400, description: 'Template is free or already purchased' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async createPurchaseIntent(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: CreateTemplatePurchaseIntentDto,
    @Req() req: Record<string, any>,
  ): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    amount: number;
    currency: string;
    platformFeeCents: number;
    creatorAmountCents: number;
  }> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.purchaseService.createPaymentIntent(templateId, userId, dto.workspaceId);
  }

  @Get('purchases')
  @ApiOperation({ summary: 'Get template purchase history for current user' })
  @ApiResponse({ status: 200, description: 'Purchase history retrieved' })
  async getUserTemplatePurchases(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Req() req?: Record<string, any>,
  ): Promise<{ purchases: any[]; total: number }> {
    const userId = req?.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const result = await this.purchaseService.getUserTemplatePurchases(userId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    return {
      purchases: result.purchases.map((p) => ({
        id: p.id,
        templateId: p.templateId,
        templateName: p.template?.displayName,
        amountCents: p.amountCents,
        platformFeeCents: p.platformFeeCents,
        creatorAmountCents: p.creatorAmountCents,
        currency: p.currency,
        status: p.status,
        createdAt: p.createdAt,
      })),
      total: result.total,
    };
  }

  @Get('purchases/:templateId/access')
  @ApiOperation({ summary: 'Check if user has purchased access to template' })
  @ApiResponse({ status: 200, description: 'Access status retrieved' })
  async checkPurchaseAccess(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Req() req: Record<string, any>,
  ): Promise<{ hasAccess: boolean }> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const hasAccess = await this.purchaseService.hasPurchasedAccess(templateId, userId);

    return { hasAccess };
  }

  @Post('purchases/:purchaseId/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request refund for a template purchase (within 7-day window)' })
  @ApiResponse({ status: 200, description: 'Refund processed' })
  @ApiResponse({ status: 400, description: 'Refund window expired or not eligible' })
  async requestRefund(
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @Body() dto: TemplateRefundDto,
    @Req() req: Record<string, any>,
  ): Promise<{ refundId: string; amount: number }> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.purchaseService.processRefund(purchaseId, dto.reason, userId);
  }

  // ============ Template Creator Earnings ============

  @Get('earnings/summary')
  @ApiOperation({ summary: 'Get template earnings summary for creator' })
  @ApiResponse({ status: 200, description: 'Earnings summary retrieved' })
  async getEarningsSummary(@Req() req: Record<string, any>): Promise<any> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.earningsService.getEarningsSummary(userId);
  }

  @Get('earnings/breakdown')
  @ApiOperation({ summary: 'Get template earnings breakdown by template and time' })
  @ApiResponse({ status: 200, description: 'Earnings breakdown retrieved' })
  async getEarningsBreakdown(
    @Query() query: TemplateEarningsQueryDto,
    @Req() req: Record<string, any>,
  ): Promise<any> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

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
  @ApiOperation({ summary: 'Get template transaction history for creator' })
  @ApiResponse({ status: 200, description: 'Transaction history retrieved' })
  async getTransactionHistory(
    @Query() query: TemplateTransactionQueryDto,
    @Req() req: Record<string, any>,
  ): Promise<any> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.earningsService.getTransactionHistory(userId, {
      limit: query.limit,
      offset: query.offset,
      type: query.type,
    });
  }

  @Get('earnings/daily')
  @ApiOperation({ summary: 'Get daily template earnings for charting' })
  @ApiResponse({ status: 200, description: 'Daily earnings retrieved' })
  async getDailyEarnings(
    @Query() query: TemplateDailyEarningsQueryDto,
    @Req() req: Record<string, any>,
  ): Promise<any> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.earningsService.getDailyEarnings(userId, query.days);
  }

  @Get('earnings/payout-eligibility')
  @ApiOperation({ summary: 'Check template payout eligibility' })
  @ApiResponse({ status: 200, description: 'Eligibility checked' })
  async checkPayoutEligibility(@Req() req: Record<string, any>): Promise<any> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.earningsService.canRequestPayout(userId);
  }
}
