/**
 * Template Billing DTOs
 *
 * Story 19-10: Template Revenue Sharing
 *
 * DTOs for template purchase, earnings, and payout API endpoints.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max, IsUUID, IsNotEmpty, IsIn } from 'class-validator';

// ============ Template Purchase DTOs ============

export class CreateTemplatePurchaseIntentDto {
  @ApiProperty({ description: 'Workspace ID for the purchase' })
  @IsUUID()
  workspaceId!: string;
}

export class ConfirmTemplatePurchaseDto {
  @ApiProperty({ description: 'Stripe payment intent ID' })
  @IsString()
  @IsNotEmpty({ message: 'Payment intent ID cannot be empty' })
  paymentIntentId!: string;
}

export class TemplateRefundDto {
  @ApiProperty({ description: 'Reason for the refund' })
  @IsString()
  @IsNotEmpty({ message: 'Refund reason cannot be empty' })
  reason!: string;
}

// ============ Template Earnings DTOs ============

export class TemplateEarningsQueryDto {
  @ApiPropertyOptional({ description: 'Start date for earnings range (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for earnings range (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class TemplateTransactionQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by transaction type (sale, payout, refund)' })
  @IsOptional()
  @IsString()
  @IsIn(['sale', 'payout', 'refund'], { message: 'type must be one of: sale, payout, refund' })
  type?: string;
}

export class TemplateDailyEarningsQueryDto {
  @ApiPropertyOptional({ description: 'Number of days to include', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

// ============ Template Purchase Response DTOs ============

export class TemplatePurchaseIntentResponseDto {
  @ApiProperty({ description: 'Payment intent ID' })
  paymentIntentId!: string;

  @ApiProperty({ description: 'Client secret for frontend payment confirmation' })
  clientSecret!: string;

  @ApiProperty({ description: 'Amount in cents' })
  amount!: number;

  @ApiProperty({ description: 'Currency code' })
  currency!: string;

  @ApiProperty({ description: 'Platform fee in cents' })
  platformFeeCents!: number;

  @ApiProperty({ description: 'Creator amount in cents' })
  creatorAmountCents!: number;
}

export class TemplatePurchaseConfirmResponseDto {
  @ApiProperty({ description: 'Purchase ID' })
  purchaseId!: string;

  @ApiProperty({ description: 'Purchase status' })
  status!: string;
}

export class TemplatePurchaseAccessResponseDto {
  @ApiProperty({ description: 'Whether user has purchased access' })
  hasAccess!: boolean;
}

// ============ Template Earnings Response DTOs ============

export class TemplateEarningsSummaryResponseDto {
  @ApiProperty({ description: 'Total template earnings in cents' })
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

export class TemplatePayoutEligibilityResponseDto {
  @ApiProperty({ description: 'Whether user is eligible for payout' })
  eligible!: boolean;

  @ApiProperty({ description: 'Available amount in cents' })
  availableAmount!: number;

  @ApiPropertyOptional({ description: 'Reason if not eligible' })
  reason?: string;
}
