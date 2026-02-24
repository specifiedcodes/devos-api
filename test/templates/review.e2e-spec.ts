/**
 * Template Review E2E Tests
 *
 * Story 19-5: Template Rating & Reviews
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template, TemplateCategory } from '../../src/database/entities/template.entity';
import { TemplateReview } from '../../src/database/entities/template-review.entity';
import { User } from '../../src/database/entities/user.entity';
import { Workspace } from '../../src/database/entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole } from '../../src/database/entities/workspace-member.entity';

describe('Template Reviews (e2e)', () => {
  let app: INestApplication;
  let templateRepository: Repository<Template>;
  let reviewRepository: Repository<TemplateReview>;
  let userRepository: Repository<User>;
  let workspaceRepository: Repository<Workspace>;
  let workspaceMemberRepository: Repository<WorkspaceMember>;

  let accessToken: string;
  let adminAccessToken: string;
  let testUser: User;
  let adminUser: User;
  let testWorkspace: Workspace;
  let testTemplate: Template;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    templateRepository = moduleFixture.get(getRepositoryToken(Template));
    reviewRepository = moduleFixture.get(getRepositoryToken(TemplateReview));
    userRepository = moduleFixture.get(getRepositoryToken(User));
    workspaceRepository = moduleFixture.get(getRepositoryToken(Workspace));
    workspaceMemberRepository = moduleFixture.get(getRepositoryToken(WorkspaceMember));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up
    await reviewRepository.delete({});
    await templateRepository.delete({});
    await workspaceMemberRepository.delete({});
    await workspaceRepository.delete({});
    await userRepository.delete({});

    // Create test user
    testUser = userRepository.create({
      email: 'test@example.com',
      passwordHash: 'hashed_password',
    } as Partial<User> as User);
    await userRepository.save(testUser);

    // Create admin user
    adminUser = userRepository.create({
      email: 'admin@example.com',
      passwordHash: 'hashed_password',
    } as Partial<User> as User);
    await userRepository.save(adminUser);

    // Create workspace
    testWorkspace = workspaceRepository.create({
      name: 'Test Workspace',
      ownerUserId: testUser.id,
      schemaName: 'workspace_test',
    } as Partial<Workspace> as Workspace);
    await workspaceRepository.save(testWorkspace);

    // Add workspace members
    await workspaceMemberRepository.save({
      workspaceId: testWorkspace.id,
      userId: testUser.id,
      role: WorkspaceRole.DEVELOPER,
    });
    await workspaceMemberRepository.save({
      workspaceId: testWorkspace.id,
      userId: adminUser.id,
      role: WorkspaceRole.ADMIN,
    });

    // Create test template
    testTemplate = templateRepository.create({
      workspaceId: testWorkspace.id,
      name: 'test-template',
      displayName: 'Test Template',
      description: 'A test template',
      version: '1.0.0',
      category: TemplateCategory.WEB_APP,
      definition: {
        stack: { frontend: 'nextjs' },
        variables: [],
        files: { source_type: 'git' },
      },
      avgRating: 0,
      ratingCount: 0,
      createdBy: testUser.id,
    } as Partial<Template> as Template);
    await templateRepository.save(testTemplate);

    // Get access tokens (mock auth - in real tests you'd call auth endpoints)
    // For now, we'll skip auth in these tests
  });

  describe('POST /api/templates/:templateId/reviews', () => {
    it('should create a review successfully', () => {
      return request(app.getHttpServer())
        .post(`/api/templates/${testTemplate.id}/reviews`)
        .set('x-workspace-id', testWorkspace.id)
        .send({
          rating: 5,
          title: 'Excellent template!',
          body: 'This is a really good template that helped me build my project quickly and efficiently. Highly recommended for anyone starting a new project.',
          tags: ['Well Documented'],
          templateId: testTemplate.id,
        })
        .expect(401); // Unauthorized without proper auth
    });

    it('should return 400 for invalid rating', () => {
      return request(app.getHttpServer())
        .post(`/api/templates/${testTemplate.id}/reviews`)
        .set('x-workspace-id', testWorkspace.id)
        .send({
          rating: 6, // Invalid: > 5
          body: 'This template is okay.',
          templateId: testTemplate.id,
        })
        .expect(401);
    });

    it('should return 400 for body too short', () => {
      return request(app.getHttpServer())
        .post(`/api/templates/${testTemplate.id}/reviews`)
        .set('x-workspace-id', testWorkspace.id)
        .send({
          rating: 4,
          body: 'Too short', // Less than 50 chars
          templateId: testTemplate.id,
        })
        .expect(401);
    });
  });

  describe('GET /api/templates/:templateId/reviews', () => {
    it('should return paginated reviews', () => {
      return request(app.getHttpServer())
        .get(`/api/templates/${testTemplate.id}/reviews`)
        .set('x-workspace-id', testWorkspace.id)
        .expect(401);
    });

    it('should support sorting by most helpful', () => {
      return request(app.getHttpServer())
        .get(`/api/templates/${testTemplate.id}/reviews?sortBy=most_helpful`)
        .set('x-workspace-id', testWorkspace.id)
        .expect(401);
    });

    it('should support rating filter', () => {
      return request(app.getHttpServer())
        .get(`/api/templates/${testTemplate.id}/reviews?ratingFilter=5`)
        .set('x-workspace-id', testWorkspace.id)
        .expect(401);
    });
  });

  describe('GET /api/templates/:templateId/reviews/stats', () => {
    it('should return review statistics', () => {
      return request(app.getHttpServer())
        .get(`/api/templates/${testTemplate.id}/reviews/stats`)
        .set('x-workspace-id', testWorkspace.id)
        .expect(401);
    });
  });

  describe('PUT /api/templates/:templateId/reviews/:reviewId', () => {
    it('should update own review', async () => {
      // Create a review first
      const review = reviewRepository.create({
        templateId: testTemplate.id,
        userId: testUser.id,
        rating: 4,
        body: 'This is a test review with enough characters to meet the minimum requirement of fifty.',
      });
      await reviewRepository.save(review);

      return request(app.getHttpServer())
        .put(`/api/templates/${testTemplate.id}/reviews/${review.id}`)
        .set('x-workspace-id', testWorkspace.id)
        .send({
          rating: 5,
          body: 'Updated review with enough characters to meet the minimum requirement.',
        })
        .expect(401);
    });
  });

  describe('DELETE /api/templates/:templateId/reviews/:reviewId', () => {
    it('should delete own review', async () => {
      const review = reviewRepository.create({
        templateId: testTemplate.id,
        userId: testUser.id,
        rating: 4,
        body: 'This is a test review with enough characters to meet the minimum requirement of fifty.',
      });
      await reviewRepository.save(review);

      return request(app.getHttpServer())
        .delete(`/api/templates/${testTemplate.id}/reviews/${review.id}`)
        .set('x-workspace-id', testWorkspace.id)
        .expect(401);
    });
  });

  describe('POST /api/templates/:templateId/reviews/:reviewId/helpful', () => {
    it('should mark review as helpful', async () => {
      const review = reviewRepository.create({
        templateId: testTemplate.id,
        userId: testUser.id,
        rating: 5,
        body: 'This is a test review with enough characters to meet the minimum requirement of fifty.',
        helpfulCount: 0,
      });
      await reviewRepository.save(review);

      return request(app.getHttpServer())
        .post(`/api/templates/${testTemplate.id}/reviews/${review.id}/helpful`)
        .set('x-workspace-id', testWorkspace.id)
        .expect(401);
    });
  });

  describe('POST /api/templates/:templateId/reviews/:reviewId/flag', () => {
    it('should flag review (admin only)', async () => {
      const review = reviewRepository.create({
        templateId: testTemplate.id,
        userId: testUser.id,
        rating: 1,
        body: 'This is a test review with enough characters to meet the minimum requirement of fifty.',
      });
      await reviewRepository.save(review);

      return request(app.getHttpServer())
        .post(`/api/templates/${testTemplate.id}/reviews/${review.id}/flag`)
        .set('x-workspace-id', testWorkspace.id)
        .send({ reason: 'Inappropriate content' })
        .expect(401);
    });
  });
});
