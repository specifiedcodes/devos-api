/**
 * Template Review Service Tests
 *
 * Story 19-5: Template Rating & Reviews
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TemplateReviewService } from '../services/template-review.service';
import { TemplateReview } from '../../../database/entities/template-review.entity';
import { Template } from '../../../database/entities/template.entity';
import { User } from '../../../database/entities/user.entity';
import { TemplateAuditService } from '../services/template-audit.service';
import { CreateTemplateReviewDto } from '../dto/create-template-review.dto';
import { UpdateTemplateReviewDto } from '../dto/update-template-review.dto';
import { ReviewSortOption } from '../dto/template-review-query.dto';

describe('TemplateReviewService', () => {
  let service: TemplateReviewService;
  let reviewRepository: Repository<TemplateReview>;
  let templateRepository: Repository<Template>;
  let userRepository: Repository<User>;
  let auditService: TemplateAuditService;
  let dataSource: DataSource;

  const mockTemplateId = 'template-uuid-1234';
  const mockUserId = 'user-uuid-1234';
  const mockWorkspaceId = 'workspace-uuid-1234';
  const mockReviewId = 'review-uuid-1234';

  const mockTemplate = {
    id: mockTemplateId,
    name: 'test-template',
    displayName: 'Test Template',
    avgRating: 0,
    ratingCount: 0,
    workspaceId: mockWorkspaceId,
  } as Template;

  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    name: 'Test User',
  } as unknown as User;

  const mockReview = {
    id: mockReviewId,
    templateId: mockTemplateId,
    userId: mockUserId,
    rating: 5,
    title: 'Great template!',
    body: 'This is a really good template that helped me build my project quickly and efficiently.',
    tags: ['Well Documented'],
    helpfulCount: 0,
    isVerifiedUse: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: mockUser,
  } as TemplateReview;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateReviewService,
        {
          provide: getRepositoryToken(TemplateReview),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            increment: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              addOrderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getCount: jest.fn().mockResolvedValue(1),
              getMany: jest.fn().mockResolvedValue([mockReview]),
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              getRawMany: jest.fn().mockResolvedValue([
                { rating: 5, count: '1' },
              ]),
              getRawOne: jest.fn().mockResolvedValue({ avgRating: '5.00', ratingCount: '1' }),
            })),
          },
        },
        {
          provide: getRepositoryToken(Template),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: TemplateAuditService,
          useValue: {
            logEvent: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([{ count: '0' }]),
          },
        },
      ],
    }).compile();

    service = module.get<TemplateReviewService>(TemplateReviewService);
    reviewRepository = module.get<Repository<TemplateReview>>(
      getRepositoryToken(TemplateReview),
    );
    templateRepository = module.get<Repository<Template>>(
      getRepositoryToken(Template),
    );
    auditService = module.get<TemplateAuditService>(TemplateAuditService);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createReview', () => {
    const createDto: CreateTemplateReviewDto = {
      rating: 5,
      title: 'Great template!',
      body: 'This is a really good template that helped me build my project quickly and efficiently.',
      templateId: mockTemplateId,
    };

    it('should create a review successfully', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(mockTemplate);
      jest.spyOn(reviewRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(reviewRepository, 'create').mockReturnValue(mockReview);
      jest.spyOn(reviewRepository, 'save').mockResolvedValue(mockReview);
      jest.spyOn(reviewRepository, 'findOne')
        .mockResolvedValueOnce(null) // For existing review check
        .mockResolvedValueOnce(mockReview); // For loading user relation

      const result = await service.createReview(mockWorkspaceId, mockUserId, createDto);

      expect(result).toBeDefined();
      expect(auditService.logEvent).toHaveBeenCalled();
    });

    it('should throw NotFoundException if template not found', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.createReview(mockWorkspaceId, mockUserId, createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user already reviewed', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(mockTemplate);
      jest.spyOn(reviewRepository, 'findOne').mockResolvedValue(mockReview);

      await expect(
        service.createReview(mockWorkspaceId, mockUserId, createDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getReviews', () => {
    it('should return paginated reviews', async () => {
      const result = await service.getReviews(mockTemplateId, {
        page: 1,
        limit: 10,
        sortBy: ReviewSortOption.MOST_HELPFUL,
      });

      expect(result).toBeDefined();
      expect(result.reviews).toBeDefined();
      expect(result.total).toBeDefined();
    });
  });

  describe('updateReview', () => {
    const updateDto: UpdateTemplateReviewDto = {
      rating: 4,
      body: 'Updated review body with enough characters to meet the minimum requirement.',
    };

    it('should update own review successfully', async () => {
      const reviewWithTemplate = { ...mockReview, template: mockTemplate };
      jest.spyOn(reviewRepository, 'findOne')
        .mockResolvedValueOnce(reviewWithTemplate as TemplateReview)
        .mockResolvedValueOnce(mockReview as TemplateReview);
      jest.spyOn(reviewRepository, 'save').mockResolvedValue(mockReview as TemplateReview);

      const result = await service.updateReview(mockReviewId, mockUserId, updateDto);

      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException if trying to update other user review', async () => {
      const reviewWithTemplate = { ...mockReview, template: mockTemplate };
      jest.spyOn(reviewRepository, 'findOne').mockResolvedValue(reviewWithTemplate as TemplateReview);

      await expect(
        service.updateReview(mockReviewId, 'other-user-id', updateDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if review not found', async () => {
      jest.spyOn(reviewRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateReview(mockReviewId, mockUserId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteReview', () => {
    it('should delete own review successfully', async () => {
      jest.spyOn(reviewRepository, 'findOne').mockResolvedValue(mockReview as TemplateReview);
      jest.spyOn(reviewRepository, 'remove').mockResolvedValue(mockReview as TemplateReview);

      await service.deleteReview(mockReviewId, mockUserId);

      expect(reviewRepository.remove).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if trying to delete other user review', async () => {
      jest.spyOn(reviewRepository, 'findOne').mockResolvedValue(mockReview as TemplateReview);

      await expect(
        service.deleteReview(mockReviewId, 'other-user-id'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markHelpful', () => {
    it('should increment helpful count', async () => {
      jest.spyOn(reviewRepository, 'increment').mockResolvedValue({ affected: 1, generatedMaps: [], raw: [] });

      await service.markHelpful(mockReviewId, mockUserId);

      expect(reviewRepository.increment).toHaveBeenCalledWith(
        { id: mockReviewId },
        'helpfulCount',
        1,
      );
    });
  });

  describe('getReviewStats', () => {
    it('should return review statistics', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue({
        ...mockTemplate,
        avgRating: 4.5,
        ratingCount: 10,
      } as Template);

      const result = await service.getReviewStats(mockTemplateId);

      expect(result).toBeDefined();
      expect(result.avgRating).toBeDefined();
      expect(result.ratingCount).toBeDefined();
      expect(result.ratingBreakdown).toBeDefined();
    });

    it('should throw NotFoundException if template not found', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getReviewStats(mockTemplateId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('hasUserUsedTemplate', () => {
    it('should return true if user has used template', async () => {
      jest.spyOn(dataSource, 'query').mockResolvedValue([{ count: '1' }]);

      const result = await service.hasUserUsedTemplate(mockUserId, mockTemplateId);

      expect(result).toBe(true);
    });

    it('should return false if user has not used template', async () => {
      jest.spyOn(dataSource, 'query').mockResolvedValue([{ count: '0' }]);

      const result = await service.hasUserUsedTemplate(mockUserId, mockTemplateId);

      expect(result).toBe(false);
    });
  });
});
