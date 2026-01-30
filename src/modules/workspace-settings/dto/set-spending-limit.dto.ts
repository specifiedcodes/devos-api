import {
  IsNumber,
  IsArray,
  IsBoolean,
  Min,
  Max,
  ArrayUnique,
  ArrayMinSize,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SetSpendingLimitDto {
  @ApiProperty({
    example: 100.0,
    description: 'Monthly spending limit in USD',
  })
  @IsNumber()
  @Min(0.01, { message: 'Monthly limit must be greater than 0' })
  @Type(() => Number)
  monthly_limit_usd!: number;

  @ApiProperty({
    example: [80, 90, 100],
    description: 'Alert thresholds as percentages (e.g., 80, 90, 100)',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one alert threshold is required' })
  @ArrayUnique({ message: 'Alert thresholds must be unique' })
  @IsNumber({}, { each: true })
  @Min(1, { each: true, message: 'Each threshold must be at least 1%' })
  @Max(100, { each: true, message: 'Each threshold cannot exceed 100%' })
  alert_thresholds!: number[];

  @ApiProperty({
    example: true,
    description: 'Whether spending limits are enabled',
  })
  @IsBoolean()
  limit_enabled!: boolean;
}

export class GetSpendingLimitsResponseDto {
  @ApiProperty({ example: 100.0 })
  monthly_limit_usd?: number;

  @ApiProperty({ example: [80, 90, 100] })
  alert_thresholds?: number[];

  @ApiProperty({ example: true })
  limit_enabled!: boolean;

  @ApiProperty({ example: {} })
  triggered_alerts?: Record<string, any>;

  @ApiProperty({ example: 45.5, description: 'Current month spend in USD' })
  current_month_spend!: number;

  @ApiProperty({
    example: 45.5,
    description: 'Percentage of budget used this month',
  })
  percentage_used!: number;
}
