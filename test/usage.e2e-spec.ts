import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Usage API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let workspaceId: string;
  let projectId: string;
  let token: string;
  let workspace2Id: string;
  let token2: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // Create test workspace and authenticate
    const signupResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: 'usage-test@example.com',
        password: 'TestPassword123!',
        name: 'Usage Test User',
      });

    workspaceId = signupResponse.body.user.workspaceId;
    token = signupResponse.body.accessToken;

    // Create test project
    const projectResponse = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Project',
        description: 'Test project for usage tracking',
      });

    projectId = projectResponse.body.id;

    // Create second workspace for isolation testing
    const signup2Response = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: 'usage-test2@example.com',
        password: 'TestPassword123!',
        name: 'Usage Test User 2',
      });

    workspace2Id = signup2Response.body.user.workspaceId;
    token2 = signup2Response.body.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    if (dataSource) {
      await dataSource.query(`DELETE FROM api_usage WHERE workspace_id = $1`, [workspaceId]);
      await dataSource.query(`DELETE FROM api_usage WHERE workspace_id = $1`, [workspace2Id]);
      await dataSource.query(`DELETE FROM projects WHERE workspace_id = $1`, [workspaceId]);
      await dataSource.query(`DELETE FROM workspace_members WHERE workspace_id = $1`, [workspaceId]);
      await dataSource.query(`DELETE FROM workspace_members WHERE workspace_id = $1`, [workspace2Id]);
      await dataSource.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
      await dataSource.query(`DELETE FROM workspaces WHERE id = $1`, [workspace2Id]);
      await dataSource.query(`DELETE FROM users WHERE email IN ($1, $2)`, [
        'usage-test@example.com',
        'usage-test2@example.com',
      ]);
    }
    await app.close();
  });

  describe('POST /api/v1/workspaces/:workspaceId/usage', () => {
    it('should record usage via POST endpoint', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/usage`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: projectId,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: 1500,
          outputTokens: 800,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('costUsd');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body.costUsd).toBeGreaterThan(0);
    });

    it('should calculate cost correctly for Claude Sonnet 4.5', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/usage`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: projectId,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
        })
        .expect(201);

      // (1M/1M * $3) + (1M/1M * $15) = $3 + $15 = $18
      expect(response.body.costUsd).toBe(18.0);
    });

    it('should reject negative token counts', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/usage`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: projectId,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: -100,
          outputTokens: 800,
        })
        .expect(400);
    });

    it('should reject when both token counts are zero', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/usage`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: projectId,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: 0,
          outputTokens: 0,
        })
        .expect(400);
    });

    it('should reject token counts exceeding maximum', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/usage`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: projectId,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: 10_000_001, // Over 10M limit
          outputTokens: 800,
        })
        .expect(400);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/usage`)
        .send({
          projectId: projectId,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: 1500,
          outputTokens: 800,
        })
        .expect(401);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/usage/summary', () => {
    beforeAll(async () => {
      // Record some usage for testing
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/usage`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: projectId,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: 1500,
          outputTokens: 800,
        });

      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/usage`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: projectId,
          provider: 'anthropic',
          model: 'claude-opus-4-5-20251101',
          inputTokens: 1000,
          outputTokens: 2000,
        });
    });

    it('should retrieve usage summary', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalCost');
      expect(response.body).toHaveProperty('totalInputTokens');
      expect(response.body).toHaveProperty('totalOutputTokens');
      expect(response.body).toHaveProperty('totalRequests');
      expect(response.body.totalCost).toBeGreaterThan(0);
      expect(response.body.totalRequests).toBeGreaterThanOrEqual(2);
    });

    it('should filter by date range', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/usage/summary`)
        .query({
          startDate: yesterday.toISOString(),
          endDate: tomorrow.toISOString(),
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.totalRequests).toBeGreaterThan(0);
    });

    it('should return zero for date range with no data', async () => {
      const lastYear = new Date();
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      const lastYearEnd = new Date(lastYear);
      lastYearEnd.setMonth(lastYearEnd.getMonth() + 1);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/usage/summary`)
        .query({
          startDate: lastYear.toISOString(),
          endDate: lastYearEnd.toISOString(),
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.totalCost).toBe(0);
      expect(response.body.totalRequests).toBe(0);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/usage/by-project', () => {
    it('should get project usage breakdown', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/usage/by-project`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('projectId');
        expect(response.body[0]).toHaveProperty('cost');
        expect(response.body[0]).toHaveProperty('requests');
      }
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/usage/by-model', () => {
    it('should get model usage breakdown', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/usage/by-model`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('model');
        expect(response.body[0]).toHaveProperty('cost');
        expect(response.body[0]).toHaveProperty('requests');
      }
    });
  });

  describe('Workspace Isolation (Security)', () => {
    beforeAll(async () => {
      // Record usage for workspace 2
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspace2Id}/usage`)
        .set('Authorization', `Bearer ${token2}`)
        .send({
          projectId: null,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: 5000,
          outputTokens: 3000,
        });
    });

    it('should enforce workspace isolation - cannot view other workspace usage', async () => {
      // User from workspace 1 tries to access workspace 2's usage
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace2Id}/usage/summary`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should enforce workspace isolation - cannot record usage for other workspace', async () => {
      // User from workspace 1 tries to record usage for workspace 2
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspace2Id}/usage`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: null,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: 1000,
          outputTokens: 500,
        })
        .expect(403);
    });

    it('should only return own workspace data', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // This should only include workspace 1's usage, not workspace 2's
      expect(response.body.totalRequests).toBeGreaterThan(0);

      const response2 = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace2Id}/usage/summary`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      // Workspace 2 should have its own separate usage
      expect(response2.body.totalRequests).toBeGreaterThan(0);

      // Costs should be different (proves isolation)
      expect(response.body.totalCost).not.toBe(response2.body.totalCost);
    });
  });
});
