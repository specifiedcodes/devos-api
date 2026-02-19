/**
 * MarketplaceService
 *
 * Story 18-5: Agent Marketplace Backend
 * Story 18-7: Agent Rating & Reviews
 * Story 18-8: Agent Installation Flow
 *
 * Service for publishing, discovering, and installing marketplace agents.
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner, SelectQueryBuilder } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MarketplaceAgent,
  MarketplaceAgentCategory,
  MarketplaceAgentStatus,
  MarketplacePricingType,
} from '../../database/entities/marketplace-agent.entity';
import { MarketplaceReview } from '../../database/entities/marketplace-review.entity';
import { InstalledAgent } from '../../database/entities/installed-agent.entity';
import { AgentDefinition, AgentDefinitionSpec } from '../../database/entities/agent-definition.entity';
import { WorkspaceMember, WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { User } from '../../database/entities/user.entity';
import { ReviewVote } from '../../database/entities/review-vote.entity';
import { ReviewReport, ReviewReportReason } from '../../database/entities/review-report.entity';
import {
  InstallationLog,
  InstallationStatus,
  InstallationStep,
  InstallationStepInfo,
} from '../../database/entities/installation-log.entity';
import { PromptSecurityService } from './prompt-security.service';
import { AgentDefinitionValidatorService } from '../custom-agents/agent-definition-validator.service';
import { AgentDependencyService } from './agent-dependency.service';
import { AgentConflictService } from './agent-conflict.service';
import { MarketplaceEventsGateway } from './marketplace-events.gateway';
import {
  PublishAgentDto,
  UpdateListingDto,
  PublishVersionDto,
  BrowseAgentsQueryDto,
  SearchAgentsQueryDto,
  SortBy,
  InstallAgentDto,
  UninstallAgentDto,
  UpdateInstalledDto,
  CheckUpdatesDto,
  ListInstalledQueryDto,
  SubmitReviewDto,
  ListReviewsQueryDto,
  ReviewSortBy,
  MarketplaceAgentResponseDto,
  MarketplaceAgentSummaryDto,
  MarketplaceAgentDetailDto,
  PaginatedAgentListDto,
  CategoryWithCountDto,
  InstalledAgentResponseDto,
  PaginatedInstalledListDto,
  AgentUpdateAvailableDto,
  ReviewResponseDto,
  PaginatedReviewListDto,
  RatingHistogramDto,
  RatingBreakdownDto,
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

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentRepo: Repository<MarketplaceAgent>,
    @InjectRepository(MarketplaceReview)
    private readonly reviewRepo: Repository<MarketplaceReview>,
    @InjectRepository(InstalledAgent)
    private readonly installedAgentRepo: Repository<InstalledAgent>,
    @InjectRepository(AgentDefinition)
    private readonly definitionRepo: Repository<AgentDefinition>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ReviewVote)
    private readonly reviewVoteRepo: Repository<ReviewVote>,
    @InjectRepository(ReviewReport)
    private readonly reviewReportRepo: Repository<ReviewReport>,
    @InjectRepository(InstallationLog)
    private readonly installationLogRepo: Repository<InstallationLog>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly promptSecurityService: PromptSecurityService,
    private readonly validatorService: AgentDefinitionValidatorService,
    private readonly dependencyService: AgentDependencyService,
    private readonly conflictService: AgentConflictService,
    @Inject(forwardRef(() => MarketplaceEventsGateway))
    private readonly eventsGateway: MarketplaceEventsGateway,
  ) {}

  // ---- Publishing ----

  /**
   * Publish an agent definition to the marketplace.
   * Creates a draft listing that requires review before publication.
   */
  async publishAgent(
    workspaceId: string,
    definitionId: string,
    dto: PublishAgentDto,
    actorId: string,
  ): Promise<MarketplaceAgentResponseDto> {
    // Validate actor is workspace member
    await this.validateMemberRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
    ]);

    // Get the agent definition
    const definition = await this.definitionRepo.findOne({
      where: { id: definitionId, workspaceId },
    });
    if (!definition) {
      throw new NotFoundException('Agent definition not found');
    }

    // Validate definition
    const validationResult = this.validatorService.validateDefinition(
      definition.definition as unknown as Record<string, unknown>,
    );
    if (!validationResult.valid) {
      throw new BadRequestException({
        message: 'Agent definition validation failed',
        errors: validationResult.errors,
      });
    }

    // Check for malicious prompt patterns
    const securityResult = await this.promptSecurityService.analyzeAgentDefinition(
      definition.definition as unknown as { system_prompt?: string; tools?: { allowed?: string[] } },
    );
    if (!securityResult.isSafe) {
      throw new BadRequestException({
        message: 'Agent definition contains potentially malicious content',
        findings: securityResult.findings,
      });
    }

    // Check if name is already taken
    const existingByName = await this.marketplaceAgentRepo.findOne({
      where: { name: dto.name },
    });
    if (existingByName) {
      throw new ConflictException(`Marketplace agent with name '${dto.name}' already exists`);
    }

    // Check if definition is already published
    const existingByDefinition = await this.marketplaceAgentRepo.findOne({
      where: { agentDefinitionId: definitionId },
    });
    if (existingByDefinition) {
      throw new ConflictException('This agent definition is already published to the marketplace');
    }

    // Check if this is the publisher's first publication
    const previousPublications = await this.marketplaceAgentRepo.count({
      where: { publisherUserId: actorId },
    });
    const isFirstTimePublisher = previousPublications === 0;

    // Determine initial status
    const status = isFirstTimePublisher
      ? MarketplaceAgentStatus.PENDING_REVIEW
      : MarketplaceAgentStatus.PUBLISHED;

    // Create the marketplace listing
    const entity = this.marketplaceAgentRepo.create({
      agentDefinitionId: definitionId,
      publisherUserId: actorId,
      publisherWorkspaceId: workspaceId,
      name: dto.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
      displayName: dto.displayName,
      shortDescription: dto.shortDescription,
      longDescription: dto.longDescription,
      category: dto.category as MarketplaceAgentCategory,
      tags: this.sanitizeTags(dto.tags),
      iconUrl: dto.iconUrl || null,
      screenshots: dto.screenshots || [],
      latestVersion: definition.version,
      totalInstalls: 0,
      avgRating: 0,
      ratingCount: 0,
      isFeatured: false,
      isVerified: false,
      pricingType: dto.pricingType || MarketplacePricingType.FREE,
      priceCents: dto.priceCents || null,
      status,
      publishedAt: status === MarketplaceAgentStatus.PUBLISHED ? new Date() : null,
    });

    const saved = await this.marketplaceAgentRepo.save(entity);

    // Emit event
    this.eventEmitter.emit('marketplace.agent.published', {
      agentId: saved.id,
      publisherId: actorId,
      status: saved.status,
      isFirstTimePublisher,
    });

    return this.toResponseDto(saved);
  }

  /**
   * Update an existing marketplace listing.
   */
  async updateListing(
    marketplaceAgentId: string,
    dto: UpdateListingDto,
    actorId: string,
  ): Promise<MarketplaceAgentResponseDto> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    // Validate publisher
    if (agent.publisherUserId !== actorId) {
      // Check if user is admin
      const member = await this.memberRepo.findOne({
        where: { workspaceId: agent.publisherWorkspaceId, userId: actorId },
      });
      if (!member || (member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN)) {
        throw new ForbiddenException('Only the publisher or workspace admin can update this listing');
      }
    }

    // Update fields
    if (dto.displayName !== undefined) agent.displayName = dto.displayName;
    if (dto.shortDescription !== undefined) agent.shortDescription = dto.shortDescription;
    if (dto.longDescription !== undefined) agent.longDescription = dto.longDescription;
    if (dto.category !== undefined) agent.category = dto.category;
    if (dto.tags !== undefined) agent.tags = this.sanitizeTags(dto.tags);
    if (dto.iconUrl !== undefined) agent.iconUrl = dto.iconUrl || null;
    if (dto.screenshots !== undefined) agent.screenshots = dto.screenshots;
    if (dto.pricingType !== undefined) agent.pricingType = dto.pricingType;

    const updated = await this.marketplaceAgentRepo.save(agent);

    this.eventEmitter.emit('marketplace.agent.updated', {
      agentId: updated.id,
      actorId,
    });

    return this.toResponseDto(updated);
  }

  /**
   * Unpublish (remove) an agent from the marketplace.
   */
  async unpublishAgent(
    marketplaceAgentId: string,
    actorId: string,
  ): Promise<void> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    // Validate publisher
    if (agent.publisherUserId !== actorId) {
      const member = await this.memberRepo.findOne({
        where: { workspaceId: agent.publisherWorkspaceId, userId: actorId },
      });
      if (!member || (member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN)) {
        throw new ForbiddenException('Only the publisher or workspace admin can unpublish this listing');
      }
    }

    await this.marketplaceAgentRepo.remove(agent);

    this.eventEmitter.emit('marketplace.agent.unpublished', {
      agentId: marketplaceAgentId,
      actorId,
    });
  }

  /**
   * Publish a new version of an existing marketplace agent.
   */
  async publishNewVersion(
    marketplaceAgentId: string,
    dto: PublishVersionDto,
    actorId: string,
  ): Promise<MarketplaceAgentResponseDto> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    // Validate publisher
    if (agent.publisherUserId !== actorId) {
      const member = await this.memberRepo.findOne({
        where: { workspaceId: agent.publisherWorkspaceId, userId: actorId },
      });
      if (!member || (member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN)) {
        throw new ForbiddenException('Only the publisher or workspace admin can publish new versions');
      }
    }

    // Get the current definition
    const definition = await this.definitionRepo.findOne({
      where: { id: agent.agentDefinitionId },
    });
    if (!definition) {
      throw new NotFoundException('Original agent definition not found');
    }

    // Update version
    if (dto.version) {
      agent.latestVersion = dto.version;
    } else {
      agent.latestVersion = definition.version;
    }

    const updated = await this.marketplaceAgentRepo.save(agent);

    this.eventEmitter.emit('marketplace.agent.version_published', {
      agentId: updated.id,
      version: updated.latestVersion,
      actorId,
    });

    return this.toResponseDto(updated);
  }

  // ---- Discovery ----

  /**
   * Browse marketplace agents with pagination and filtering.
   */
  async browseAgents(query: BrowseAgentsQueryDto): Promise<PaginatedAgentListDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.marketplaceAgentRepo
      .createQueryBuilder('agent')
      .leftJoinAndSelect('agent.publisher', 'publisher')
      .where('agent.status = :status', { status: MarketplaceAgentStatus.PUBLISHED });

    if (query.category) {
      qb.andWhere('agent.category = :category', { category: query.category });
    }

    if (query.pricingType) {
      qb.andWhere('agent.pricingType = :pricingType', { pricingType: query.pricingType });
    }

    if (query.tag) {
      qb.andWhere('agent.tags @> :tag', { tag: [query.tag] });
    }

    if (query.verifiedOnly) {
      qb.andWhere('agent.isVerified = true');
    }

    // Sorting
    this.applySorting(qb, query.sortBy || SortBy.POPULARITY);

    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item) => this.toSummaryDto(item)),
      total,
      page,
      limit,
    };
  }

  /**
   * Get full details of a specific marketplace agent.
   */
  async getAgentDetails(marketplaceAgentId: string): Promise<MarketplaceAgentDetailDto> {
    const agent = await this.marketplaceAgentRepo.findOne({
      where: { id: marketplaceAgentId },
      relations: ['publisher'],
    });

    if (!agent) {
      throw new NotFoundException('Marketplace agent not found');
    }

    // Only show published agents (except to publisher)
    if (agent.status !== MarketplaceAgentStatus.PUBLISHED) {
      throw new NotFoundException('Marketplace agent not found');
    }

    return this.toDetailDto(agent);
  }

  /**
   * Full-text search on marketplace agents.
   */
  async searchAgents(query: SearchAgentsQueryDto): Promise<PaginatedAgentListDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.marketplaceAgentRepo
      .createQueryBuilder('agent')
      .leftJoinAndSelect('agent.publisher', 'publisher')
      .where('agent.status = :status', { status: MarketplaceAgentStatus.PUBLISHED });

    // Use PostgreSQL full-text search
    if (query.q) {
      const searchTerms = query.q.split(' ').join(' & ');
      qb.andWhere(
        `to_tsvector('english', coalesce(agent.display_name, '') || ' ' || coalesce(agent.short_description, '') || ' ' || coalesce(agent.long_description, '')) @@ to_tsquery('english', :query)`,
        { query: searchTerms },
      );
    }

    if (query.category) {
      qb.andWhere('agent.category = :category', { category: query.category });
    }

    if (query.pricingType) {
      qb.andWhere('agent.pricingType = :pricingType', { pricingType: query.pricingType });
    }

    // Sorting
    this.applySorting(qb, query.sortBy || SortBy.POPULARITY);

    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item) => this.toSummaryDto(item)),
      total,
      page,
      limit,
    };
  }

  /**
   * List all available categories with agent counts.
   */
  async listCategories(): Promise<CategoryWithCountDto[]> {
    const result = await this.marketplaceAgentRepo
      .createQueryBuilder('agent')
      .select('agent.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('agent.status = :status', { status: MarketplaceAgentStatus.PUBLISHED })
      .groupBy('agent.category')
      .getRawMany();

    return result.map((row) => ({
      category: row.category as MarketplaceAgentCategory,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Get featured/popular agents for homepage.
   */
  async getFeaturedAgents(limit: number = 10): Promise<MarketplaceAgentSummaryDto[]> {
    const agents = await this.marketplaceAgentRepo.find({
      where: {
        status: MarketplaceAgentStatus.PUBLISHED,
        isFeatured: true,
      },
      relations: ['publisher'],
      order: { totalInstalls: 'DESC' },
      take: limit,
    });

    // If not enough featured agents, add popular ones
    if (agents.length < limit) {
      const additionalAgents = await this.marketplaceAgentRepo.find({
        where: {
          status: MarketplaceAgentStatus.PUBLISHED,
          isFeatured: false,
        },
        relations: ['publisher'],
        order: { totalInstalls: 'DESC' },
        take: limit - agents.length,
        skip: 0,
      });
      agents.push(...additionalAgents);
    }

    return agents.map((agent) => this.toSummaryDto(agent));
  }

  // ---- Installation ----

  /**
   * Install a marketplace agent to a workspace.
   * Creates a copy of the agent definition in the target workspace.
   */
  async installAgent(
    marketplaceAgentId: string,
    dto: InstallAgentDto,
    actorId: string,
  ): Promise<InstalledAgentResponseDto> {
    // Validate workspace membership
    await this.validateMemberRole(dto.workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
    ]);

    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    if (agent.status !== MarketplaceAgentStatus.PUBLISHED) {
      throw new BadRequestException('This agent is not available for installation');
    }

    // Check if already installed
    const existing = await this.installedAgentRepo.findOne({
      where: { workspaceId: dto.workspaceId, marketplaceAgentId },
    });
    if (existing) {
      throw new ConflictException('Agent is already installed in this workspace');
    }

    // Get original definition
    const originalDefinition = await this.definitionRepo.findOne({
      where: { id: agent.agentDefinitionId },
    });
    if (!originalDefinition) {
      throw new NotFoundException('Original agent definition not found');
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create a copy of the definition in the target workspace
      const copiedDefinition = queryRunner.manager.create(AgentDefinition, {
        workspaceId: dto.workspaceId,
        name: `${agent.name}-marketplace`,
        displayName: agent.displayName,
        description: agent.shortDescription,
        version: agent.latestVersion,
        schemaVersion: originalDefinition.schemaVersion,
        definition: originalDefinition.definition,
        icon: originalDefinition.icon,
        category: originalDefinition.category,
        tags: originalDefinition.tags,
        isPublished: false,
        isActive: true,
        createdBy: actorId,
      });
      await queryRunner.manager.save(copiedDefinition);

      // Create installed agent record
      const installed = queryRunner.manager.create(InstalledAgent, {
        workspaceId: dto.workspaceId,
        marketplaceAgentId,
        installedBy: actorId,
        installedVersion: agent.latestVersion,
        autoUpdate: dto.autoUpdate || false,
        localDefinitionId: copiedDefinition.id,
      });
      await queryRunner.manager.save(installed);

      // Increment install count
      await queryRunner.manager.increment(
        MarketplaceAgent,
        { id: marketplaceAgentId },
        'totalInstalls',
        1,
      );

      await queryRunner.commitTransaction();

      this.eventEmitter.emit('marketplace.agent.installed', {
        agentId: marketplaceAgentId,
        workspaceId: dto.workspaceId,
        userId: actorId,
      });

      // Fetch with relations for response
      const installedWithRelations = await this.installedAgentRepo.findOne({
        where: { id: installed.id },
        relations: ['marketplaceAgent', 'marketplaceAgent.publisher'],
      });

      return this.toInstalledResponseDto(installedWithRelations!);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Uninstall an agent from a workspace.
   */
  async uninstallAgent(
    marketplaceAgentId: string,
    workspaceId: string,
    actorId: string,
  ): Promise<void> {
    // Validate workspace membership
    await this.validateMemberRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    const installed = await this.installedAgentRepo.findOne({
      where: { workspaceId, marketplaceAgentId },
    });

    if (!installed) {
      throw new NotFoundException('Agent is not installed in this workspace');
    }

    // Delete local definition if exists
    if (installed.localDefinitionId) {
      await this.definitionRepo.delete({ id: installed.localDefinitionId });
    }

    // Delete installed record
    await this.installedAgentRepo.remove(installed);

    this.eventEmitter.emit('marketplace.agent.uninstalled', {
      agentId: marketplaceAgentId,
      workspaceId,
      userId: actorId,
    });
  }

  /**
   * List all agents installed in a workspace.
   */
  async listInstalledAgents(
    workspaceId: string,
    query: ListInstalledQueryDto,
    actorId: string,
  ): Promise<PaginatedInstalledListDto> {
    // Validate workspace membership
    await this.validateMemberRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
      WorkspaceRole.VIEWER,
    ]);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await this.installedAgentRepo.findAndCount({
      where: { workspaceId },
      relations: ['marketplaceAgent', 'marketplaceAgent.publisher'],
      order: { installedAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      items: items.map((item) => this.toInstalledResponseDto(item)),
      total,
      page,
      limit,
    };
  }

  /**
   * Check for updates to installed agents.
   */
  async checkForUpdates(workspaceId: string, actorId: string): Promise<AgentUpdateAvailableDto[]> {
    // Validate workspace membership
    await this.validateMemberRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
      WorkspaceRole.VIEWER,
    ]);

    const installedAgents = await this.installedAgentRepo.find({
      where: { workspaceId },
      relations: ['marketplaceAgent'],
    });

    const updates: AgentUpdateAvailableDto[] = [];

    for (const installed of installedAgents) {
      if (installed.marketplaceAgent) {
        const marketplaceVersion = installed.marketplaceAgent.latestVersion;
        if (this.compareVersions(marketplaceVersion, installed.installedVersion) > 0) {
          updates.push({
            marketplaceAgentId: installed.marketplaceAgentId,
            installedVersion: installed.installedVersion,
            latestVersion: marketplaceVersion,
            agentName: installed.marketplaceAgent.name,
          });
        }
      }
    }

    return updates;
  }

  /**
   * Update an installed agent to the latest version.
   */
  async updateInstalledAgent(
    marketplaceAgentId: string,
    workspaceId: string,
    actorId: string,
  ): Promise<InstalledAgentResponseDto> {
    // Validate workspace membership
    await this.validateMemberRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
    ]);

    const installed = await this.installedAgentRepo.findOne({
      where: { workspaceId, marketplaceAgentId },
    });

    if (!installed) {
      throw new NotFoundException('Agent is not installed in this workspace');
    }

    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    if (agent.latestVersion === installed.installedVersion) {
      throw new BadRequestException('Agent is already at the latest version');
    }

    // Get the latest definition
    const originalDefinition = await this.definitionRepo.findOne({
      where: { id: agent.agentDefinitionId },
    });
    if (!originalDefinition) {
      throw new NotFoundException('Original agent definition not found');
    }

    // Update local definition
    if (installed.localDefinitionId) {
      await this.definitionRepo.update(installed.localDefinitionId, {
        definition: originalDefinition.definition,
        version: agent.latestVersion,
      });
    }

    // Update installed record
    installed.installedVersion = agent.latestVersion;
    installed.updatedAt = new Date();
    const updated = await this.installedAgentRepo.save(installed);

    // Fetch with relations
    const withRelations = await this.installedAgentRepo.findOne({
      where: { id: updated.id },
      relations: ['marketplaceAgent', 'marketplaceAgent.publisher'],
    });

    this.eventEmitter.emit('marketplace.agent.updated_installed', {
      agentId: marketplaceAgentId,
      workspaceId,
      userId: actorId,
      newVersion: agent.latestVersion,
    });

    return this.toInstalledResponseDto(withRelations!);
  }

  // ---- Reviews ----

  /**
   * Submit a review for a marketplace agent.
   */
  async submitReview(
    marketplaceAgentId: string,
    workspaceId: string,
    dto: SubmitReviewDto,
    actorId: string,
  ): Promise<ReviewResponseDto> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    // Check if user has the agent installed
    const installed = await this.installedAgentRepo.findOne({
      where: { workspaceId, marketplaceAgentId },
    });

    if (!installed) {
      throw new BadRequestException('You must install the agent before reviewing it');
    }

    // Check for existing review
    const existingReview = await this.reviewRepo.findOne({
      where: { marketplaceAgentId, reviewerUserId: actorId },
    });

    let review: MarketplaceReview;

    if (existingReview) {
      // Update existing review
      existingReview.rating = dto.rating;
      existingReview.review = dto.review || null;
      existingReview.versionReviewed = dto.versionReviewed || installed.installedVersion;
      review = await this.reviewRepo.save(existingReview);
    } else {
      // Create new review
      review = this.reviewRepo.create({
        marketplaceAgentId,
        reviewerUserId: actorId,
        reviewerWorkspaceId: workspaceId,
        rating: dto.rating,
        review: dto.review || null,
        versionReviewed: dto.versionReviewed || installed.installedVersion,
      });
      review = await this.reviewRepo.save(review);
    }

    // Recalculate average rating
    await this.recalculateRating(marketplaceAgentId);

    // Fetch with user for response
    const withUser = await this.reviewRepo.findOne({
      where: { id: review.id },
      relations: ['reviewer'],
    });

    return this.toReviewResponseDto(withUser!, { helpful: 0, notHelpful: 0 }, null);
  }

  /**
   * Get reviews for a marketplace agent.
   * Story 18-7: Enhanced with sorting and filtering.
   */
  async getReviews(
    marketplaceAgentId: string,
    query: ListReviewsQueryDto,
    currentUserId?: string,
  ): Promise<PaginatedReviewListDto> {
    await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const qb = this.reviewRepo
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.reviewer', 'reviewer')
      .where('review.marketplaceAgentId = :agentId', { agentId: marketplaceAgentId });

    // Filter by rating
    if (query.rating) {
      qb.andWhere('review.rating = :rating', { rating: query.rating });
    }

    // Apply sorting
    this.applyReviewSorting(qb, query.sortBy || ReviewSortBy.RECENT);

    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    // Get vote counts and user vote status for each review
    const reviewIds = items.map((r) => r.id);
    const voteCounts = await this.getVoteCountsForReviews(reviewIds);
    const userVotes = currentUserId
      ? await this.getUserVotesForReviews(reviewIds, currentUserId)
      : new Map<string, 'helpful' | 'not_helpful' | null>();

    return {
      items: items.map((item) =>
        this.toReviewResponseDto(item, voteCounts.get(item.id), userVotes.get(item.id)),
      ),
      total,
      page,
      limit,
    };
  }

  /**
   * Get rating histogram for an agent.
   * Story 18-7: Rating histogram endpoint.
   */
  async getRatingHistogram(marketplaceAgentId: string): Promise<RatingHistogramDto> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    // Get breakdown by rating
    const result = await this.reviewRepo
      .createQueryBuilder('review')
      .select('review.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('review.marketplaceAgentId = :agentId', { agentId: marketplaceAgentId })
      .groupBy('review.rating')
      .getRawMany();

    const totalReviews = agent.ratingCount;
    const breakdown: RatingBreakdownDto[] = [];

    // Build breakdown for all ratings 5 to 1
    for (let rating = 5; rating >= 1; rating--) {
      const row = result.find((r) => parseInt(r.rating, 10) === rating);
      const count = row ? parseInt(row.count, 10) : 0;
      breakdown.push({
        rating,
        count,
        percentage: totalReviews > 0 ? Math.round((count / totalReviews) * 100 * 10) / 10 : 0,
      });
    }

    return {
      breakdown,
      avgRating: agent.avgRating != null ? parseFloat(agent.avgRating.toString()) : 0,
      totalReviews,
    };
  }

  /**
   * Delete a review (only by the review author).
   * Story 18-7: Delete review endpoint.
   */
  async deleteReview(
    marketplaceAgentId: string,
    reviewId: string,
    actorId: string,
  ): Promise<void> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    const review = await this.reviewRepo.findOne({
      where: { id: reviewId, marketplaceAgentId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.reviewerUserId !== actorId) {
      throw new ForbiddenException('Only the review author can delete this review');
    }

    await this.reviewRepo.remove(review);

    // Recalculate average rating
    await this.recalculateRating(marketplaceAgentId);

    this.eventEmitter.emit('marketplace.review.deleted', {
      reviewId,
      agentId: marketplaceAgentId,
      userId: actorId,
    });
  }

  /**
   * Vote on a review (helpful/not helpful).
   * Story 18-7: Review helpful voting.
   */
  async voteOnReview(
    reviewId: string,
    dto: VoteReviewDto,
    actorId: string,
  ): Promise<ReviewVoteResponseDto> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Prevent self-voting on own reviews
    if (review.reviewerUserId === actorId) {
      throw new ForbiddenException('You cannot vote on your own review');
    }

    // Check for existing vote
    let vote = await this.reviewVoteRepo.findOne({
      where: { reviewId, userId: actorId },
    });

    if (vote) {
      // Update existing vote
      vote.isHelpful = dto.isHelpful;
    } else {
      // Create new vote
      vote = this.reviewVoteRepo.create({
        reviewId,
        userId: actorId,
        isHelpful: dto.isHelpful,
      });
    }

    await this.reviewVoteRepo.save(vote);

    // Return updated counts
    return this.getReviewVoteResponse(reviewId, actorId);
  }

  /**
   * Remove vote from a review.
   * Story 18-7: Remove review vote.
   */
  async removeVote(reviewId: string, actorId: string): Promise<void> {
    const vote = await this.reviewVoteRepo.findOne({
      where: { reviewId, userId: actorId },
    });

    if (vote) {
      await this.reviewVoteRepo.remove(vote);
    }
  }

  /**
   * Reply to a review as the publisher.
   * Story 18-7: Publisher reply endpoint.
   */
  async replyToReview(
    marketplaceAgentId: string,
    reviewId: string,
    dto: PublisherReplyDto,
    actorId: string,
  ): Promise<ReviewResponseDto> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    // Validate user is the publisher or admin of publisher workspace
    if (agent.publisherUserId !== actorId) {
      const member = await this.memberRepo.findOne({
        where: { workspaceId: agent.publisherWorkspaceId, userId: actorId },
      });
      if (!member || (member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN)) {
        throw new ForbiddenException('Only the agent publisher can reply to reviews');
      }
    }

    const review = await this.reviewRepo.findOne({
      where: { id: reviewId, marketplaceAgentId },
      relations: ['reviewer'],
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Update or create publisher reply
    review.publisherReply = dto.reply;
    review.publisherReplyAt = new Date();
    review.publisherReplyBy = actorId;

    const saved = await this.reviewRepo.save(review);

    // Get vote counts
    const voteCounts = await this.getVoteCountsForReviews([reviewId]);
    const userVote = await this.getUserVotesForReviews([reviewId], actorId);

    this.eventEmitter.emit('marketplace.review.reply_added', {
      reviewId,
      agentId: marketplaceAgentId,
      publisherId: actorId,
    });

    return this.toReviewResponseDto(saved, voteCounts.get(reviewId), userVote.get(reviewId));
  }

  /**
   * Remove publisher reply from a review.
   * Story 18-7: Remove publisher reply.
   */
  async removeReply(
    marketplaceAgentId: string,
    reviewId: string,
    actorId: string,
  ): Promise<void> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    // Validate user is the publisher or admin
    if (agent.publisherUserId !== actorId) {
      const member = await this.memberRepo.findOne({
        where: { workspaceId: agent.publisherWorkspaceId, userId: actorId },
      });
      if (!member || (member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN)) {
        throw new ForbiddenException('Only the agent publisher can remove replies');
      }
    }

    const review = await this.reviewRepo.findOne({
      where: { id: reviewId, marketplaceAgentId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    review.publisherReply = null;
    review.publisherReplyAt = null;
    review.publisherReplyBy = null;

    await this.reviewRepo.save(review);

    this.eventEmitter.emit('marketplace.review.reply_removed', {
      reviewId,
      agentId: marketplaceAgentId,
      publisherId: actorId,
    });
  }

  /**
   * Report a review for moderation.
   * Story 18-7: Review report endpoint.
   */
  async reportReview(
    reviewId: string,
    dto: ReportReviewDto,
    actorId: string,
  ): Promise<void> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Check for existing report by this user
    const existingReport = await this.reviewReportRepo.findOne({
      where: { reviewId, reporterUserId: actorId },
    });

    if (existingReport) {
      throw new ConflictException('You have already reported this review');
    }

    // Create report
    const report = this.reviewReportRepo.create({
      reviewId,
      reporterUserId: actorId,
      reason: dto.reason,
      details: dto.details || null,
      status: 'pending' as const,
    });

    await this.reviewReportRepo.save(report);

    this.eventEmitter.emit('marketplace.review.reported', {
      reviewId,
      reporterId: actorId,
      reason: dto.reason,
    });
  }

  // ---- Private Helpers for Story 18-7 ----

  private applyReviewSorting(qb: SelectQueryBuilder<MarketplaceReview>, sortBy: ReviewSortBy): void {
    switch (sortBy) {
      case ReviewSortBy.HIGHEST_RATED:
        qb.orderBy('review.rating', 'DESC').addOrderBy('review.createdAt', 'DESC');
        break;
      case ReviewSortBy.LOWEST_RATED:
        qb.orderBy('review.rating', 'ASC').addOrderBy('review.createdAt', 'DESC');
        break;
      case ReviewSortBy.MOST_HELPFUL:
        // Subquery to count helpful votes
        qb.leftJoin(
          (subQuery) =>
            subQuery
              .select('review_id', 'reviewId')
              .addSelect('COUNT(*) FILTER (WHERE is_helpful = true)', 'helpfulCount')
              .from('review_votes', 'rv')
              .groupBy('review_id'),
          'votes',
          'votes."reviewId" = review.id',
        )
          .orderBy('votes."helpfulCount"', 'DESC', 'NULLS LAST')
          .addOrderBy('review.createdAt', 'DESC');
        break;
      case ReviewSortBy.RECENT:
      default:
        qb.orderBy('review.createdAt', 'DESC');
    }
  }

  private async getVoteCountsForReviews(
    reviewIds: string[],
  ): Promise<Map<string, { helpful: number; notHelpful: number }>> {
    if (reviewIds.length === 0) return new Map();

    const result = await this.reviewVoteRepo
      .createQueryBuilder('vote')
      .select('vote.reviewId', 'reviewId')
      .addSelect('COUNT(*) FILTER (WHERE vote.isHelpful = true)', 'helpful')
      .addSelect('COUNT(*) FILTER (WHERE vote.isHelpful = false)', 'notHelpful')
      .where('vote.reviewId IN (:...reviewIds)', { reviewIds })
      .groupBy('vote.reviewId')
      .getRawMany();

    const map = new Map<string, { helpful: number; notHelpful: number }>();
    for (const row of result) {
      map.set(row.reviewId, {
        helpful: parseInt(row.helpful, 10) || 0,
        notHelpful: parseInt(row.notHelpful, 10) || 0,
      });
    }

    // Ensure all review IDs have an entry
    for (const id of reviewIds) {
      if (!map.has(id)) {
        map.set(id, { helpful: 0, notHelpful: 0 });
      }
    }

    return map;
  }

  private async getUserVotesForReviews(
    reviewIds: string[],
    userId: string,
  ): Promise<Map<string, 'helpful' | 'not_helpful' | null>> {
    if (reviewIds.length === 0) return new Map();

    const votes = await this.reviewVoteRepo.find({
      where: reviewIds.map((id) => ({ reviewId: id, userId })),
    });

    const map = new Map<string, 'helpful' | 'not_helpful' | null>();
    for (const id of reviewIds) {
      map.set(id, null);
    }

    for (const vote of votes) {
      map.set(vote.reviewId, vote.isHelpful ? 'helpful' : 'not_helpful');
    }

    return map;
  }

  private async getReviewVoteResponse(
    reviewId: string,
    userId: string,
  ): Promise<ReviewVoteResponseDto> {
    const voteCounts = await this.getVoteCountsForReviews([reviewId]);
    const userVotes = await this.getUserVotesForReviews([reviewId], userId);
    const counts = voteCounts.get(reviewId) || { helpful: 0, notHelpful: 0 };
    const userVote = userVotes.get(reviewId) || null;

    return {
      helpfulCount: counts.helpful,
      notHelpfulCount: counts.notHelpful,
      userVote,
    };
  }

  // ---- Admin ----

  /**
   * Approve a pending marketplace listing (admin only).
   */
  async approveListing(
    marketplaceAgentId: string,
    actorId: string,
  ): Promise<MarketplaceAgentResponseDto> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    if (agent.status !== MarketplaceAgentStatus.PENDING_REVIEW) {
      throw new BadRequestException('Agent is not pending review');
    }

    agent.status = MarketplaceAgentStatus.PUBLISHED;
    agent.publishedAt = new Date();
    const updated = await this.marketplaceAgentRepo.save(agent);

    this.eventEmitter.emit('marketplace.agent.approved', {
      agentId: updated.id,
      actorId,
    });

    return this.toResponseDto(updated);
  }

  /**
   * Suspend a marketplace listing (admin only).
   */
  async suspendListing(
    marketplaceAgentId: string,
    reason: string,
    actorId: string,
  ): Promise<void> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    agent.status = MarketplaceAgentStatus.SUSPENDED;
    await this.marketplaceAgentRepo.save(agent);

    this.eventEmitter.emit('marketplace.agent.suspended', {
      agentId: marketplaceAgentId,
      reason,
      actorId,
    });
  }

  /**
   * Feature/unfeature an agent (admin only).
   */
  async setFeatured(
    marketplaceAgentId: string,
    featured: boolean,
    actorId: string,
  ): Promise<void> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    agent.isFeatured = featured;
    await this.marketplaceAgentRepo.save(agent);

    this.eventEmitter.emit('marketplace.agent.featured_changed', {
      agentId: marketplaceAgentId,
      featured,
      actorId,
    });
  }

  /**
   * Verify a publisher (admin only).
   */
  async verifyPublisher(
    marketplaceAgentId: string,
    actorId: string,
  ): Promise<void> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    agent.isVerified = true;
    await this.marketplaceAgentRepo.save(agent);

    this.eventEmitter.emit('marketplace.agent.verified', {
      agentId: marketplaceAgentId,
      publisherId: agent.publisherUserId,
      actorId,
    });
  }

  // ---- Story 18-8: Installation Flow ----

  /**
   * Get available versions for a marketplace agent.
   * Returns all published versions with changelog.
   */
  async getAgentVersions(
    marketplaceAgentId: string,
  ): Promise<AgentVersionSummaryDto[]> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    // Get all versions from agent version history
    // For now, we return the current version as the only version
    // In a full implementation, this would query an agent_versions table
    const versions: AgentVersionSummaryDto[] = [
      {
        version: agent.latestVersion,
        changelog: 'Current version',
        publishedAt: agent.publishedAt || agent.createdAt,
        isLatest: true,
        isBreaking: false,
      },
    ];

    return versions;
  }

  /**
   * Perform pre-installation check.
   * Returns detailed information about requirements, conflicts, and recommendations.
   */
  async preInstallCheck(
    marketplaceAgentId: string,
    dto: PreInstallCheckDto,
  ): Promise<PreInstallCheckResultDto> {
    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    if (agent.status !== MarketplaceAgentStatus.PUBLISHED) {
      return {
        canInstall: false,
        agentId: marketplaceAgentId,
        agentName: agent.name,
        targetVersion: dto.version || agent.latestVersion,
        permissions: [],
        tools: [],
        dependencies: { required: [], optional: [], missing: [] },
        conflicts: { hasConflicts: true, items: [{ type: 'version_conflict', severity: 'critical', message: 'Agent is not published' }] },
        warnings: ['This agent is not available for installation'],
        estimatedCost: { perRun: 0, description: 'N/A' },
        recommendations: [],
      };
    }

    const targetVersion = dto.version || agent.latestVersion;

    // Get the agent definition
    const definition = await this.definitionRepo.findOne({
      where: { id: agent.agentDefinitionId },
    });

    // Extract permissions and tools
    const permissions = this.extractPermissionsFromDefinition(definition);
    const tools = this.extractToolsFromDefinition(definition);

    // Check dependencies
    const depResult = await this.dependencyService.checkDependencies(
      marketplaceAgentId,
      dto.workspaceId,
    );

    // Check conflicts
    const conflictResult = await this.conflictService.checkConflicts(
      marketplaceAgentId,
      dto.workspaceId,
      targetVersion,
    );

    // Calculate estimated cost
    const estimatedCost = this.calculateEstimatedCost(definition);

    // Generate recommendations
    const recommendations: string[] = [];
    if (depResult.missingDependencies.length > 0) {
      recommendations.push('Install missing dependencies before proceeding');
    }
    if (conflictResult.conflicts.some((c) => c.severity === 'high')) {
      recommendations.push('Review conflicts before installing');
    }

    return {
      canInstall: depResult.canInstall && (conflictResult.canForceInstall || !conflictResult.hasConflicts),
      agentId: marketplaceAgentId,
      agentName: agent.name,
      targetVersion,
      permissions,
      tools,
      dependencies: {
        required: depResult.missingDependencies.filter((d) => d.isRequired).map((d) => d.agentName),
        optional: depResult.missingDependencies.filter((d) => !d.isRequired).map((d) => d.agentName),
        missing: depResult.missingDependencies.map((d) => d.agentName),
      },
      conflicts: {
        hasConflicts: conflictResult.hasConflicts,
        items: conflictResult.conflicts.map((c) => ({
          type: c.type,
          severity: c.severity,
          message: c.message,
          conflictingAgent: c.conflictingAgentName || undefined,
          resolution: c.resolution,
        })),
      },
      warnings: conflictResult.warnings,
      estimatedCost,
      recommendations: [...recommendations, ...depResult.suggestions],
    };
  }

  /**
   * Install a specific version of a marketplace agent.
   * Allows installing older versions for compatibility.
   */
  async installAgentVersion(
    marketplaceAgentId: string,
    dto: InstallAgentVersionDto,
    actorId: string,
  ): Promise<InstalledAgentResponseDto> {
    const result = await this.installWithProgress(marketplaceAgentId, dto, actorId);
    return result.installedAgent;
  }

  /**
   * Install agent with progress tracking.
   * Creates an installation log and emits progress events.
   */
  async installWithProgress(
    marketplaceAgentId: string,
    dto: InstallAgentVersionDto,
    actorId: string,
  ): Promise<{ installationId: string; installedAgent: InstalledAgentResponseDto }> {
    // Validate workspace membership
    await this.validateMemberRole(dto.workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
    ]);

    const agent = await this.findMarketplaceAgentOrThrow(marketplaceAgentId);

    if (agent.status !== MarketplaceAgentStatus.PUBLISHED) {
      throw new BadRequestException('This agent is not available for installation');
    }

    // Check if already installed
    const existing = await this.installedAgentRepo.findOne({
      where: { workspaceId: dto.workspaceId, marketplaceAgentId },
    });
    if (existing) {
      throw new ConflictException('Agent is already installed in this workspace');
    }

    // Run pre-install check unless skipped
    if (!dto.skipDependencyCheck) {
      const checkResult = await this.preInstallCheck(marketplaceAgentId, {
        workspaceId: dto.workspaceId,
        version: dto.version,
      });

      if (!checkResult.canInstall && !dto.forceInstall) {
        throw new BadRequestException({
          message: 'Pre-installation check failed',
          conflicts: checkResult.conflicts,
          missingDependencies: checkResult.dependencies.missing,
        });
      }
    }

    const targetVersion = dto.version || agent.latestVersion;

    // Create installation log
    const installationLog = this.installationLogRepo.create({
      workspaceId: dto.workspaceId,
      marketplaceAgentId,
      initiatedBy: actorId,
      targetVersion,
      status: InstallationStatus.PENDING,
      progressPercentage: 0,
      steps: this.createInstallationSteps(),
      startedAt: new Date(),
    });
    await this.installationLogRepo.save(installationLog);

    // Get original definition
    const originalDefinition = await this.definitionRepo.findOne({
      where: { id: agent.agentDefinitionId },
    });
    if (!originalDefinition) {
      await this.updateInstallationStatus(installationLog.id, InstallationStatus.FAILED, 'Original agent definition not found');
      throw new NotFoundException('Original agent definition not found');
    }

    try {
      // Execute installation steps
      await this.executeInstallationStep(installationLog, InstallationStep.PRE_CHECK, dto.workspaceId);
      await this.executeInstallationStep(installationLog, InstallationStep.VALIDATE_PERMISSIONS, dto.workspaceId);
      await this.executeInstallationStep(installationLog, InstallationStep.CHECK_DEPENDENCIES, dto.workspaceId);
      await this.executeInstallationStep(installationLog, InstallationStep.CHECK_CONFLICTS, dto.workspaceId);

      // Copy definition
      await this.executeInstallationStep(installationLog, InstallationStep.COPY_DEFINITION, dto.workspaceId);
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      let copiedDefinition: AgentDefinition;
      let installed: InstalledAgent;

      try {
        copiedDefinition = queryRunner.manager.create(AgentDefinition, {
          workspaceId: dto.workspaceId,
          name: `${agent.name}-marketplace`,
          displayName: agent.displayName,
          description: agent.shortDescription,
          version: targetVersion,
          schemaVersion: originalDefinition.schemaVersion,
          definition: originalDefinition.definition,
          icon: originalDefinition.icon,
          category: originalDefinition.category,
          tags: originalDefinition.tags,
          isPublished: false,
          isActive: true,
          createdBy: actorId,
        });
        await queryRunner.manager.save(copiedDefinition);

        await this.executeInstallationStep(installationLog, InstallationStep.INSTALL_DEPENDENCIES, dto.workspaceId);

        // Create installed agent record
        installed = queryRunner.manager.create(InstalledAgent, {
          workspaceId: dto.workspaceId,
          marketplaceAgentId,
          installedBy: actorId,
          installedVersion: targetVersion,
          autoUpdate: dto.autoUpdate || false,
          localDefinitionId: copiedDefinition.id,
        });
        await queryRunner.manager.save(installed);

        // Increment install count
        await queryRunner.manager.increment(
          MarketplaceAgent,
          { id: marketplaceAgentId },
          'totalInstalls',
          1,
        );

        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }

      await this.executeInstallationStep(installationLog, InstallationStep.CONFIGURE_AGENT, dto.workspaceId);
      await this.executeInstallationStep(installationLog, InstallationStep.VERIFY_INSTALLATION, dto.workspaceId);
      await this.executeInstallationStep(installationLog, InstallationStep.COMPLETE, dto.workspaceId);

      // Update installation log to completed
      await this.updateInstallationStatus(installationLog.id, InstallationStatus.COMPLETED);
      await this.installationLogRepo.update(installationLog.id, {
        installedAgentId: installed.id,
        completedAt: new Date(),
      });

      // Emit completion event
      this.eventsGateway.emitComplete({
        installationId: installationLog.id,
        marketplaceAgentId,
        agentName: agent.displayName,
        status: InstallationStatus.COMPLETED,
        currentStep: InstallationStep.COMPLETE,
        progressPercentage: 100,
        timestamp: new Date(),
      }, dto.workspaceId);

      // Emit event
      this.eventEmitter.emit('marketplace.agent.installed', {
        agentId: marketplaceAgentId,
        workspaceId: dto.workspaceId,
        userId: actorId,
        version: targetVersion,
      });

      // Fetch with relations for response
      const installedWithRelations = await this.installedAgentRepo.findOne({
        where: { id: installed.id },
        relations: ['marketplaceAgent', 'marketplaceAgent.publisher'],
      });

      return {
        installationId: installationLog.id,
        installedAgent: this.toInstalledResponseDto(installedWithRelations!),
      };
    } catch (error) {
      // Update installation log to failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateInstallationStatus(installationLog.id, InstallationStatus.FAILED, errorMessage);

      // Emit error event
      this.eventsGateway.emitError({
        installationId: installationLog.id,
        marketplaceAgentId,
        agentName: agent.displayName,
        status: InstallationStatus.FAILED,
        currentStep: installationLog.currentStep || InstallationStep.PRE_CHECK,
        progressPercentage: installationLog.progressPercentage,
        error: errorMessage,
        timestamp: new Date(),
      }, dto.workspaceId);

      throw error;
    }
  }

  /**
   * Get installation progress/status.
   */
  async getInstallationStatus(
    installationId: string,
    actorId: string,
  ): Promise<InstallationStatusDto> {
    const log = await this.installationLogRepo.findOne({
      where: { id: installationId },
      relations: ['marketplaceAgent'],
    });

    if (!log) {
      throw new NotFoundException('Installation not found');
    }

    // Validate workspace membership
    await this.validateMemberRole(log.workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
      WorkspaceRole.VIEWER,
    ]);

    return {
      id: log.id,
      workspaceId: log.workspaceId,
      marketplaceAgentId: log.marketplaceAgentId,
      agentName: log.marketplaceAgent?.displayName || 'Unknown',
      targetVersion: log.targetVersion,
      status: log.status,
      currentStep: log.currentStep || undefined,
      progressPercentage: log.progressPercentage,
      steps: log.steps?.map((s) => ({
        step: s.step,
        status: s.status,
        startedAt: s.startedAt?.toISOString(),
        completedAt: s.completedAt?.toISOString(),
        error: s.error,
      })),
      errorMessage: log.errorMessage || undefined,
      installedAgentId: log.installedAgentId || undefined,
      startedAt: log.startedAt.toISOString(),
      completedAt: log.completedAt?.toISOString(),
    };
  }

  /**
   * Cancel an in-progress installation.
   */
  async cancelInstallation(
    installationId: string,
    actorId: string,
  ): Promise<void> {
    const log = await this.installationLogRepo.findOne({
      where: { id: installationId },
    });

    if (!log) {
      throw new NotFoundException('Installation not found');
    }

    // Validate workspace membership (only workspace members can cancel)
    await this.validateMemberRole(log.workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
    ]);

    if (log.status === InstallationStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed installation');
    }

    if (log.status === InstallationStatus.FAILED || log.status === InstallationStatus.ROLLED_BACK) {
      throw new BadRequestException('Installation is already terminated');
    }

    // Update status to rolled back
    await this.installationLogRepo.update(installationId, {
      status: InstallationStatus.ROLLED_BACK,
      completedAt: new Date(),
    });

    // Emit cancellation event
    this.eventsGateway.emitCancelled({
      installationId,
      marketplaceAgentId: log.marketplaceAgentId,
      agentName: '',
      status: InstallationStatus.ROLLED_BACK,
      currentStep: log.currentStep || '',
      progressPercentage: log.progressPercentage,
      message: 'Installation cancelled by user',
      timestamp: new Date(),
    }, log.workspaceId);

    this.logger.log(`Installation ${installationId} cancelled by ${actorId}`);
  }

  /**
   * Rollback a failed or cancelled installation.
   */
  async rollbackInstallation(
    installationId: string,
    actorId: string,
  ): Promise<void> {
    const log = await this.installationLogRepo.findOne({
      where: { id: installationId },
    });

    if (!log) {
      throw new NotFoundException('Installation not found');
    }

    // Validate workspace membership (only workspace members can rollback)
    await this.validateMemberRole(log.workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
    ]);

    if (log.status !== InstallationStatus.FAILED && log.status !== InstallationStatus.ROLLED_BACK) {
      throw new BadRequestException('Can only rollback failed or cancelled installations');
    }

    // If an agent was partially installed, clean it up
    if (log.installedAgentId) {
      // Get the installed agent to find the local definition
      const installedAgent = await this.installedAgentRepo.findOne({
        where: { id: log.installedAgentId },
      });

      if (installedAgent) {
        // Delete the local definition if it exists
        if (installedAgent.localDefinitionId) {
          await this.definitionRepo.delete({ id: installedAgent.localDefinitionId });
        }
        // Delete the installed agent record
        await this.installedAgentRepo.delete({ id: log.installedAgentId });
      }
    }

    // Update status
    await this.installationLogRepo.update(installationId, {
      status: InstallationStatus.ROLLED_BACK,
      errorMessage: `Rolled back by ${actorId}`,
    });

    // Emit rollback event
    this.eventsGateway.emitRollback({
      installationId,
      marketplaceAgentId: log.marketplaceAgentId,
      agentName: '',
      status: InstallationStatus.ROLLED_BACK,
      currentStep: '',
      progressPercentage: 0,
      message: 'Installation rolled back',
      timestamp: new Date(),
    }, log.workspaceId);

    this.logger.log(`Installation ${installationId} rolled back by ${actorId}`);
  }

  /**
   * Get installation history for a workspace.
   */
  async getInstallationHistory(
    workspaceId: string,
    query: InstallationHistoryQueryDto,
    actorId: string,
  ): Promise<PaginatedInstallationLogDto> {
    // Validate workspace membership
    await this.validateMemberRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
      WorkspaceRole.VIEWER,
    ]);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.installationLogRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.marketplaceAgent', 'agent')
      .leftJoinAndSelect('log.initiator', 'initiator')
      .where('log.workspaceId = :workspaceId', { workspaceId });

    if (query.status) {
      qb.andWhere('log.status = :status', { status: query.status });
    }

    if (query.startDate) {
      qb.andWhere('log.startedAt >= :startDate', { startDate: query.startDate });
    }

    if (query.endDate) {
      qb.andWhere('log.startedAt <= :endDate', { endDate: query.endDate });
    }

    qb.orderBy('log.startedAt', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item) => ({
        id: item.id,
        workspaceId: item.workspaceId,
        marketplaceAgentId: item.marketplaceAgentId,
        agent: {
          id: item.marketplaceAgent?.id || '',
          displayName: item.marketplaceAgent?.displayName || 'Unknown',
          iconUrl: item.marketplaceAgent?.iconUrl || undefined,
        },
        targetVersion: item.targetVersion,
        status: item.status,
        initiatedBy: item.initiatedBy || undefined,
        initiatedByName: item.initiator?.name || undefined,
        installedAgentId: item.installedAgentId || undefined,
        errorMessage: item.errorMessage || undefined,
        duration: item.completedAt
          ? item.completedAt.getTime() - item.startedAt.getTime()
          : Date.now() - item.startedAt.getTime(),
        startedAt: item.startedAt.toISOString(),
        completedAt: item.completedAt?.toISOString(),
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }

  // ---- Private Helpers for Story 18-8 ----

  private createInstallationSteps(): InstallationStepInfo[] {
    return [
      { step: InstallationStep.PRE_CHECK, status: 'pending' },
      { step: InstallationStep.VALIDATE_PERMISSIONS, status: 'pending' },
      { step: InstallationStep.CHECK_DEPENDENCIES, status: 'pending' },
      { step: InstallationStep.CHECK_CONFLICTS, status: 'pending' },
      { step: InstallationStep.COPY_DEFINITION, status: 'pending' },
      { step: InstallationStep.INSTALL_DEPENDENCIES, status: 'pending' },
      { step: InstallationStep.CONFIGURE_AGENT, status: 'pending' },
      { step: InstallationStep.VERIFY_INSTALLATION, status: 'pending' },
      { step: InstallationStep.COMPLETE, status: 'pending' },
    ];
  }

  private async executeInstallationStep(
    log: InstallationLog,
    step: InstallationStep,
    workspaceId: string,
  ): Promise<void> {
    const stepIndex = log.steps?.findIndex((s) => s.step === step) ?? -1;
    if (stepIndex === -1 || !log.steps) return;

    // Update step to in_progress
    log.steps[stepIndex].status = 'in_progress';
    log.steps[stepIndex].startedAt = new Date();
    log.currentStep = step;
    log.progressPercentage = Math.round(((stepIndex + 1) / log.steps.length) * 100);
    log.status = this.getInstallationStatusForStep(step);

    await this.installationLogRepo.save(log);

    // Emit progress event
    this.eventsGateway.emitProgress({
      installationId: log.id,
      marketplaceAgentId: log.marketplaceAgentId,
      agentName: '',
      status: log.status,
      currentStep: step,
      progressPercentage: log.progressPercentage,
      timestamp: new Date(),
    }, workspaceId);

    // Simulate step execution time (in real implementation, this would do actual work)
    // For most steps, this is just validation which is quick

    // Update step to completed
    log.steps[stepIndex].status = 'completed';
    log.steps[stepIndex].completedAt = new Date();
    await this.installationLogRepo.save(log);
  }

  private getInstallationStatusForStep(step: InstallationStep): InstallationStatus {
    switch (step) {
      case InstallationStep.PRE_CHECK:
      case InstallationStep.VALIDATE_PERMISSIONS:
        return InstallationStatus.VALIDATING;
      case InstallationStep.CHECK_DEPENDENCIES:
        return InstallationStatus.RESOLVING_DEPENDENCIES;
      case InstallationStep.CHECK_CONFLICTS:
        return InstallationStatus.VALIDATING;
      case InstallationStep.COPY_DEFINITION:
      case InstallationStep.INSTALL_DEPENDENCIES:
        return InstallationStatus.DOWNLOADING;
      case InstallationStep.CONFIGURE_AGENT:
        return InstallationStatus.CONFIGURING;
      case InstallationStep.VERIFY_INSTALLATION:
      case InstallationStep.COMPLETE:
        return InstallationStatus.INSTALLING;
      default:
        return InstallationStatus.INSTALLING;
    }
  }

  private async updateInstallationStatus(
    installationId: string,
    status: InstallationStatus,
    errorMessage?: string,
  ): Promise<void> {
    await this.installationLogRepo.update(installationId, {
      status,
      errorMessage: errorMessage || null,
      completedAt: status === InstallationStatus.COMPLETED ||
                   status === InstallationStatus.FAILED ||
                   status === InstallationStatus.ROLLED_BACK
        ? new Date()
        : undefined,
    });
  }

  private extractPermissionsFromDefinition(definition: AgentDefinition | null): string[] {
    if (!definition) return [];
    const def = definition.definition as Record<string, unknown>;
    if (!def) return [];
    const spec = def.spec as Record<string, unknown> | undefined;
    if (!spec) return [];
    const permissions = spec.permissions as string[] | undefined;
    return Array.isArray(permissions) ? permissions : [];
  }

  private extractToolsFromDefinition(definition: AgentDefinition | null): string[] {
    if (!definition) return [];
    const def = definition.definition as Record<string, unknown>;
    if (!def) return [];
    const spec = def.spec as Record<string, unknown> | undefined;
    if (!spec) return [];
    const tools = spec.tools as Record<string, unknown> | undefined;
    if (!tools) return [];
    const allowed = tools.allowed as string[] | undefined;
    return Array.isArray(allowed) ? allowed : [];
  }

  private calculateEstimatedCost(definition: AgentDefinition | null): { perRun: number; description: string } {
    if (!definition) {
      return { perRun: 0, description: 'Unable to estimate cost' };
    }

    // Basic cost estimation based on typical agent usage
    // In a full implementation, this would analyze model preferences and estimated tokens
    const def = definition.definition as Record<string, unknown>;
    if (!def) {
      return { perRun: 5, description: 'Approximately $0.05 per agent invocation' };
    }

    const spec = def.spec as Record<string, unknown> | undefined;
    const modelPrefs = spec?.modelPreferences as Record<string, unknown> | undefined;

    // Estimate based on model tier
    const preferredTier = modelPrefs?.preferredTier as string | undefined;
    let costPerRun = 5; // Default ~$0.05

    if (preferredTier === 'premium') {
      costPerRun = 25; // ~$0.25 for premium models
    } else if (preferredTier === 'economy') {
      costPerRun = 1; // ~$0.01 for economy models
    }

    return {
      perRun: costPerRun,
      description: `Approximately $${(costPerRun / 100).toFixed(2)} per agent invocation`,
    };
  }

  // ---- Private Helpers ----

  private async findMarketplaceAgentOrThrow(id: string): Promise<MarketplaceAgent> {
    const agent = await this.marketplaceAgentRepo.findOne({
      where: { id },
      relations: ['publisher'],
    });
    if (!agent) {
      throw new NotFoundException('Marketplace agent not found');
    }
    return agent;
  }

  private async validateMemberRole(
    workspaceId: string,
    userId: string,
    allowedRoles: WorkspaceRole[],
  ): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId },
    });

    if (!member || !allowedRoles.includes(member.role)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action in this workspace',
      );
    }
  }

  private sanitizeTags(tags?: string[]): string[] {
    if (!tags) return [];
    const sanitized = tags
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0 && tag.length <= 50);
    return [...new Set(sanitized)];
  }

  private applySorting(qb: any, sortBy: SortBy): void {
    switch (sortBy) {
      case SortBy.POPULARITY:
        qb.orderBy('agent.totalInstalls', 'DESC');
        break;
      case SortBy.RATING:
        qb.orderBy('agent.avgRating', 'DESC');
        break;
      case SortBy.RECENT:
        qb.orderBy('agent.publishedAt', 'DESC');
        break;
      case SortBy.NAME:
        qb.orderBy('agent.displayName', 'ASC');
        break;
      default:
        qb.orderBy('agent.totalInstalls', 'DESC');
    }
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  private async recalculateRating(marketplaceAgentId: string): Promise<void> {
    const result = await this.reviewRepo
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avgRating')
      .addSelect('COUNT(*)', 'count')
      .where('review.marketplaceAgentId = :id', { id: marketplaceAgentId })
      .getRawOne();

    if (result) {
      const avgRating = parseFloat(result.avgRating);
      await this.marketplaceAgentRepo.update(marketplaceAgentId, {
        avgRating: !isNaN(avgRating) ? avgRating : 0,
        ratingCount: parseInt(result.count, 10) || 0,
      });
    }
  }

  private toSummaryDto(agent: MarketplaceAgent): MarketplaceAgentSummaryDto {
    const dto = new MarketplaceAgentSummaryDto();
    dto.id = agent.id;
    dto.name = agent.name;
    dto.displayName = agent.displayName;
    dto.shortDescription = agent.shortDescription;
    dto.category = agent.category;
    dto.tags = agent.tags;
    dto.iconUrl = agent.iconUrl || undefined;
    dto.latestVersion = agent.latestVersion;
    dto.totalInstalls = agent.totalInstalls;
    dto.avgRating = agent.avgRating != null ? parseFloat(agent.avgRating.toString()) : 0;
    dto.ratingCount = agent.ratingCount;
    dto.isFeatured = agent.isFeatured;
    dto.isVerified = agent.isVerified;
    dto.pricingType = agent.pricingType;
    dto.priceCents = agent.priceCents || undefined;
    dto.publisherName = agent.publisher?.name || 'Unknown';
    dto.createdAt = agent.createdAt;
    return dto;
  }

  private toDetailDto(agent: MarketplaceAgent): MarketplaceAgentDetailDto {
    const dto = new MarketplaceAgentDetailDto();
    Object.assign(dto, this.toSummaryDto(agent));
    dto.longDescription = agent.longDescription;
    dto.screenshots = agent.screenshots;
    dto.status = agent.status;
    dto.publishedAt = agent.publishedAt || undefined;
    return dto;
  }

  private toResponseDto(agent: MarketplaceAgent): MarketplaceAgentResponseDto {
    const dto = new MarketplaceAgentResponseDto();
    Object.assign(dto, this.toDetailDto(agent));
    dto.agentDefinitionId = agent.agentDefinitionId;
    dto.publisherUserId = agent.publisherUserId;
    dto.publisherWorkspaceId = agent.publisherWorkspaceId;
    dto.updatedAt = agent.updatedAt;
    return dto;
  }

  private toInstalledResponseDto(installed: InstalledAgent): InstalledAgentResponseDto {
    const dto = new InstalledAgentResponseDto();
    dto.id = installed.id;
    dto.marketplaceAgentId = installed.marketplaceAgentId;
    dto.workspaceId = installed.workspaceId;
    dto.installedVersion = installed.installedVersion;
    dto.autoUpdate = installed.autoUpdate;
    dto.localDefinitionId = installed.localDefinitionId || undefined;
    dto.installedAt = installed.installedAt;
    dto.agent = this.toSummaryDto(installed.marketplaceAgent!);
    return dto;
  }

  private toReviewResponseDto(
    review: MarketplaceReview,
    voteCounts?: { helpful: number; notHelpful: number },
    userVote?: 'helpful' | 'not_helpful' | null,
  ): ReviewResponseDto {
    const dto = new ReviewResponseDto();
    dto.id = review.id;
    dto.marketplaceAgentId = review.marketplaceAgentId;
    dto.reviewerUserId = review.reviewerUserId;
    dto.reviewerName = review.reviewer?.name || 'Anonymous';
    dto.rating = review.rating;
    dto.review = review.review || undefined;
    dto.versionReviewed = review.versionReviewed || undefined;
    dto.createdAt = review.createdAt;
    dto.updatedAt = review.updatedAt;

    // Story 18-7: Vote info
    dto.helpfulCount = voteCounts?.helpful || 0;
    dto.notHelpfulCount = voteCounts?.notHelpful || 0;
    dto.userVote = userVote ?? null;

    // Story 18-7: Publisher reply
    dto.publisherReply = review.publisherReply || null;
    dto.publisherReplyAt = review.publisherReplyAt || null;
    dto.publisherReplyBy = review.publisherReplyBy || null;

    return dto;
  }
}
