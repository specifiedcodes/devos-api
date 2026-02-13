import {
  IsString,
  IsNumber,
  IsObject,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAnalyticsEventDto {
  @ApiProperty({
    description: 'Event type (e.g., onboarding_started, tutorial_completed)',
    example: 'onboarding_tutorial_started',
  })
  @IsString()
  @IsNotEmpty()
  event!: string;

  @ApiProperty({
    description: 'Event timestamp in milliseconds since epoch',
    example: 1738329600000,
  })
  @IsNumber()
  @IsNotEmpty()
  timestamp!: number;

  @ApiPropertyOptional({
    description: 'Additional event data as JSON object',
    example: { stepNumber: 1, projectId: 'uuid' },
  })
  @IsObject()
  @IsOptional()
  data?: Record<string, any>;
}
