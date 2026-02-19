/**
 * Billing Module DTOs
 *
 * Story 18-9: Agent Revenue Sharing
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUrl, IsOptional, IsInt, Min, Max, IsEnum, IsUUID } from 'class-validator';

// ============ Stripe Connect DTOs ============

export class CreateOnboardingLinkDto {
  @ApiProperty({ description: 'URL to redirect to if onboarding needs to be refreshed' })
  @IsUrl()
  refreshUrl!: string;

  @ApiProperty({ description: 'URL to redirect to after onboarding completes' })
  @IsUrl()
  returnUrl!: string;
}

export class ConnectAccountResponseDto {
  @ApiProperty({ description: 'Stripe Connect account ID' })
  accountId!: string;

  @ApiProperty({ description: 'Whether onboarding is complete' })
  onboardingComplete!: boolean;

  @ApiProperty({ description: 'Whether payouts are enabled' })
  payoutsEnabled!: boolean;
}

export class OnboardingLinkResponseDto {
  @ApiProperty({ description: 'URL for Stripe Connect onboarding' })
  url!: string;

  @ApiProperty({ description: 'When the onboarding link expires' })
  expiresAt!: Date;
}

export class ConnectStatusResponseDto {
  @ApiProperty({ description: 'Whether onboarding is complete' })
  onboardingComplete!: boolean;

  @ApiProperty({ description: 'Whether charges are enabled' })
  chargesEnabled!: boolean;

  @ApiProperty({ description: 'Whether payouts are enabled' })
  payoutsEnabled!: boolean;

  @ApiPropertyOptional({ description: 'Country code of the Stripe account' })
  country?: string;

  @ApiPropertyOptional({ description: 'Default currency for the account' })
  defaultCurrency?: string;
}

export class LoginLinkResponseDto {
  @ApiProperty({ description: 'URL for Stripe dashboard login' })
  url!: string;
}

// ============ Purchase DTOs ============

export class CreatePurchaseIntentDto {
  @ApiProperty({ description: 'Workspace ID for the purchase' })
  @IsUUID()
  workspaceId!: string;
}

export class ConfirmPurchaseDto {
  @ApiProperty({ description: 'Stripe payment intent ID' })
  @IsString()
  paymentIntentId!: string;
}

export class PurchaseIntentResponseDto {
  @ApiProperty({ description: 'Payment intent ID' })
  paymentIntentId!: string;

  @ApiProperty({ description: 'Client secret for frontend payment confirmation' })
  clientSecret!: string;

  @ApiProperty({ description: 'Amount in cents' })
  amount!: number;

  @ApiProperty({ description: 'Currency code' })
  currency!: string;

  @ApiPropertyOptional({ description: 'Platform fee in cents' })
  platformFeeCents?: number;

  @ApiPropertyOptional({ description: 'Creator amount in cents' })
  creatorAmountCents?: number;
}

export class ConfirmPurchaseResponseDto {
  @ApiProperty({ description: 'Purchase ID' })
  purchaseId!: string;

  @ApiProperty({ description: 'Purchase status' })
  status!: string;
}

export class PurchaseAccessResponseDto {
  @ApiProperty({ description: 'Whether user has purchased access' })
  hasAccess!: boolean;
}

// ============ Earnings DTOs ============

export class EarningsQueryDto {
  @ApiPropertyOptional({ description: 'Start date for earnings range' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for earnings range' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class EarningsSummaryResponseDto {
  @ApiProperty({ description: 'Total earnings in cents' })
  totalEarningsCents!: number;

  @ApiProperty({ description: 'Pending earnings in cents' })
  pendingEarningsCents!: number;

  @ApiProperty({ description: 'Available for payout in cents' })
  availableForPayoutCents!: number;

  @ApiProperty({ description: 'Total payouts in cents' })
  totalPayoutsCents!: number;

  @ApiPropertyOptional({ description: 'Last payout date' })
  lastPayoutAt?: Date | null;

  @ApiProperty({ description: 'Currency code' })
  currency!: string;
}

export class EarningsBreakdownResponseDto {
  @ApiProperty({ description: 'Earnings breakdown by agent' })
  byAgent!: Array<{
    agentId: string;
    agentName: string;
    totalSales: number;
    totalEarningsCents: number;
  }>;

  @ApiProperty({ description: 'Earnings breakdown by month' })
  byMonth!: Array<{
    month: string;
    sales: number;
    earningsCents: number;
  }>;
}

export class TransactionListItemDto {
  @ApiProperty({ description: 'Transaction ID' })
  id!: string;

  @ApiProperty({ description: 'Transaction type' })
  type!: 'sale' | 'payout' | 'refund' | 'adjustment';

  @ApiProperty({ description: 'Amount in cents' })
  amountCents!: number;

  @ApiProperty({ description: 'Transaction description' })
  description!: string;

  @ApiPropertyOptional({ description: 'Agent name for sales' })
  agentName?: string;

  @ApiProperty({ description: 'Transaction timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Transaction status' })
  status!: string;
}

// ============ Payout DTOs ============

export class PayoutQueryDto {
  @ApiPropertyOptional({ description: 'Maximum number of results', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class PayoutRequestResponseDto {
  @ApiProperty({ description: 'Payout ID' })
  payoutId!: string;

  @ApiProperty({ description: 'Payout amount in cents' })
  amountCents!: number;

  @ApiProperty({ description: 'Payout status' })
  status!: string;

  @ApiPropertyOptional({ description: 'Estimated arrival date' })
  estimatedArrival?: Date;
}

export class AvailableBalanceResponseDto {
  @ApiProperty({ description: 'Available balance in cents' })
  availableCents!: number;

  @ApiProperty({ description: 'Pending balance in cents' })
  pendingCents!: number;

  @ApiProperty({ description: 'Total earned in cents' })
  totalEarnedCents!: number;
}

export class PayoutEligibilityResponseDto {
  @ApiProperty({ description: 'Whether user is eligible for payout' })
  eligible!: boolean;

  @ApiProperty({ description: 'Available amount in cents' })
  availableAmount!: number;

  @ApiPropertyOptional({ description: 'Reason if not eligible' })
  reason?: string;
}

// ============ Daily Earnings DTO ============

export class DailyEarningsQueryDto {
  @ApiPropertyOptional({ description: 'Number of days to include', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class DailyEarningsResponseDto {
  @ApiProperty({ description: 'Date in YYYY-MM-DD format' })
  date!: string;

  @ApiProperty({ description: 'Earnings in cents for this day' })
  earningsCents!: number;

  @ApiProperty({ description: 'Number of sales for this day' })
  sales!: number;
}
