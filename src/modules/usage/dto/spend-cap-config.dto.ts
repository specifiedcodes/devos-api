import {
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  Min,
  Max,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Custom validator: ensures thresholds are in ascending order
 * warning < downgrade < critical < hard_cap
 */
@ValidatorConstraint({ name: 'thresholdOrder', async: false })
export class ThresholdOrderConstraint implements ValidatorConstraintInterface {
  validate(_value: any, args: ValidationArguments): boolean {
    const dto = args.object as SpendCapConfigDto;

    // Only validate if multiple thresholds are being set
    const thresholds: Array<{ key: string; value: number | undefined }> = [
      { key: 'warningThreshold', value: dto.warningThreshold },
      { key: 'downgradeThreshold', value: dto.downgradeThreshold },
      { key: 'criticalThreshold', value: dto.criticalThreshold },
      { key: 'hardCapThreshold', value: dto.hardCapThreshold },
    ];

    // Filter to only provided values
    const provided = thresholds.filter((t) => t.value !== undefined);
    if (provided.length <= 1) return true;

    // Check order of provided thresholds
    for (let i = 0; i < provided.length - 1; i++) {
      const current = provided[i];
      const next = provided[i + 1];
      // Find their indices in the original order
      const currentIdx = thresholds.findIndex((t) => t.key === current.key);
      const nextIdx = thresholds.findIndex((t) => t.key === next.key);
      if (currentIdx < nextIdx && current.value! >= next.value!) {
        return false;
      }
    }

    return true;
  }

  defaultMessage(): string {
    return 'Thresholds must be in ascending order: warningThreshold < downgradeThreshold < criticalThreshold < hardCapThreshold';
  }
}

/**
 * DTO for updating spend cap configuration
 *
 * Story 13-7: Spend Caps & Auto-Downgrade
 */
export class SpendCapConfigDto {
  @IsOptional()
  @IsBoolean()
  spendCapEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyBudget?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1.00)
  @Validate(ThresholdOrderConstraint)
  warningThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1.00)
  @Validate(ThresholdOrderConstraint)
  downgradeThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1.00)
  @Validate(ThresholdOrderConstraint)
  criticalThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1.00)
  @Validate(ThresholdOrderConstraint)
  hardCapThreshold?: number;

  @IsOptional()
  @IsObject()
  downgradeRules?: Record<string, { from: string; to: string }>;
}
