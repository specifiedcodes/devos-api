import { IsArray, ValidateNested, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateAnalyticsEventDto } from './create-analytics-event.dto';

/**
 * BatchAnalyticsEventDto
 * Story 16.8: Frontend Analytics Data Verification
 *
 * DTO for batch analytics event ingestion.
 * Accepts an array of 1-50 analytics events.
 */
export class BatchAnalyticsEventDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateAnalyticsEventDto)
  @ApiProperty({
    type: [CreateAnalyticsEventDto],
    description: 'Array of analytics events (min 1, max 50)',
    minItems: 1,
    maxItems: 50,
  })
  events!: CreateAnalyticsEventDto[];
}
