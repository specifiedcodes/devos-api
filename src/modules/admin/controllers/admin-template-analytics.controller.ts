/**
 * AdminTemplateAnalyticsController
 *
 * Story 19-9: Template Analytics
 *
 * Admin endpoint for marketplace-wide template analytics (AC5).
 * GET /api/admin/templates/analytics
 */
import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminTemplateAnalyticsService } from '../services/admin-template-analytics.service';
import {
  AdminAnalyticsQueryDto,
  AdminTemplateAnalyticsResponse,
} from '../../templates/dto/template-analytics.dto';

@ApiTags('Admin Template Analytics')
@Controller('api/admin/templates/analytics')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@ApiBearerAuth('JWT-auth')
export class AdminTemplateAnalyticsController {
  constructor(
    private readonly analyticsService: AdminTemplateAnalyticsService,
  ) {}

  /**
   * GET /api/admin/templates/analytics
   * Get marketplace-wide template analytics.
   */
  @Get()
  @ApiOperation({
    summary: 'Get marketplace template analytics',
    description: 'Returns top templates, category breakdown, trending, and featured performance. Admin only.',
  })
  @ApiQuery({ name: 'period', required: false, description: 'Period: 7d, 30d, 90d', example: '30d' })
  @ApiQuery({ name: 'limit', required: false, description: 'Top N results', example: '10' })
  @ApiResponse({ status: 200, description: 'Marketplace analytics returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Platform admin access required' })
  async getMarketplaceAnalytics(
    @Query() query: AdminAnalyticsQueryDto,
  ): Promise<AdminTemplateAnalyticsResponse> {
    const period = query.period || '30d';
    const limitStr = query.limit;
    let limit = 10;
    if (limitStr) {
      const parsed = parseInt(limitStr, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
        limit = parsed;
      }
    }

    return this.analyticsService.getMarketplaceAnalytics(period, limit);
  }
}
