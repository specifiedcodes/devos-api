/**
 * MarketplaceService Unit Tests - Review Enhancements
 *
 * Story 18-7: Agent Rating & Reviews
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { MarketplaceService } from '../marketplace.service';
import { PromptSecurityService } from '../prompt-security.service';
import { AgentDefinitionValidatorService } from '../../custom-agents/agent-definition-validator.service';
import {
  MarketplaceAgent,
  MarketplaceAgentStatus,
} from '../../../database/entities/marketplace-agent.entity';
import { MarketplaceReview } from '../../../database/entities/marketplace-review.entity';
import { InstalledAgent } from '../../../database/entities/installed-agent.entity';
import { AgentDefinition } from '../../../database/entities/agent-definition.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { User } from '../../../database/entities/user.entity';
import { ReviewVote } from '../../../database/entities/review-vote.entity';
import { ReviewReport, ReviewReportReason } from '../../../database/entities/review-report.entity';
import { InstallationLog } from '../../../database/entities/installation-log.entity';
import { AgentDependencyService } from '../agent-dependency.service';
import { AgentConflictService } from '../agent-conflict.service';
import { MarketplaceEventsGateway } from '../marketplace-events.gateway';
import { ReviewSortBy } from '../dto';

describe('MarketplaceService - Review Enhancements (Story 18-7)', () => {
  let service: MarketplaceService;
  let marketplaceAgentRepo: jest.Mocked<Repository<MarketplaceAgent>>;
  let reviewRepo: jest.Mocked<Repository<MarketplaceReview>>;
  let reviewVoteRepo: jest.Mocked<Repository<ReviewVote>>;
  let reviewReportRepo: jest.Mocked<Repository<ReviewReport>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockUserId = 'user-uuid-123';
  const mockPublisherId = 'publisher-uuid-123';
  const mockWorkspaceId = 'workspace-uuid-123';
  const mockAgentId = 'agent-uuid-123';
  const mockReviewId = 'review-uuid-123';

  const mockQueryBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    leftJoin: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    const mockRepo = () => ({
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(mockQueryBuilder),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: getRepositoryToken(MarketplaceAgent), useValue: mockRepo() },
        { provide: getRepositoryToken(MarketplaceReview), useValue: mockRepo() },
        { provide: getRepositoryToken(InstalledAgent), useValue: mockRepo() },
        { provide: getRepositoryToken(AgentDefinition), useValue: mockRepo() },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockRepo() },
        { provide: getRepositoryToken(User), useValue: mockRepo() },
        { provide: getRepositoryToken(ReviewVote), useValue: mockRepo() },
        { provide: getRepositoryToken(ReviewReport), useValue: mockRepo() },
        { provide: getRepositoryToken(InstallationLog), useValue: mockRepo() },
        {
          provide: AgentDependencyService,
          useValue: {
            checkDependencies: jest.fn().mockResolvedValue({
              canInstall: true,
              missingDependencies: [],
              installedDependencies: [],
              conflicts: [],
              suggestions: [],
            }),
          },
        },
        {
          provide: AgentConflictService,
          useValue: {
            checkConflicts: jest.fn().mockResolvedValue({
              hasConflicts: false,
              conflicts: [],
              canForceInstall: true,
              warnings: [],
            }),
          },
        },
        {
          provide: MarketplaceEventsGateway,
          useValue: {
            emitProgress: jest.fn(),
            emitComplete: jest.fn(),
            emitError: jest.fn(),
          },
        },
        {
          provide: PromptSecurityService,
          useValue: { analyzeAgentDefinition: jest.fn() },
        },
        {
          provide: AgentDefinitionValidatorService,
          useValue: { validateDefinition: jest.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(() => ({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: { create: jest.fn(), save: jest.fn(), increment: jest.fn() },
            })),
          },
        },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
    marketplaceAgentRepo = module.get(getRepositoryToken(MarketplaceAgent));
    reviewRepo = module.get(getRepositoryToken(MarketplaceReview));
    reviewVoteRepo = module.get(getRepositoryToken(ReviewVote));
    reviewReportRepo = module.get(getRepositoryToken(ReviewReport));
    eventEmitter = module.get(EventEmitter2);
  });

  describe('getRatingHistogram', () => {
    it('should throw NotFoundException if agent not found', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(null);

      await expect(service.getRatingHistogram(mockAgentId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return histogram with correct breakdown', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockAgentId,
        avgRating: 4.5,
        ratingCount: 10,
        publisherUserId: mockPublisherId,
      } as MarketplaceAgent);

      reviewRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { rating: '5', count: '6' },
          { rating: '4', count: '3' },
          { rating: '1', count: '1' },
        ]),
      } as any);

      const result = await service.getRatingHistogram(mockAgentId);

      expect(result.avgRating).toBe(4.5);
      expect(result.totalReviews).toBe(10);
      expect(result.breakdown).toHaveLength(5);
      expect(result.breakdown[0].rating).toBe(5);
      expect(result.breakdown[0].count).toBe(6);
      expect(result.breakdown[0].percentage).toBe(60);
    });

    it('should handle agent with no reviews', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockAgentId,
        avgRating: 0,
        ratingCount: 0,
        publisherUserId: mockPublisherId,
      } as MarketplaceAgent);

      reviewRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      } as any);

      const result = await service.getRatingHistogram(mockAgentId);

      expect(result.avgRating).toBe(0);
      expect(result.totalReviews).toBe(0);
      expect(result.breakdown).toHaveLength(5);
      expect(result.breakdown.every((b) => b.count === 0)).toBe(true);
    });
  });

  describe('voteOnReview', () => {
    it('should throw NotFoundException if review not found', async () => {
      reviewRepo.findOne.mockResolvedValue(null);

      await expect(
        service.voteOnReview(mockReviewId, { isHelpful: true }, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when voting on own review', async () => {
      reviewRepo.findOne.mockResolvedValue({
        id: mockReviewId,
        marketplaceAgentId: mockAgentId,
        reviewerUserId: mockUserId, // Same as actor
      } as MarketplaceReview);

      await expect(
        service.voteOnReview(mockReviewId, { isHelpful: true }, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create new vote', async () => {
      reviewRepo.findOne.mockResolvedValue({
        id: mockReviewId,
        marketplaceAgentId: mockAgentId,
      } as MarketplaceReview);
      reviewVoteRepo.findOne.mockResolvedValue(null);
      reviewVoteRepo.create.mockReturnValue({
        reviewId: mockReviewId,
        userId: mockUserId,
        isHelpful: true,
      } as ReviewVote);
      reviewVoteRepo.save.mockResolvedValue({} as ReviewVote);

      // Mock vote counts query
      reviewVoteRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { reviewId: mockReviewId, helpful: '1', notHelpful: '0' },
        ]),
      } as any);

      // Mock user votes query
      reviewVoteRepo.find.mockResolvedValue([
        { reviewId: mockReviewId, userId: mockUserId, isHelpful: true } as ReviewVote,
      ]);

      const result = await service.voteOnReview(
        mockReviewId,
        { isHelpful: true },
        mockUserId,
      );

      expect(result.helpfulCount).toBe(1);
      expect(result.notHelpfulCount).toBe(0);
      expect(result.userVote).toBe('helpful');
    });

    it('should update existing vote', async () => {
      reviewRepo.findOne.mockResolvedValue({
        id: mockReviewId,
        marketplaceAgentId: mockAgentId,
      } as MarketplaceReview);
      reviewVoteRepo.findOne.mockResolvedValue({
        reviewId: mockReviewId,
        userId: mockUserId,
        isHelpful: false,
      } as ReviewVote);
      reviewVoteRepo.save.mockResolvedValue({} as ReviewVote);

      reviewVoteRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { reviewId: mockReviewId, helpful: '1', notHelpful: '0' },
        ]),
      } as any);

      // Mock user votes query
      reviewVoteRepo.find.mockResolvedValue([
        { reviewId: mockReviewId, userId: mockUserId, isHelpful: true } as ReviewVote,
      ]);

      await service.voteOnReview(mockReviewId, { isHelpful: true }, mockUserId);

      expect(reviewVoteRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isHelpful: true }),
      );
    });
  });

  describe('removeVote', () => {
    it('should remove existing vote', async () => {
      reviewVoteRepo.findOne.mockResolvedValue({
        reviewId: mockReviewId,
        userId: mockUserId,
        isHelpful: true,
      } as ReviewVote);
      reviewVoteRepo.remove.mockResolvedValue({} as ReviewVote);

      await service.removeVote(mockReviewId, mockUserId);

      expect(reviewVoteRepo.remove).toHaveBeenCalled();
    });

    it('should do nothing if no vote exists', async () => {
      reviewVoteRepo.findOne.mockResolvedValue(null);

      await service.removeVote(mockReviewId, mockUserId);

      expect(reviewVoteRepo.remove).not.toHaveBeenCalled();
    });
  });

  describe('deleteReview', () => {
    it('should throw NotFoundException if review not found', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockAgentId,
        publisherUserId: mockPublisherId,
      } as MarketplaceAgent);
      reviewRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deleteReview(mockAgentId, mockReviewId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not review author', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockAgentId,
        publisherUserId: mockPublisherId,
      } as MarketplaceAgent);
      reviewRepo.findOne.mockResolvedValue({
        id: mockReviewId,
        marketplaceAgentId: mockAgentId,
        reviewerUserId: 'other-user-id',
      } as MarketplaceReview);

      await expect(
        service.deleteReview(mockAgentId, mockReviewId, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should delete review and recalculate rating', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockAgentId,
        publisherUserId: mockPublisherId,
      } as MarketplaceAgent);
      reviewRepo.findOne.mockResolvedValue({
        id: mockReviewId,
        marketplaceAgentId: mockAgentId,
        reviewerUserId: mockUserId,
      } as MarketplaceReview);
      reviewRepo.remove.mockResolvedValue({} as MarketplaceReview);
      reviewRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ avgRating: '4.0', count: '5' }),
      } as any);
      marketplaceAgentRepo.update.mockResolvedValue({} as any);

      await service.deleteReview(mockAgentId, mockReviewId, mockUserId);

      expect(reviewRepo.remove).toHaveBeenCalled();
      expect(marketplaceAgentRepo.update).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'marketplace.review.deleted',
        expect.any(Object),
      );
    });
  });

  describe('replyToReview', () => {
    it('should throw ForbiddenException if not publisher', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockAgentId,
        publisherUserId: mockPublisherId,
        publisherWorkspaceId: mockWorkspaceId,
      } as MarketplaceAgent);

      await expect(
        service.replyToReview(mockAgentId, mockReviewId, { reply: 'Thanks!' }, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should add reply to review', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockAgentId,
        publisherUserId: mockUserId,
        publisherWorkspaceId: mockWorkspaceId,
      } as MarketplaceAgent);
      reviewRepo.findOne.mockResolvedValue({
        id: mockReviewId,
        marketplaceAgentId: mockAgentId,
        publisherReply: null,
        reviewer: { name: 'Reviewer' },
      } as unknown as MarketplaceReview);
      reviewRepo.save.mockResolvedValue({
        id: mockReviewId,
        marketplaceAgentId: mockAgentId,
        publisherReply: 'Thanks!',
        publisherReplyAt: expect.any(Date),
        publisherReplyBy: mockUserId,
        reviewer: { name: 'Reviewer' },
      } as unknown as MarketplaceReview);

      // Mock vote counts
      reviewVoteRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      } as any);
      reviewVoteRepo.find.mockResolvedValue([]);

      const result = await service.replyToReview(
        mockAgentId,
        mockReviewId,
        { reply: 'Thanks!' },
        mockUserId,
      );

      expect(result.publisherReply).toBe('Thanks!');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'marketplace.review.reply_added',
        expect.any(Object),
      );
    });
  });

  describe('reportReview', () => {
    it('should throw NotFoundException if review not found', async () => {
      reviewRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reportReview(mockReviewId, { reason: ReviewReportReason.SPAM }, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if already reported', async () => {
      reviewRepo.findOne.mockResolvedValue({
        id: mockReviewId,
      } as MarketplaceReview);
      reviewReportRepo.findOne.mockResolvedValue({
        id: 'existing-report',
      } as ReviewReport);

      await expect(
        service.reportReview(mockReviewId, { reason: ReviewReportReason.SPAM }, mockUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('should create report', async () => {
      reviewRepo.findOne.mockResolvedValue({
        id: mockReviewId,
      } as MarketplaceReview);
      reviewReportRepo.findOne.mockResolvedValue(null);
      reviewReportRepo.create.mockReturnValue({
        reviewId: mockReviewId,
        reporterUserId: mockUserId,
        reason: ReviewReportReason.SPAM,
        details: null,
        status: 'pending',
      } as ReviewReport);
      reviewReportRepo.save.mockResolvedValue({} as ReviewReport);

      await service.reportReview(
        mockReviewId,
        { reason: ReviewReportReason.SPAM, details: 'Test details' },
        mockUserId,
      );

      expect(reviewReportRepo.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'marketplace.review.reported',
        expect.any(Object),
      );
    });
  });

  describe('getReviews with sorting', () => {
    it('should sort by highest rated', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockAgentId,
        publisherUserId: mockPublisherId,
      } as MarketplaceAgent);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      reviewRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);
      reviewVoteRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      } as any);
      reviewVoteRepo.find.mockResolvedValue([]);

      await service.getReviews(mockAgentId, { sortBy: ReviewSortBy.HIGHEST_RATED });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('review.rating', 'DESC');
    });

    it('should filter by rating', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockAgentId,
        publisherUserId: mockPublisherId,
      } as MarketplaceAgent);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      reviewRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);
      reviewVoteRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      } as any);
      reviewVoteRepo.find.mockResolvedValue([]);

      await service.getReviews(mockAgentId, { rating: 5 });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('review.rating = :rating', {
        rating: 5,
      });
    });
  });
});
