import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CumulativeFlowQueryDto {
  @ApiPropertyOptional({ description: 'Start date filter (ISO8601)' })
  date_from?: string;

  @ApiPropertyOptional({ description: 'End date filter (ISO8601)' })
  date_to?: string;

  @ApiPropertyOptional({ description: 'Sprint ID to filter by' })
  sprint_id?: string;
}

export class CumulativeFlowDataPointDto {
  @ApiProperty({ description: 'Date', example: '2026-03-01' })
  date!: string;

  @ApiProperty({ description: 'Stories in backlog' })
  backlog!: number;

  @ApiProperty({ description: 'Stories in progress' })
  inProgress!: number;

  @ApiProperty({ description: 'Stories in review' })
  review!: number;

  @ApiProperty({ description: 'Stories done' })
  done!: number;

  @ApiPropertyOptional({ description: 'Scope change indicator' })
  scopeChange?: boolean;
}

export class BottleneckIndicatorDto {
  @ApiProperty({ description: 'Status where bottleneck detected' })
  status!: string;

  @ApiProperty({ description: 'Average time stories spend in this status (hours)' })
  avgTimeInStatus!: number;

  @ApiProperty({ description: 'Current queue size' })
  queueSize!: number;

  @ApiProperty({ description: 'Whether this is a bottleneck' })
  isBottleneck!: boolean;
}

export class CumulativeFlowResponseDto {
  @ApiProperty({ description: 'Data points for the chart', type: [CumulativeFlowDataPointDto] })
  dataPoints!: CumulativeFlowDataPointDto[];

  @ApiProperty({ description: 'Bottleneck indicators', type: [BottleneckIndicatorDto] })
  bottlenecks!: BottleneckIndicatorDto[];

  @ApiProperty({ description: 'Date range start' })
  dateFrom!: string;

  @ApiProperty({ description: 'Date range end' })
  dateTo!: string;

  @ApiProperty({ description: 'Total stories tracked' })
  totalStories!: number;
}
