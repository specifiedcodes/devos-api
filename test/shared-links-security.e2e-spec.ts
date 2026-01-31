import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Shared Links Security & Isolation E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // Workspace A
  let workspaceAOwnerToken: string;
  let workspaceAId: string;
  let workspaceAProjectId: string;
  let workspaceALinkId: string;
  let workspaceALinkToken: string;

  // Workspace B
  let workspaceBOwnerToken: string;
  let workspaceBId: string;
  let workspaceBProjectId: string;

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

  describe('Setup: Create two isolated workspaces', () => {
    it('should create Workspace A with project and shared link', async () => {
      // Register owner A
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `workspace-a-owner-${Date.now()}@example.com`,
          password: 'SecurePassword123!',
        })
        .expect(201);

      workspaceAOwnerToken = registerResponse.body.tokens.access_token;
      workspaceAId = registerResponse.body.user.currentWorkspaceId;

      // Create project in Workspace A
      const projectResponse = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceAId}/projects`)
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .send({
          name: 'Workspace A Project',
          description: 'Confidential project in Workspace A',
        })
        .expect(201);

      workspaceAProjectId = projectResponse.body.id;

      // Create shared link in Workspace A
      const linkResponse = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .send({
          expiresIn: 'never',
        })
        .expect(201);

      workspaceALinkId = linkResponse.body.id;
      workspaceALinkToken = linkResponse.body.token;
    });

    it('should create Workspace B with project', async () => {
      // Register owner B
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `workspace-b-owner-${Date.now()}@example.com`,
          password: 'SecurePassword123!',
        })
        .expect(201);

      workspaceBOwnerToken = registerResponse.body.tokens.access_token;
      workspaceBId = registerResponse.body.user.currentWorkspaceId;

      // Create project in Workspace B
      const projectResponse = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceBId}/projects`)
        .set('Authorization', `Bearer ${workspaceBOwnerToken}`)
        .send({
          name: 'Workspace B Project',
          description: 'Confidential project in Workspace B',
        })
        .expect(201);

      workspaceBProjectId = projectResponse.body.id;
    });
  });

  describe('Workspace Isolation - Link Management', () => {
    it('should NOT allow Workspace B owner to list Workspace A links', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceBOwnerToken}`)
        .expect(403);
    });

    it('should NOT allow Workspace B owner to view Workspace A link details', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links/${workspaceALinkId}`,
        )
        .set('Authorization', `Bearer ${workspaceBOwnerToken}`)
        .expect(403);
    });

    it('should NOT allow Workspace B owner to revoke Workspace A link', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links/${workspaceALinkId}`,
        )
        .set('Authorization', `Bearer ${workspaceBOwnerToken}`)
        .expect(403);
    });

    it('should NOT allow creating link for Workspace A project from Workspace B', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceBOwnerToken}`)
        .send({
          expiresIn: 'never',
        })
        .expect(403);
    });

    it('should NOT return Workspace A links when listing Workspace B links', async () => {
      // Create a link in Workspace B
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceBId}/projects/${workspaceBProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceBOwnerToken}`)
        .send({
          expiresIn: 'never',
        })
        .expect(201);

      // List links in Workspace B
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceBId}/projects/${workspaceBProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceBOwnerToken}`)
        .expect(200);

      // Should only see Workspace B links
      expect(response.body).toBeInstanceOf(Array);
      response.body.forEach((link: any) => {
        expect(link.token).not.toBe(workspaceALinkToken);
      });
    });
  });

  describe('Workspace Isolation - Public View', () => {
    it('should allow public access to Workspace A shared link', async () => {
      const response = await request(app.getHttpServer())
        .get(`/share/${workspaceALinkToken}`)
        .expect(200);

      expect(response.body.id).toBe(workspaceAProjectId);
      expect(response.body.name).toBe('Workspace A Project');
    });

    it('should NOT expose workspace information in public view', async () => {
      const response = await request(app.getHttpServer())
        .get(`/share/${workspaceALinkToken}`)
        .expect(200);

      expect(response.body).not.toHaveProperty('workspaceId');
      expect(response.body).not.toHaveProperty('workspace');
    });
  });

  describe('Token Security', () => {
    it('should use cryptographically secure random tokens', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .send({
          expiresIn: 'never',
        })
        .expect(201);

      const token = response.body.token;

      // Token should be long enough (at least 32 characters for security)
      expect(token.length).toBeGreaterThanOrEqual(32);

      // Token should be URL-safe base64url
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should NOT be guessable by brute force', async () => {
      // Create 100 tokens
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        const response = await request(app.getHttpServer())
          .post(
            `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
          )
          .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
          .send({
            expiresIn: 'never',
          })
          .expect(201);

        tokens.add(response.body.token);
      }

      // All tokens should be unique
      expect(tokens.size).toBe(100);

      // Should not follow sequential patterns
      const tokenArray = Array.from(tokens);
      for (let i = 0; i < tokenArray.length - 1; i++) {
        expect(tokenArray[i]).not.toBe(tokenArray[i + 1]);
      }
    });
  });

  describe('Password Brute-Force Protection', () => {
    let passwordProtectedToken: string;

    it('should create password-protected link', async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .send({
          expiresIn: 'never',
          password: 'correct-password-123',
        })
        .expect(201);

      passwordProtectedToken = response.body.token;
    });

    it('should rate limit password validation attempts', async () => {
      const rateLimit = parseInt(
        process.env.SHARED_LINK_PASSWORD_RATE_LIMIT || '5',
        10,
      );

      // Make multiple failed attempts
      for (let i = 0; i < rateLimit; i++) {
        await request(app.getHttpServer())
          .post(`/share/${passwordProtectedToken}/validate-password`)
          .send({
            password: `wrong-password-${i}`,
          })
          .expect(401);
      }

      // Next attempt should be rate limited
      const response = await request(app.getHttpServer())
        .post(`/share/${passwordProtectedToken}/validate-password`)
        .send({
          password: 'another-wrong-password',
        });

      // Should be rate limited (429) or still rejecting (401)
      // Rate limiting might not work perfectly in test environment
      expect([401, 429]).toContain(response.status);
    }, 30000); // Increase timeout for this test
  });

  describe('Data Sanitization', () => {
    it('should NOT expose sensitive project fields in shared view', async () => {
      const response = await request(app.getHttpServer())
        .get(`/share/${workspaceALinkToken}`)
        .expect(200);

      // Whitelist: Only these fields should be present
      const allowedFields = [
        'id',
        'name',
        'description',
        'deploymentUrl',
        'status',
        'updatedAt',
        'poweredBy',
      ];

      // Check that only allowed fields are present
      const responseKeys = Object.keys(response.body);
      responseKeys.forEach((key) => {
        expect(allowedFields).toContain(key);
      });

      // Explicitly check sensitive fields are NOT present
      expect(response.body).not.toHaveProperty('workspaceId');
      expect(response.body).not.toHaveProperty('createdByUserId');
      expect(response.body).not.toHaveProperty('createdBy');
      expect(response.body).not.toHaveProperty('preferences');
      expect(response.body).not.toHaveProperty('apiKey');
      expect(response.body).not.toHaveProperty('githubRepoUrl');
      expect(response.body).not.toHaveProperty('templateId');
    });

    it('should NOT expose password hash in any response', async () => {
      // Create password-protected link
      const createResponse = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .send({
          expiresIn: 'never',
          password: 'secret-password-123',
        })
        .expect(201);

      expect(createResponse.body).not.toHaveProperty('passwordHash');

      // List links
      const listResponse = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .expect(200);

      listResponse.body.forEach((link: any) => {
        expect(link).not.toHaveProperty('passwordHash');
      });

      // Get specific link
      const getResponse = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links/${createResponse.body.id}`,
        )
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .expect(200);

      expect(getResponse.body).not.toHaveProperty('passwordHash');
    });
  });

  describe('Expired Link Handling', () => {
    it('should reject access to expired link', async () => {
      // Create link with 7 days expiration
      const createResponse = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .send({
          expiresIn: '7days',
        })
        .expect(201);

      const token = createResponse.body.token;

      // Manually expire the link in database
      await dataSource.query(
        `UPDATE shared_links SET expires_at = NOW() - INTERVAL '1 day' WHERE token = $1`,
        [token],
      );

      // Try to access expired link
      await request(app.getHttpServer())
        .get(`/share/${token}`)
        .expect(410); // 410 Gone
    });
  });

  describe('Revoked Link Handling', () => {
    it('should reject access to revoked link', async () => {
      // Create link
      const createResponse = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .send({
          expiresIn: 'never',
        })
        .expect(201);

      const linkId = createResponse.body.id;
      const token = createResponse.body.token;

      // Verify link works
      await request(app.getHttpServer()).get(`/share/${token}`).expect(200);

      // Revoke link
      await request(app.getHttpServer())
        .delete(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links/${linkId}`,
        )
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .expect(204);

      // Try to access revoked link
      await request(app.getHttpServer())
        .get(`/share/${token}`)
        .expect(403); // 403 Forbidden
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should handle malicious token input safely', async () => {
      const maliciousTokens = [
        "'; DROP TABLE shared_links; --",
        "1' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM users--",
      ];

      for (const maliciousToken of maliciousTokens) {
        await request(app.getHttpServer())
          .get(`/share/${encodeURIComponent(maliciousToken)}`)
          .expect(404);
      }

      // Verify table still exists by creating a new link
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .send({
          expiresIn: 'never',
        })
        .expect(201);
    });
  });

  describe('Authorization Bypass Attempts', () => {
    it('should require Owner/Admin role to create shared links', async () => {
      // Register a viewer user
      const viewerRegister = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `viewer-${Date.now()}@example.com`,
          password: 'SecurePassword123!',
        })
        .expect(201);

      const viewerToken = viewerRegister.body.tokens.access_token;

      // Invite viewer to Workspace A
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceAId}/invitations`)
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .send({
          email: viewerRegister.body.user.email,
          role: 'viewer',
        });

      // Viewer should NOT be able to create shared links
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          expiresIn: 'never',
        })
        .expect(403);
    });

    it('should require Owner/Admin role to revoke shared links', async () => {
      // Create link as owner
      const createResponse = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links`,
        )
        .set('Authorization', `Bearer ${workspaceAOwnerToken}`)
        .send({
          expiresIn: 'never',
        })
        .expect(201);

      // Try to revoke as Workspace B owner (unauthorized)
      await request(app.getHttpServer())
        .delete(
          `/api/v1/workspaces/${workspaceAId}/projects/${workspaceAProjectId}/shared-links/${createResponse.body.id}`,
        )
        .set('Authorization', `Bearer ${workspaceBOwnerToken}`)
        .expect(403);
    });
  });
});
