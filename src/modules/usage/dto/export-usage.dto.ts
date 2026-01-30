import { IsDateString, IsOptional, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

/**
 * Custom validator to ensure end date is after start date
 */
@ValidatorConstraint({ name: 'isAfterStartDate', async: false })
export class IsAfterStartDate implements ValidatorConstraintInterface {
  validate(endDate: string, args: ValidationArguments) {
    const startDate = (args.object as any).startDate;
    if (!startDate || !endDate) {
      return true; // Let other validators handle required/format checks
    }
    return new Date(endDate) >= new Date(startDate);
  }

  defaultMessage(args: ValidationArguments) {
    return 'End date must be after or equal to start date';
  }
}

/**
 * Custom validator to ensure date range is not too large (max 1 year)
 */
@ValidatorConstraint({ name: 'isValidDateRange', async: false })
export class IsValidDateRange implements ValidatorConstraintInterface {
  validate(endDate: string, args: ValidationArguments) {
    const startDate = (args.object as any).startDate;
    if (!startDate || !endDate) {
      return true;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // Max 1 year (365 days)
    return diffDays <= 365;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Date range cannot exceed 365 days';
  }
}

/**
 * DTO for exporting usage data as CSV
 * Includes validation for date ranges
 */
export class ExportUsageDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  @Validate(IsAfterStartDate)
  @Validate(IsValidDateRange)
  endDate!: string;
}
