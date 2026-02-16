import { IsOptional, IsIn, IsISO8601, ValidateIf, IsNotEmpty } from 'class-validator';

/**
 * AnalyticsQueryDto
 * Story 14.7: Admin Analytics Dashboard (AC2)
 *
 * DTO for analytics query parameters with time range validation.
 * Supports preset ranges and custom date ranges.
 */

export type AnalyticsRange = 'today' | '7d' | '30d' | '90d' | 'custom';
export type ExportMetric = 'users' | 'projects' | 'agents' | 'ai-usage' | 'all';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsIn(['today', '7d', '30d', '90d', 'custom'])
  range?: AnalyticsRange = '30d';

  @ValidateIf((o) => o.range === 'custom')
  @IsNotEmpty({ message: 'startDate is required when range is custom' })
  @IsISO8601()
  startDate?: string;

  @ValidateIf((o) => o.range === 'custom')
  @IsNotEmpty({ message: 'endDate is required when range is custom' })
  @IsISO8601()
  endDate?: string;

  /**
   * Compute the actual date range from preset or custom dates.
   * Returns { startDate, endDate } as Date objects.
   */
  computeDateRange(): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = new Date(now);

    if (this.range === 'custom' && this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      return { startDate: start, endDate: end };
    }

    let startDate: Date;

    switch (this.range) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case '7d':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '90d':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '30d':
      default:
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        break;
    }

    return { startDate, endDate };
  }
}

export class AnalyticsExportQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  @IsIn(['users', 'projects', 'agents', 'ai-usage', 'all'])
  metric?: ExportMetric = 'all';
}
