import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CostAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Start date filter (ISO8601)' })
  date_from?: string;

  @ApiPropertyOptional({ description: 'End date filter (ISO8601)' })
  date_to?: string;
}

export class DailyCostDto {
  @ApiProperty({ description: 'Date', example: '2026-03-01' })
  date!: string;

  @ApiProperty({ description: 'Cost in USD' })
  cost!: number;
}

export class CostByModelDto {
  @ApiProperty({ description: 'Model name' })
  model!: string;

  @ApiProperty({ description: 'Total cost in USD' })
  cost!: number;

  @ApiProperty({ description: 'Percentage of total cost' })
  percentage!: number;
}

export class CostByAgentDto {
  @ApiProperty({ description: 'Agent ID' })
  agentId!: string;

  @ApiProperty({ description: 'Agent name' })
  agentName!: string;

  @ApiProperty({ description: 'Total cost in USD' })
  cost!: number;
}

export class CostAnalyticsResponseDto {
  @ApiProperty({ description: 'Daily costs over period', type: [DailyCostDto] })
  dailyCosts!: DailyCostDto[];

  @ApiProperty({ description: 'Cost breakdown by model', type: [CostByModelDto] })
  byModel!: CostByModelDto[];

  @ApiProperty({ description: 'Cost breakdown by agent', type: [CostByAgentDto] })
  byAgent!: CostByAgentDto[];

  @ApiPropertyOptional({ description: 'Budget limit if set' })
  budgetLimit?: number;

  @ApiProperty({ description: 'Projected monthly cost based on current trajectory' })
  projectedMonthlyCost!: number;

  @ApiProperty({ description: 'Cost optimization recommendations', type: [String] })
  recommendations!: string[];

  @ApiProperty({ description: 'Total cost for the period' })
  totalCost!: number;

  @ApiProperty({ description: 'Currency', example: 'USD' })
  currency!: string;
}
