import { IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';

/**
 * DTO for toggling spend cap override settings
 *
 * Story 13-7: Spend Caps & Auto-Downgrade
 */
export class SpendCapOverrideDto {
  @IsOptional()
  @IsBoolean()
  forcePremiumOverride?: boolean;

  @IsOptional()
  @IsBoolean()
  autoDowngradePaused?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  increaseBudgetTo?: number;
}
