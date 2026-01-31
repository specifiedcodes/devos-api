import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Shared Links E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let ownerToken: string;
  let adminToken: string;
  let developerToken: string;
  let viewerToken: string;
  let workspaceId: string;
  let projectId: string;
  let sharedLinkId: string;
  let sharedLinkToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Setup: Create users and project', () => {
    it('should register owner and create workspace', async () => {
      const email = `owner-${Date.now()}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'SecurePassword123!',
        })
        .expect(201);

      ownerToken = response.body.tokens.access_token;
      workspaceId = response.body.user.currentWorkspaceId;

      expect(ownerToken).toBeDefined();
      expect(workspaceId).toBeDefined();
    });

    it('should create a project', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Shareable Test Project',
          description: 'A project to test shareable links',
          deploymentUrl: 'https://myproject.vercel.app',
        })
        .expect(201);

      projectId = response.body.id;
      expect(projectId).toBeDefined();
    });

    it('should register viewer user', async () => {
      const email = `viewer-${Date.now()}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'SecurePassword123!',
        })
        .expect(201);

      viewerToken = response.body.tokens.access_token;
    });
  });

  describe('POST /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links', () => {
    it('should create a shared link without password (7 days expiration)', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          expiresIn: '7days',
        })
        .expect(201);

      sharedLinkId = response.body.id;
      sharedLinkToken = response.body.token;

      expect(response.body.id).toBeDefined();
      expect(response.body.token).toBeDefined();
      expect(response.body.token.length).toBeGreaterThanOrEqual(32);
      expect(response.body.url).toContain('/share/');
      expect(response.body.url).toContain(response.body.token);
      expect(response.body.expiresAt).toBeDefined();
      expect(response.body.hasPassword).toBe(false);
      expect(response.body.isActive).toBe(true);
      expect(response.body.viewCount).toBe(0);
    });

    it('should create a shared link with password protection (never expires)', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          expiresIn: 'never',
          password: 'secure-password-123',
        })
        .expect(201);

      expect(response.body.expiresAt).toBeNull();
      expect(response.body.hasPassword).toBe(true);
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('should create a shared link with 30 days expiration', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          expiresIn: '30days',
        })
        .expect(201);

      expect(response.body.expiresAt).toBeDefined();

      const expiresAt = new Date(response.body.expiresAt);
      const now = new Date();
      const daysDiff = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThan(29);
      expect(daysDiff).toBeLessThan(31);
    });

    it('should reject link creation without authentication', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .send({
          expiresIn: '7days',
        })
        .expect(401);
    });

    it('should reject invalid expiration option', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          expiresIn: 'invalid-option',
        })
        .expect(400);
    });

    it('should reject password shorter than 8 characters', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          expiresIn: 'never',
          password: 'short',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links', () => {
    it('should list all shared links for a project', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('token');
      expect(response.body[0]).toHaveProperty('url');
      expect(response.body[0]).not.toHaveProperty('passwordHash');
    });

    it('should allow viewer to list shared links', async () => {
      // First, invite viewer to workspace
      const inviteResponse = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: `viewer-${Date.now() - 1000}@example.com`,
          role: 'viewer',
        });

      // Viewer can view links
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links/:linkId', () => {
    it('should get a specific shared link by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links/${sharedLinkId}`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(response.body.id).toBe(sharedLinkId);
      expect(response.body.token).toBe(sharedLinkToken);
      expect(response.body.url).toContain(sharedLinkToken);
    });

    it('should return 404 for non-existent link', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links/00000000-0000-0000-0000-000000000000`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });

  describe('GET /share/:token (Public View)', () => {
    it('should view shared project without authentication', async () => {
      const response = await request(app.getHttpServer())
        .get(`/share/${sharedLinkToken}`)
        .expect(200);

      expect(response.body.id).toBe(projectId);
      expect(response.body.name).toBe('Shareable Test Project');
      expect(response.body.description).toBe('A project to test shareable links');
      expect(response.body.deploymentUrl).toBe('https://myproject.vercel.app');
      expect(response.body.status).toBe('active');
      expect(response.body.updatedAt).toBeDefined();
      expect(response.body.poweredBy).toBe('Powered by DevOS');
    });

    it('should increment view count on each access', async () => {
      // View the link
      await request(app.getHttpServer())
        .get(`/share/${sharedLinkToken}`)
        .expect(200);

      // Get link details to check view count
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links/${sharedLinkId}`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(response.body.viewCount).toBeGreaterThan(0);
      expect(response.body.lastViewedAt).toBeDefined();
    });

    it('should not expose sensitive project data in shared view', async () => {
      const response = await request(app.getHttpServer())
        .get(`/share/${sharedLinkToken}`)
        .expect(200);

      expect(response.body).not.toHaveProperty('workspaceId');
      expect(response.body).not.toHaveProperty('createdByUserId');
      expect(response.body).not.toHaveProperty('apiKey');
      expect(response.body).not.toHaveProperty('preferences');
    });

    it('should return 404 for invalid token', async () => {
      await request(app.getHttpServer())
        .get('/share/invalid-token-12345')
        .expect(404);
    });
  });

  describe('Password-Protected Links', () => {
    let passwordProtectedToken: string;

    it('should create a password-protected link', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          expiresIn: 'never',
          password: 'test-password-123',
        })
        .expect(201);

      passwordProtectedToken = response.body.token;
      expect(response.body.hasPassword).toBe(true);
    });

    it('should require password validation before viewing', async () => {
      await request(app.getHttpServer())
        .get(`/share/${passwordProtectedToken}`)
        .expect(401);
    });

    it('should reject incorrect password', async () => {
      await request(app.getHttpServer())
        .post(`/share/${passwordProtectedToken}/validate-password`)
        .send({
          password: 'wrong-password',
        })
        .expect(401);
    });

    it('should accept correct password and allow viewing', async () => {
      const agent = request.agent(app.getHttpServer());

      // Validate password
      const validateResponse = await agent
        .post(`/share/${passwordProtectedToken}/validate-password`)
        .send({
          password: 'test-password-123',
        })
        .expect(200);

      expect(validateResponse.body.success).toBe(true);

      // Now should be able to view the project
      const viewResponse = await agent
        .get(`/share/${passwordProtectedToken}`)
        .expect(200);

      expect(viewResponse.body.name).toBe('Shareable Test Project');
    });
  });

  describe('DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links/:linkId', () => {
    let linkToRevoke: string;

    it('should create a link to revoke', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          expiresIn: 'never',
        })
        .expect(201);

      linkToRevoke = response.body.id;
    });

    it('should revoke a shared link', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links/${linkToRevoke}`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
    });

    it('should not be able to access revoked link', async () => {
      // Get the token first
      const listResponse = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // Revoked links should not appear in the list (filtered out)
      const revokedLink = listResponse.body.find(
        (link: any) => link.id === linkToRevoke,
      );
      expect(revokedLink).toBeUndefined();
    });

    it('should return 404 when trying to revoke non-existent link', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links/00000000-0000-0000-0000-000000000000`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });

  describe('Unique Token Generation', () => {
    it('should generate unique tokens for multiple links', async () => {
      const tokens = new Set();

      for (let i = 0; i < 10; i++) {
        const response = await request(app.getHttpServer())
          .post(
            `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
          )
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({
            expiresIn: 'never',
          })
          .expect(201);

        tokens.add(response.body.token);
      }

      expect(tokens.size).toBe(10);
    });
  });

  describe('URL-Safe Token Validation', () => {
    it('should generate URL-safe tokens', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          expiresIn: 'never',
        })
        .expect(201);

      const token = response.body.token;

      // URL-safe base64url characters: [A-Za-z0-9_-]
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

      // Should not contain special characters that need URL encoding
      expect(token).not.toContain('+');
      expect(token).not.toContain('/');
      expect(token).not.toContain('=');
    });
  });
});
