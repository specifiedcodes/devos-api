/**
 * RecordPerformanceDto
 *
 * Story 13-8: Model Performance Benchmarks
 *
 * DTO for recording per-request model performance data.
 */
import {
  IsString,
  IsBoolean,
  IsNumber,
  IsInt,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class RecordPerformanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  requestId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  provider!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  taskType!: string;

  @IsBoolean()
  success!: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  qualityScore?: number;

  @IsInt()
  @Min(0)
  latencyMs!: number;

  @IsInt()
  @Min(0)
  inputTokens!: number;

  @IsInt()
  @Min(0)
  outputTokens!: number;

  @IsNumber()
  @Min(0)
  cost!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  contextSize?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  retryCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  errorType?: string;
}
