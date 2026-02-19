/**
 * MarketplaceController
 *
 * Story 18-5: Agent Marketplace Backend
 * Story 18-7: Agent Rating & Reviews
 * Story 18-8: Agent Installation Flow
 *
 * REST API endpoints for the agent marketplace.
 *
 * Important: Static routes (/search, /categories, /featured, /installed, etc.)
 * are registered BEFORE dynamic /:id routes to prevent Express
 * from treating static segments as UUID parameters.
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
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../admin/guards/super-admin.guard';
import { MarketplaceService } from './marketplace.service';
import {
  PublishAgentDto,
  UpdateListingDto,
  PublishVersionDto,
  BrowseAgentsQueryDto,
  SearchAgentsQueryDto,
  InstallAgentDto,
  UninstallAgentDto,
  UpdateInstalledDto,
  CheckUpdatesDto,
  ListInstalledQueryDto,
  SubmitReviewDto,
  ListReviewsQueryDto,
  MarketplaceAgentResponseDto,
  PaginatedAgentListDto,
  MarketplaceAgentDetailDto,
  CategoryWithCountDto,
  MarketplaceAgentSummaryDto,
  InstalledAgentResponseDto,
  PaginatedInstalledListDto,
  AgentUpdateAvailableDto,
  ReviewResponseDto,
  PaginatedReviewListDto,
  RatingHistogramDto,
  VoteReviewDto,
  ReviewVoteResponseDto,
  PublisherReplyDto,
  ReportReviewDto,
  // Story 18-8 DTOs
  InstallAgentVersionDto,
  AgentVersionSummaryDto,
  PreInstallCheckDto,
  PreInstallCheckResultDto,
  InstallationStatusDto,
  InstallationHistoryQueryDto,
  PaginatedInstallationLogDto,
} from './dto';

@ApiTags('Marketplace')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/marketplace/agents')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  // ---- Static routes FIRST (before :id) ----

  @Get()
  @ApiOperation({ summary: 'Browse marketplace agents' })
  @ApiResponse({ status: 200, type: PaginatedAgentListDto })
  async browseAgents(@Query() query: BrowseAgentsQueryDto): Promise<PaginatedAgentListDto> {
    return this.marketplaceService.browseAgents(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search marketplace agents' })
  @ApiResponse({ status: 200, type: PaginatedAgentListDto })
  async searchAgents(@Query() query: SearchAgentsQueryDto): Promise<PaginatedAgentListDto> {
    return this.marketplaceService.searchAgents(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List categories with agent counts' })
  @ApiResponse({ status: 200, type: [CategoryWithCountDto] })
  async listCategories(): Promise<CategoryWithCountDto[]> {
    return this.marketplaceService.listCategories();
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured agents' })
  @ApiResponse({ status: 200, type: [MarketplaceAgentSummaryDto] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFeaturedAgents(@Query('limit') limit?: number): Promise<MarketplaceAgentSummaryDto[]> {
    return this.marketplaceService.getFeaturedAgents(limit ? parseInt(String(limit), 10) : 10);
  }

  @Get('installed')
  @ApiOperation({ summary: 'List installed agents in workspace' })
  @ApiResponse({ status: 200, type: PaginatedInstalledListDto })
  @ApiResponse({ status: 403, description: 'Not a workspace member' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String, format: 'uuid' })
  async listInstalledAgents(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: ListInstalledQueryDto,
    @Req() req: any,
  ): Promise<PaginatedInstalledListDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.listInstalledAgents(workspaceId, query, actorId);
  }

  @Post('installed/check-updates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check for updates to installed agents' })
  @ApiResponse({ status: 200, type: [AgentUpdateAvailableDto] })
  @ApiResponse({ status: 403, description: 'Not a workspace member' })
  async checkForUpdates(@Body() dto: CheckUpdatesDto, @Req() req: any): Promise<AgentUpdateAvailableDto[]> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.checkForUpdates(dto.workspaceId, actorId);
  }

  // ---- Review Votes (Story 18-7) ----
  // IMPORTANT: These routes must come BEFORE :id routes to prevent Express
  // from treating 'reviews' as an agent ID parameter.

  @Post('reviews/:reviewId/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vote on a review (helpful/not helpful)' })
  @ApiResponse({ status: 200, type: ReviewVoteResponseDto })
  @ApiResponse({ status: 403, description: 'Cannot vote on own review' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @ApiParam({ name: 'reviewId', type: 'string', format: 'uuid' })
  async voteOnReview(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: VoteReviewDto,
    @Req() req: any,
  ): Promise<ReviewVoteResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.voteOnReview(reviewId, dto, actorId);
  }

  @Delete('reviews/:reviewId/vote')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove vote from a review' })
  @ApiResponse({ status: 204, description: 'Vote removed' })
  @ApiParam({ name: 'reviewId', type: 'string', format: 'uuid' })
  async removeVote(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.removeVote(reviewId, actorId);
  }

  // ---- Review Reports (Story 18-7) ----

  @Post('reviews/:reviewId/report')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a review for moderation' })
  @ApiResponse({ status: 201, description: 'Report submitted' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @ApiResponse({ status: 409, description: 'Already reported' })
  @ApiParam({ name: 'reviewId', type: 'string', format: 'uuid' })
  async reportReview(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: ReportReviewDto,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.reportReview(reviewId, dto, actorId);
  }

  // ---- Publishing ----

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Publish an agent to the marketplace' })
  @ApiResponse({ status: 201, type: MarketplaceAgentResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed or agent not publishable' })
  @ApiResponse({ status: 403, description: 'Not authorized to publish' })
  @ApiResponse({ status: 409, description: 'Agent already published or name taken' })
  async publishAgent(
    @Body() dto: PublishAgentDto,
    @Req() req: any,
  ): Promise<MarketplaceAgentResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.publishAgent(dto.workspaceId, dto.agentDefinitionId, dto, actorId);
  }

  // ---- Dynamic :id routes AFTER static routes ----

  @Get(':id')
  @ApiOperation({ summary: 'Get agent details' })
  @ApiResponse({ status: 200, type: MarketplaceAgentDetailDto })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async getAgentDetails(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MarketplaceAgentDetailDto> {
    return this.marketplaceService.getAgentDetails(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a marketplace listing' })
  @ApiResponse({ status: 200, type: MarketplaceAgentResponseDto })
  @ApiResponse({ status: 403, description: 'Not the publisher' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async updateListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
    @Req() req: any,
  ): Promise<MarketplaceAgentResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.updateListing(id, dto, actorId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unpublish an agent from the marketplace' })
  @ApiResponse({ status: 204, description: 'Agent unpublished' })
  @ApiResponse({ status: 403, description: 'Not the publisher' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async unpublishAgent(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.unpublishAgent(id, actorId);
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a new version' })
  @ApiResponse({ status: 200, type: MarketplaceAgentResponseDto })
  @ApiResponse({ status: 403, description: 'Not the publisher' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async publishNewVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishVersionDto,
    @Req() req: any,
  ): Promise<MarketplaceAgentResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.publishNewVersion(id, dto, actorId);
  }

  // ---- Installation ----

  @Post(':id/install')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Install an agent to workspace' })
  @ApiResponse({ status: 201, type: InstalledAgentResponseDto })
  @ApiResponse({ status: 400, description: 'Already installed or agent not available' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async installAgent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InstallAgentDto,
    @Req() req: any,
  ): Promise<InstalledAgentResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.installAgent(id, dto, actorId);
  }

  @Delete(':id/install')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Uninstall an agent from workspace' })
  @ApiResponse({ status: 204, description: 'Agent uninstalled' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async uninstallAgent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UninstallAgentDto,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.uninstallAgent(id, dto.workspaceId, actorId);
  }

  @Post(':id/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update installed agent to latest version' })
  @ApiResponse({ status: 200, type: InstalledAgentResponseDto })
  @ApiResponse({ status: 400, description: 'Already at latest version' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async updateInstalledAgent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInstalledDto,
    @Req() req: any,
  ): Promise<InstalledAgentResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.updateInstalledAgent(id, dto.workspaceId, actorId);
  }

  // ---- Story 18-8: Installation Flow ----

  @Get(':id/versions')
  @ApiOperation({ summary: 'Get available versions for an agent' })
  @ApiResponse({ status: 200, type: [AgentVersionSummaryDto] })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async getAgentVersions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AgentVersionSummaryDto[]> {
    return this.marketplaceService.getAgentVersions(id);
  }

  @Post(':id/install-version')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Install specific version of agent' })
  @ApiResponse({ status: 201, type: InstalledAgentResponseDto })
  @ApiResponse({ status: 400, description: 'Pre-install check failed or version invalid' })
  @ApiResponse({ status: 409, description: 'Already installed' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async installAgentVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InstallAgentVersionDto,
    @Req() req: any,
  ): Promise<InstalledAgentResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.installAgentVersion(id, dto, actorId);
  }

  @Post(':id/pre-install-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check installation requirements before installing' })
  @ApiResponse({ status: 200, type: PreInstallCheckResultDto })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async preInstallCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreInstallCheckDto,
  ): Promise<PreInstallCheckResultDto> {
    return this.marketplaceService.preInstallCheck(id, dto);
  }

  @Get('installations/:installationId')
  @ApiOperation({ summary: 'Get installation status/progress' })
  @ApiResponse({ status: 200, type: InstallationStatusDto })
  @ApiResponse({ status: 404, description: 'Installation not found' })
  @ApiParam({ name: 'installationId', type: 'string', format: 'uuid' })
  async getInstallationStatus(
    @Param('installationId', ParseUUIDPipe) installationId: string,
  ): Promise<InstallationStatusDto> {
    return this.marketplaceService.getInstallationStatus(installationId);
  }

  @Post('installations/:installationId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel an in-progress installation' })
  @ApiResponse({ status: 204, description: 'Installation cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel completed installation' })
  @ApiResponse({ status: 404, description: 'Installation not found' })
  @ApiParam({ name: 'installationId', type: 'string', format: 'uuid' })
  async cancelInstallation(
    @Param('installationId', ParseUUIDPipe) installationId: string,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.cancelInstallation(installationId, actorId);
  }

  @Post('installations/:installationId/rollback')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rollback a failed installation' })
  @ApiResponse({ status: 204, description: 'Installation rolled back' })
  @ApiResponse({ status: 400, description: 'Can only rollback failed installations' })
  @ApiResponse({ status: 404, description: 'Installation not found' })
  @ApiParam({ name: 'installationId', type: 'string', format: 'uuid' })
  async rollbackInstallation(
    @Param('installationId', ParseUUIDPipe) installationId: string,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.rollbackInstallation(installationId, actorId);
  }

  @Get('installations')
  @ApiOperation({ summary: 'Get installation history for a workspace' })
  @ApiResponse({ status: 200, type: PaginatedInstallationLogDto })
  @ApiResponse({ status: 403, description: 'Not a workspace member' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String, format: 'uuid' })
  async getInstallationHistory(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: InstallationHistoryQueryDto,
    @Req() req: any,
  ): Promise<PaginatedInstallationLogDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.getInstallationHistory(workspaceId, query, actorId);
  }

  // ---- Reviews ----

  @Post(':id/reviews')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a review' })
  @ApiResponse({ status: 201, type: ReviewResponseDto })
  @ApiResponse({ status: 400, description: 'Already reviewed or not installed' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async submitReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitReviewDto,
    @Req() req: any,
  ): Promise<ReviewResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.submitReview(id, dto.workspaceId, dto, actorId);
  }

  @Get(':id/reviews')
  @ApiOperation({ summary: 'Get reviews for an agent' })
  @ApiResponse({ status: 200, type: PaginatedReviewListDto })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async getReviews(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListReviewsQueryDto,
    @Req() req: any,
  ): Promise<PaginatedReviewListDto> {
    const currentUserId = req.user?.id || req.user?.userId;
    return this.marketplaceService.getReviews(id, query, currentUserId);
  }

  @Get(':id/reviews/histogram')
  @ApiOperation({ summary: 'Get rating histogram for an agent' })
  @ApiResponse({ status: 200, type: RatingHistogramDto })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async getRatingHistogram(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RatingHistogramDto> {
    return this.marketplaceService.getRatingHistogram(id);
  }

  @Delete(':id/reviews/:reviewId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete your review' })
  @ApiResponse({ status: 204, description: 'Review deleted' })
  @ApiResponse({ status: 403, description: 'Not the review author' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'reviewId', type: 'string', format: 'uuid' })
  async deleteReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.deleteReview(id, reviewId, actorId);
  }

  @Post(':id/reviews/:reviewId/reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publisher reply to a review' })
  @ApiResponse({ status: 200, type: ReviewResponseDto })
  @ApiResponse({ status: 403, description: 'Not the publisher' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'reviewId', type: 'string', format: 'uuid' })
  async replyToReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: PublisherReplyDto,
    @Req() req: any,
  ): Promise<ReviewResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.replyToReview(id, reviewId, dto, actorId);
  }

  @Delete(':id/reviews/:reviewId/reply')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove publisher reply' })
  @ApiResponse({ status: 204, description: 'Reply removed' })
  @ApiResponse({ status: 403, description: 'Not the publisher' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'reviewId', type: 'string', format: 'uuid' })
  async removeReply(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.removeReply(id, reviewId, actorId);
  }

  // ---- Admin endpoints ----

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Approve a pending listing (admin only)' })
  @ApiResponse({ status: 200, type: MarketplaceAgentResponseDto })
  @ApiResponse({ status: 400, description: 'Not pending review' })
  @ApiResponse({ status: 403, description: 'Platform admin access required' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async approveListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<MarketplaceAgentResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.approveListing(id, actorId);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Suspend a listing (admin only)' })
  @ApiResponse({ status: 200, description: 'Agent suspended' })
  @ApiResponse({ status: 403, description: 'Platform admin access required' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async suspendListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.suspendListing(id, reason, actorId);
  }

  @Post(':id/feature')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Feature/unfeature an agent (admin only)' })
  @ApiResponse({ status: 200, description: 'Feature status updated' })
  @ApiResponse({ status: 403, description: 'Platform admin access required' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async setFeatured(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('featured') featured: boolean,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.setFeatured(id, featured, actorId);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Verify a publisher (admin only)' })
  @ApiResponse({ status: 200, description: 'Publisher verified' })
  @ApiResponse({ status: 403, description: 'Platform admin access required' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async verifyPublisher(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.marketplaceService.verifyPublisher(id, actorId);
  }
}
