import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateAnalyticsEventDto } from '../dto/create-analytics-event.dto';
import { BatchAnalyticsEventDto } from '../dto/batch-analytics-event.dto';
import { AnalyticsEventsService } from '../services/analytics-events.service';
import { AnalyticsCalculationService } from '../services/analytics-calculation.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';

@ApiTags('analytics')
@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(
    private readonly analyticsEventsService: AnalyticsEventsService,
    private readonly analyticsCalculationService: AnalyticsCalculationService,
  ) {}

  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log an analytics event' })
  @ApiHeader({
    name: 'x-session-id',
    description: 'Optional session ID for tracking multi-session onboarding',
    required: false,
    schema: { type: 'string', maxLength: 255 },
  })
  @ApiResponse({
    status: 201,
    description: 'Event logged successfully',
    schema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', format: 'uuid', nullable: true },
        timestamp: { type: 'string', format: 'date-time' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  async logEvent(
    @Body() createEventDto: CreateAnalyticsEventDto,
    @Request() req: any,
  ) {
    const userId = req.user?.userId;
    const workspaceId = req.user?.currentWorkspaceId;

    // Proper error handling with correct HTTP status codes
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    if (!workspaceId) {
      throw new BadRequestException('Workspace ID is required');
    }

    const timestamp = new Date(createEventDto.timestamp);

    // Extract and validate session ID from headers
    const rawSessionId = req.headers['x-session-id'];
    const sessionId = typeof rawSessionId === 'string' && rawSessionId.length <= 255
      ? rawSessionId.trim()
      : undefined;

    // Log event and get actual event ID (or null if duplicate/error)
    const eventId = await this.analyticsEventsService.logEvent(
      userId,
      workspaceId,
      createEventDto.event,
      createEventDto.data || {},
      sessionId,
    );

    return {
      eventId, // Return actual event ID (null for duplicates/errors)
      timestamp: timestamp.toISOString(),
      message: 'Event logged successfully',
    };
  }

  @Get('onboarding/funnel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get onboarding funnel metrics (Admin/Owner only)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO 8601 date (default: 30 days ago)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO 8601 date (default: today)' })
  @ApiQuery({ name: 'workspaceId', required: false, description: 'Filter by workspace (optional)' })
  @ApiResponse({ status: 200, description: 'Funnel metrics returned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid date range' })
  @ApiResponse({ status: 403, description: 'User not authorized (not admin/owner)' })
  async getFunnelMetrics(@Request() req: any) {
    const userRole = req.user?.role;

    // Check if user is admin or owner
    if (userRole !== 'admin' && userRole !== 'owner') {
      throw new ForbiddenException('Admin or Owner role required to access analytics');
    }

    // Parse query parameters
    const startDateParam = req.query?.startDate;
    const endDateParam = req.query?.endDate;
    const workspaceId = req.query?.workspaceId;

    // Default to 30 days ago if not provided
    const endDate = endDateParam ? new Date(endDateParam) : new Date();
    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid date format. Use ISO 8601 format (e.g., 2026-01-01T00:00:00Z)');
    }

    if (startDate > endDate) {
      throw new BadRequestException('Start date must be before end date');
    }

    return this.analyticsCalculationService.calculateFunnelMetrics(
      startDate,
      endDate,
      workspaceId,
    );
  }

  @Get('onboarding/user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get user-specific onboarding analytics' })
  @ApiResponse({ status: 200, description: 'User analytics returned successfully' })
  @ApiResponse({ status: 403, description: 'User not authorized' })
  @ApiResponse({ status: 404, description: 'User onboarding not found' })
  async getUserAnalytics(@Request() req: any, @Param('userId') userId: string) {
    const currentUserId = req.user?.userId;
    const userRole = req.user?.role;

    // User can access own analytics OR admin/owner can access any user
    const isAuthorized =
      currentUserId === userId ||
      userRole === 'admin' ||
      userRole === 'owner';

    if (!isAuthorized) {
      throw new ForbiddenException('You can only access your own analytics');
    }

    return this.analyticsCalculationService.calculateUserOnboardingMetrics(userId);
  }

  @Post('events/batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log a batch of analytics events' })
  @ApiResponse({ status: 201, description: 'Events logged successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body or batch too large' })
  @ApiResponse({ status: 401, description: 'User not authenticated' })
  async logEventBatch(
    @Body() batchDto: BatchAnalyticsEventDto,
    @Request() req: any,
  ) {
    const userId = req.user?.userId;
    const workspaceId = req.user?.currentWorkspaceId;

    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    if (!workspaceId) {
      throw new BadRequestException('Workspace ID is required');
    }

    // Note: @ArrayMinSize(1) and @ArrayMaxSize(50) on BatchAnalyticsEventDto
    // handle empty/oversized validation via the global ValidationPipe.
    // This defensive check guards against edge cases where the pipe is bypassed.
    if (!batchDto.events || batchDto.events.length === 0) {
      throw new BadRequestException('Events array is required and cannot be empty');
    }

    const results = await Promise.allSettled(
      batchDto.events.map(event =>
        this.analyticsEventsService.logEvent(
          userId,
          workspaceId,
          event.event,
          event.data || {},
        ),
      ),
    );

    const successCount = results.filter(
      r => r.status === 'fulfilled' && r.value !== null,
    ).length;

    return {
      received: batchDto.events.length,
      processed: successCount,
      timestamp: new Date().toISOString(),
    };
  }
}
