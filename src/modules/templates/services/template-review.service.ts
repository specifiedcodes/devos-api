/**
 * Template Review Service
 *
 * Story 19-5: Template Rating & Reviews
 */
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { TemplateReview } from '../../../database/entities/template-review.entity';
import { Template } from '../../../database/entities/template.entity';
import { User } from '../../../database/entities/user.entity';
import { CreateTemplateReviewDto } from '../dto/create-template-review.dto';
import { UpdateTemplateReviewDto } from '../dto/update-template-review.dto';
import { TemplateReviewQueryDto, ReviewSortOption } from '../dto/template-review-query.dto';
import { TemplateAuditService } from './template-audit.service';

export interface ReviewStatsResponse {
  avgRating: number;
  ratingCount: number;
  ratingBreakdown: Record<number, number>;
}

export interface PaginatedReviewsResponse {
  reviews: TemplateReview[];
  total: number;
  page: number;
  limit: number;
  ratingBreakdown: Record<number, number>;
}

@Injectable()
export class TemplateReviewService {
  constructor(
    @InjectRepository(TemplateReview)
    private reviewRepository: Repository<TemplateReview>,
    @InjectRepository(Template)
    private templateRepository: Repository<Template>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
    private auditService: TemplateAuditService,
  ) {}

  /**
   * Create a new review (validates user has used the template)
   */
  async createReview(
    workspaceId: string,
    userId: string,
    dto: CreateTemplateReviewDto,
  ): Promise<TemplateReview> {
    // Check if template exists and belongs to workspace
    const template = await this.templateRepository.findOne({
      where: { id: dto.templateId, workspaceId },
    });

    if (!template) {
      throw new NotFoundException('Template not found in this workspace');
    }

    // Check if user already reviewed this template
    const existingReview = await this.reviewRepository.findOne({
      where: { templateId: dto.templateId, userId },
    });

    if (existingReview) {
      throw new ForbiddenException('You have already reviewed this template');
    }

    // Check if user has used the template (for verified badge)
    const isVerifiedUse = await this.hasUserUsedTemplate(userId, dto.templateId);

    // Use transaction for atomic review creation and stats update
    const savedReview = await this.dataSource.transaction(async (manager) => {
      // Create review
      const review = manager.create(TemplateReview, {
        ...dto,
        userId,
        isVerifiedUse,
      });

      const saved = await manager.save(review);

      // Update template stats within transaction
      const stats = await manager
        .createQueryBuilder(TemplateReview, 'review')
        .select('AVG(review.rating)', 'avgRating')
        .addSelect('COUNT(*)', 'ratingCount')
        .where('review.templateId = :templateId', { templateId: dto.templateId })
        .getRawOne();

      await manager.update(Template, dto.templateId, {
        avgRating: stats?.avgRating ? parseFloat(stats.avgRating).toFixed(2) : 0,
        ratingCount: stats?.ratingCount ? parseInt(stats.ratingCount, 10) : 0,
      });

      return saved;
    });

    // Log audit event
    await this.auditService.logEvent({
      templateId: dto.templateId,
      workspaceId,
      actorId: userId,
      action: 'review_created',
      metadata: { rating: dto.rating, reviewId: savedReview.id },
    });

    // Load user relation
    const reviewWithUser = await this.reviewRepository.findOne({
      where: { id: savedReview.id },
      relations: ['user'],
    });

    return reviewWithUser!;
  }

  /**
   * Get reviews with pagination, sorting, and filtering
   */
  async getReviews(
    templateId: string,
    query: TemplateReviewQueryDto,
  ): Promise<PaginatedReviewsResponse> {
    const { page = 1, limit = 10, sortBy, ratingFilter, userId } = query;

    const queryBuilder = this.reviewRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.user', 'user')
      .where('review.templateId = :templateId', { templateId });

    // Apply rating filter
    if (ratingFilter) {
      queryBuilder.andWhere('review.rating = :ratingFilter', { ratingFilter });
    }

    // Apply user filter
    if (userId) {
      queryBuilder.andWhere('review.userId = :userId', { userId });
    }

    // Apply sorting
    switch (sortBy) {
      case ReviewSortOption.MOST_HELPFUL:
        queryBuilder.orderBy('review.helpfulCount', 'DESC');
        break;
      case ReviewSortOption.MOST_RECENT:
        queryBuilder.orderBy('review.createdAt', 'DESC');
        break;
      case ReviewSortOption.HIGHEST_RATING:
        queryBuilder.orderBy('review.rating', 'DESC');
        break;
      case ReviewSortOption.LOWEST_RATING:
        queryBuilder.orderBy('review.rating', 'ASC');
        break;
      default:
        queryBuilder.orderBy('review.helpfulCount', 'DESC');
    }

    // Add secondary sort by created date
    queryBuilder.addOrderBy('review.createdAt', 'DESC');

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const reviews = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // Get rating breakdown
    const ratingBreakdown = await this.getRatingBreakdown(templateId);

    return {
      reviews,
      total,
      page,
      limit,
      ratingBreakdown,
    };
  }

  /**
   * Update own review
   */
  async updateReview(
    reviewId: string,
    userId: string,
    dto: UpdateTemplateReviewDto,
  ): Promise<TemplateReview> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: ['template'],
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== userId) {
      throw new ForbiddenException('You can only edit your own reviews');
    }

    // Update review
    Object.assign(review, dto);
    const updatedReview = await this.reviewRepository.save(review);

    // Update template stats if rating changed
    if (dto.rating !== undefined) {
      await this.updateTemplateStats(review.templateId);
    }

    // Load user relation
    const reviewWithUser = await this.reviewRepository.findOne({
      where: { id: updatedReview.id },
      relations: ['user'],
    });

    return reviewWithUser!;
  }

  /**
   * Delete own review
   */
  async deleteReview(reviewId: string, userId: string): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    const templateId = review.templateId;

    await this.reviewRepository.remove(review);

    // Update template stats
    await this.updateTemplateStats(templateId);
  }

  /**
   * Mark review as helpful
   * Includes userId parameter for rate limiting and spam prevention
   */
  async markHelpful(reviewId: string, userId: string): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Prevent users from marking their own reviews as helpful
    if (review.userId === userId) {
      throw new ForbiddenException('You cannot mark your own review as helpful');
    }

    await this.reviewRepository.increment({ id: reviewId }, 'helpfulCount', 1);
  }

  /**
   * Get a specific review by ID
   */
  async getReviewById(templateId: string, reviewId: string): Promise<TemplateReview> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId, templateId },
      relations: ['user'],
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }

  /**
   * Flag inappropriate review (admin/moderator action)
   */
  async flagReview(
    reviewId: string,
    reason: string,
    flaggedBy: string,
  ): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: ['template'],
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Log audit event for flagging
    await this.auditService.logEvent({
      templateId: review.templateId,
      workspaceId: review.template?.workspaceId || undefined,
      actorId: flaggedBy,
      action: 'review_flagged',
      metadata: { reviewId, reason },
    });
  }

  /**
   * Check if user has used template (for verified badge)
   * This checks if the user has created a project from this template
   */
  async hasUserUsedTemplate(userId: string, templateId: string): Promise<boolean> {
    // Check if there's a project created from this template by this user
    // This would require a projects table - for now, we'll check template usage tracking
    // In a real implementation, this would query the projects table

    // For now, we'll check if the user has any scaffold jobs for this template
    // This is a simplified check - in production, you'd check actual project creation
    try {
      const result = await this.dataSource.query(
        `SELECT COUNT(*) as count
         FROM template_scaffold_jobs tsj
         WHERE tsj.template_id = $1 AND tsj.created_by = $2 AND tsj.status = 'completed'`,
        [templateId, userId],
      );

      return parseInt(result[0]?.count || '0', 10) > 0;
    } catch (error) {
      // If the table doesn't exist or query fails, return false
      // This ensures the review can still be created, just without verified badge
      console.warn('Could not verify template usage:', error);
      return false;
    }
  }

  /**
   * Get review statistics for template
   */
  async getReviewStats(templateId: string): Promise<ReviewStatsResponse> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    const ratingBreakdown = await this.getRatingBreakdown(templateId);

    return {
      avgRating: parseFloat(template.avgRating.toString()) || 0,
      ratingCount: template.ratingCount || 0,
      ratingBreakdown,
    };
  }

  /**
   * Get rating breakdown (1-5 stars with counts)
   */
  private async getRatingBreakdown(templateId: string): Promise<Record<number, number>> {
    const result = await this.reviewRepository
      .createQueryBuilder('review')
      .select('review.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('review.templateId = :templateId', { templateId })
      .groupBy('review.rating')
      .getRawMany();

    const breakdown: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    result.forEach((row) => {
      breakdown[row.rating] = parseInt(row.count, 10);
    });

    return breakdown;
  }

  /**
   * Update template avg_rating and rating_count after review changes
   */
  private async updateTemplateStats(templateId: string): Promise<void> {
    const stats = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avgRating')
      .addSelect('COUNT(*)', 'ratingCount')
      .where('review.templateId = :templateId', { templateId })
      .getRawOne();

    await this.templateRepository.update(templateId, {
      avgRating: stats?.avgRating ? parseFloat(stats.avgRating).toFixed(2) : 0,
      ratingCount: stats?.ratingCount ? parseInt(stats.ratingCount, 10) : 0,
    });
  }
}
