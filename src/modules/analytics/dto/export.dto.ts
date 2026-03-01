import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsISO8601 } from 'class-validator';

export enum ExportFormat {
  CSV = 'csv',
  PDF = 'pdf',
}

export enum ExportType {
  VELOCITY = 'velocity',
  BURNDOWN = 'burndown',
  AGENT_PERFORMANCE = 'agent-performance',
  COST = 'cost',
  CUMULATIVE_FLOW = 'cumulative-flow',
}

export class ExportQueryDto {
  @ApiProperty({ description: 'Export format', enum: ExportFormat })
  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @ApiPropertyOptional({ description: 'Start date filter (ISO8601)' })
  @IsOptional()
  @IsISO8601()
  date_from?: string;

  @ApiPropertyOptional({ description: 'End date filter (ISO8601)' })
  @IsOptional()
  @IsISO8601()
  date_to?: string;

  @ApiPropertyOptional({ description: 'Filters as JSON string' })
  @IsOptional()
  @IsString()
  filters?: string;
}
