/**
 * Template Review Controller
 *
 * Story 19-5: Template Rating & Reviews
 * Story 19-9: Template Analytics (review tracking integration)
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from '../../workspace/guards/workspace-member.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { WorkspaceId } from '../../workspace/decorators/workspace-id.decorator';
import { User } from '../../../database/entities/user.entity';
import { TemplateReviewService } from '../services/template-review.service';
import { TemplateAnalyticsService } from '../services/template-analytics.service';
import { TemplateAnalyticsEventType } from '../../../database/entities/template-analytics-event.entity';
import { CreateTemplateReviewDto } from '../dto/create-template-review.dto';
import { UpdateTemplateReviewDto } from '../dto/update-template-review.dto';
import { TemplateReviewQueryDto } from '../dto/template-review-query.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';

@ApiTags('Template Reviews')
@ApiBearerAuth('JWT-auth')
@Controller('templates/:templateId/reviews')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class TemplateReviewController {
  constructor(
    private readonly reviewService: TemplateReviewService,
    private readonly analyticsService: TemplateAnalyticsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Submit a review for a template' })
  @ApiResponse({ status: 201, description: 'Review created successfully' })
  @ApiResponse({ status: 403, description: 'Already reviewed or not authorized' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async createReview(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: User,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: CreateTemplateReviewDto,
  ) {
    // Override templateId from param to ensure consistency
    dto.templateId = templateId;
    const result = await this.reviewService.createReview(workspaceId, user.id, dto);

    // Story 19-9: Track review_submitted event (fire-and-forget)
    this.analyticsService.trackEvent({
      templateId,
      workspaceId,
      userId: user.id,
      eventType: TemplateAnalyticsEventType.REVIEW_SUBMITTED,
      metadata: { rating: dto.rating },
    }).catch(() => { /* fire-and-forget */ });

    return result;
  }

  @Get()
  @ApiOperation({ summary: 'List reviews for a template' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully' })
  async getReviews(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Query() query: TemplateReviewQueryDto,
  ) {
    return this.reviewService.getReviews(templateId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get review statistics for a template' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  async getReviewStats(@Param('templateId', ParseUUIDPipe) templateId: string) {
    return this.reviewService.getReviewStats(templateId);
  }

  @Get(':reviewId')
  @ApiOperation({ summary: 'Get a specific review' })
  @ApiResponse({ status: 200, description: 'Review retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async getReview(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ) {
    return this.reviewService.getReviewById(templateId, reviewId);
  }

  @Put(':reviewId')
  @ApiOperation({ summary: 'Update own review' })
  @ApiResponse({ status: 200, description: 'Review updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to edit this review' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async updateReview(
    @CurrentUser() user: User,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: UpdateTemplateReviewDto,
  ) {
    return this.reviewService.updateReview(reviewId, user.id, dto);
  }

  @Delete(':reviewId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete own review' })
  @ApiResponse({ status: 204, description: 'Review deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to delete this review' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async deleteReview(
    @CurrentUser() user: User,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ) {
    return this.reviewService.deleteReview(reviewId, user.id);
  }

  @Post(':reviewId/helpful')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark review as helpful' })
  @ApiResponse({ status: 200, description: 'Marked as helpful' })
  @ApiResponse({ status: 403, description: 'Cannot mark own review as helpful' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async markHelpful(
    @CurrentUser() user: User,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ) {
    await this.reviewService.markHelpful(reviewId, user.id);
    return { message: 'Marked as helpful' };
  }

  @Post(':reviewId/flag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flag review as inappropriate (admin only)' })
  @ApiResponse({ status: 200, description: 'Review flagged' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @Roles(WorkspaceRole.ADMIN)
  async flagReview(
    @CurrentUser() user: User,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body('reason') reason: string,
  ) {
    await this.reviewService.flagReview(reviewId, reason, user.id);
    return { message: 'Review flagged for moderation' };
  }
}
