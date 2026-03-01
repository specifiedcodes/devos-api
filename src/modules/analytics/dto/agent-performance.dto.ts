import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AgentPerformanceQueryDto {
  @ApiPropertyOptional({ description: 'Start date filter (ISO8601)' })
  date_from?: string;

  @ApiPropertyOptional({ description: 'End date filter (ISO8601)' })
  date_to?: string;

  @ApiPropertyOptional({ description: 'Filter by agent ID' })
  agent_id?: string;
}

export class AgentTrendDataDto {
  @ApiProperty({ description: 'Date', example: '2026-03-01' })
  date!: string;

  @ApiProperty({ description: 'Tasks completed on this date' })
  tasksCompleted!: number;
}

export class AgentPerformanceItemDto {
  @ApiProperty({ description: 'Agent ID' })
  agentId!: string;

  @ApiProperty({ description: 'Agent name' })
  agentName!: string;

  @ApiProperty({ description: 'Agent type' })
  agentType!: string;

  @ApiProperty({ description: 'Total tasks completed' })
  tasksCompleted!: number;

  @ApiProperty({ description: 'Success rate (0-100)' })
  successRate!: number;

  @ApiProperty({ description: 'Average time per task in hours' })
  avgTimePerTaskHours!: number;

  @ApiProperty({ description: '7-day trend data', type: [Number] })
  trendData!: number[];
}

export class AgentPerformanceResponseDto {
  @ApiProperty({ description: 'Agent performance data', type: [AgentPerformanceItemDto] })
  agents!: AgentPerformanceItemDto[];

  @ApiProperty({ description: 'Date range start' })
  dateFrom!: string;

  @ApiProperty({ description: 'Date range end' })
  dateTo!: string;
}
