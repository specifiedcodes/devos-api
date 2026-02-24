/**
 * Template Analytics DTOs
 *
 * Story 19-9: Template Analytics
 *
 * Request/response DTOs for template analytics endpoints.
 */
import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TemplateAnalyticsEventType } from '../../../database/entities/template-analytics-event.entity';

// ---- Request DTOs ----

export class TemplateAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Period for analytics: 7d, 30d, 90d', default: '30d' })
  @IsOptional()
  @IsString()
  period?: string;
}

export class AnalyticsExportQueryDto {
  @ApiProperty({ description: 'Start date (ISO 8601)' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: 'End date (ISO 8601)' })
  @IsDateString()
  endDate!: string;
}

export class TrackEventDto {
  @ApiProperty({ description: 'Template ID', format: 'uuid' })
  @IsUUID()
  templateId!: string;

  @ApiProperty({ enum: TemplateAnalyticsEventType, description: 'Event type' })
  @IsEnum(TemplateAnalyticsEventType)
  eventType!: TemplateAnalyticsEventType;

  @ApiPropertyOptional({ description: 'Referrer source' })
  @IsOptional()
  @IsString()
  referrer?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreatorAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Period for analytics: 7d, 30d, 90d', default: '30d' })
  @IsOptional()
  @IsString()
  period?: string;
}

export class AdminAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Period for analytics: 7d, 30d, 90d', default: '30d' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ description: 'Limit top results', default: '10' })
  @IsOptional()
  @IsString()
  limit?: string;
}

// ---- Response DTOs ----

export class TemplateAnalyticsSummary {
  @ApiProperty() totalViews!: number;
  @ApiProperty() totalInstallations!: number;
  @ApiProperty() views7d!: number;
  @ApiProperty() views30d!: number;
  @ApiProperty() views90d!: number;
  @ApiProperty() installations7d!: number;
  @ApiProperty() installations30d!: number;
  @ApiProperty() installations90d!: number;
  @ApiProperty() avgRating!: number;
  @ApiProperty() ratingCount!: number;
  @ApiProperty() conversionRate!: number;
  @ApiProperty({ type: [Object] }) topReferrers!: Array<{ referrer: string; count: number }>;
  @ApiProperty() installSuccessRate!: number;
}

export class DailyTrendPoint {
  @ApiProperty() date!: string;
  @ApiProperty() count!: number;
}

export class TemplatePerformanceSummary {
  @ApiProperty() templateId!: string;
  @ApiProperty() templateName!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() totalViews!: number;
  @ApiProperty() totalInstallations!: number;
  @ApiProperty() conversionRate!: number;
}

export class CreatorAnalyticsResponse {
  @ApiProperty({ type: [TemplatePerformanceSummary] })
  topTemplates!: TemplatePerformanceSummary[];

  @ApiProperty({ type: [DailyTrendPoint] }) viewsTrend!: DailyTrendPoint[];
  @ApiProperty({ type: [DailyTrendPoint] }) installationsTrend!: DailyTrendPoint[];
  @ApiProperty() totalReach!: number;
  @ApiProperty() totalViews!: number;
  @ApiProperty() totalInstallations!: number;
}

export class CategoryPerformance {
  @ApiProperty() category!: string;
  @ApiProperty() totalViews!: number;
  @ApiProperty() totalInstallations!: number;
  @ApiProperty() templateCount!: number;
}

export class TrendingTemplate {
  @ApiProperty() templateId!: string;
  @ApiProperty() templateName!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() growthPercentage!: number;
  @ApiProperty() recentInstallations!: number;
}

export class AdminTemplateAnalyticsResponse {
  @ApiProperty({ type: [TemplatePerformanceSummary] })
  topByViews!: TemplatePerformanceSummary[];

  @ApiProperty({ type: [TemplatePerformanceSummary] })
  topByInstallations!: TemplatePerformanceSummary[];

  @ApiProperty() totalMarketplaceViews!: number;
  @ApiProperty() totalMarketplaceInstallations!: number;
  @ApiProperty() totalTemplates!: number;
  @ApiProperty() totalPublishedTemplates!: number;
  @ApiProperty() averageConversionRate!: number;

  @ApiProperty({ type: [CategoryPerformance] })
  categoryBreakdown!: CategoryPerformance[];

  @ApiProperty({ type: [TrendingTemplate] })
  trending!: TrendingTemplate[];

  @ApiProperty({ type: [TemplatePerformanceSummary] })
  featuredPerformance!: TemplatePerformanceSummary[];
}
