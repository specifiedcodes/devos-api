import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

/**
 * E2E Tests for Workspace Cost Isolation
 * Story 3.7: Per-Workspace Cost Isolation
 *
 * These tests verify that workspace isolation is enforced at multiple layers:
 * 1. Application-level: Guards and query filters
 * 2. Database-level: Row-Level Security (RLS) policies
 * 3. API-level: Parameter validation and authentication
 *
 * Test scenarios include:
 * - Cross-workspace data access attempts
 * - Concurrent requests from different workspaces
 * - Edge cases with null/undefined values
 * - Direct database query isolation (RLS validation)
 */
describe('Workspace Cost Isolation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // Workspace 1 fixtures
  let workspace1Id: string;
  let workspace1Token: string;
  let workspace1ProjectId: string;
  let workspace1UsageIds: string[] = [];

  // Workspace 2 fixtures
  let workspace2Id: string;
  let workspace2Token: string;
  let workspace2ProjectId: string;
  let workspace2UsageIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // Create Workspace 1
    const signup1 = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: 'isolation-test-ws1@example.com',
        password: 'TestPassword123!',
        name: 'Workspace 1 User',
      });

    workspace1Id = signup1.body.user.workspaceId;
    workspace1Token = signup1.body.accessToken;

    // Create Workspace 2
    const signup2 = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: 'isolation-test-ws2@example.com',
        password: 'TestPassword123!',
        name: 'Workspace 2 User',
      });

    workspace2Id = signup2.body.user.workspaceId;
    workspace2Token = signup2.body.accessToken;

    // Create projects in each workspace
    const project1 = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace1Id}/projects`)
      .set('Authorization', `Bearer ${workspace1Token}`)
      .send({
        name: 'WS1 Project',
        description: 'Workspace 1 test project',
      });
    workspace1ProjectId = project1.body.id;

    const project2 = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace2Id}/projects`)
      .set('Authorization', `Bearer ${workspace2Token}`)
      .send({
        name: 'WS2 Project',
        description: 'Workspace 2 test project',
      });
    workspace2ProjectId = project2.body.id;

    // Create usage records for Workspace 1
    for (let i = 0; i < 5; i++) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspace1Id}/usage`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .send({
          projectId: workspace1ProjectId,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: 1000 + i * 100,
          outputTokens: 500 + i * 50,
        });
      workspace1UsageIds.push(response.body.id);
    }

    // Create usage records for Workspace 2
    for (let i = 0; i < 3; i++) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspace2Id}/usage`)
        .set('Authorization', `Bearer ${workspace2Token}`)
        .send({
          projectId: workspace2ProjectId,
          provider: 'openai',
          model: 'gpt-4o',
          inputTokens: 2000 + i * 200,
          outputTokens: 1000 + i * 100,
        });
      workspace2UsageIds.push(response.body.id);
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (dataSource) {
      await dataSource.query(
        `DELETE FROM api_usage WHERE workspace_id IN ($1, $2)`,
        [workspace1Id, workspace2Id],
      );
      await dataSource.query(
        `DELETE FROM projects WHERE workspace_id IN ($1, $2)`,
        [workspace1Id, workspace2Id],
      );
      await dataSource.query(
        `DELETE FROM workspace_members WHERE workspace_id IN ($1, $2)`,
        [workspace1Id, workspace2Id],
      );
      await dataSource.query(`DELETE FROM workspaces WHERE id IN ($1, $2)`, [
        workspace1Id,
        workspace2Id,
      ]);
      await dataSource.query(`DELETE FROM users WHERE email IN ($1, $2)`, [
        'isolation-test-ws1@example.com',
        'isolation-test-ws2@example.com',
      ]);
    }
    await app.close();
  });

  describe('Cross-Workspace Access Prevention', () => {
    it('should prevent Workspace 1 from accessing Workspace 2 summary', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace2Id}/usage/summary`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .expect(403);

      expect(response.body.message).toContain(
        'Access denied: You do not have permission to access this workspace',
      );
    });

    it('should prevent Workspace 2 from accessing Workspace 1 summary', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace1Id}/usage/summary`)
        .set('Authorization', `Bearer ${workspace2Token}`)
        .expect(403);

      expect(response.body.message).toContain(
        'Access denied: You do not have permission to access this workspace',
      );
    });

    it('should prevent Workspace 1 from exporting Workspace 2 data', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace2Id}/usage/export`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .query({
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        })
        .expect(403);
    });

    it('should prevent Workspace 1 from posting usage to Workspace 2', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspace2Id}/usage`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .send({
          projectId: workspace2ProjectId,
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: 1000,
          outputTokens: 500,
        })
        .expect(403);
    });
  });

  describe('Isolated Usage Summaries', () => {
    it('should return only Workspace 1 data for Workspace 1 user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace1Id}/usage/summary`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalRequests');
      expect(response.body.totalRequests).toBe(5); // Only WS1 records
      expect(response.body.totalCost).toBeGreaterThan(0);
    });

    it('should return only Workspace 2 data for Workspace 2 user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace2Id}/usage/summary`)
        .set('Authorization', `Bearer ${workspace2Token}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalRequests');
      expect(response.body.totalRequests).toBe(3); // Only WS2 records
      expect(response.body.totalCost).toBeGreaterThan(0);
    });
  });

  describe('Isolated Project Breakdowns', () => {
    it('should return only Workspace 1 projects for Workspace 1 user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace1Id}/usage/by-project`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      // All project IDs should belong to Workspace 1
      const projectIds = response.body.map((item: any) => item.projectId);
      expect(projectIds).toContain(workspace1ProjectId);
      expect(projectIds).not.toContain(workspace2ProjectId);
    });

    it('should return only Workspace 2 projects for Workspace 2 user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace2Id}/usage/by-project`)
        .set('Authorization', `Bearer ${workspace2Token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      // All project IDs should belong to Workspace 2
      const projectIds = response.body.map((item: any) => item.projectId);
      expect(projectIds).toContain(workspace2ProjectId);
      expect(projectIds).not.toContain(workspace1ProjectId);
    });
  });

  describe('Isolated Model Breakdowns', () => {
    it('should return different models for different workspaces', async () => {
      const ws1Response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace1Id}/usage/by-model`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .expect(200);

      const ws2Response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace2Id}/usage/by-model`)
        .set('Authorization', `Bearer ${workspace2Token}`)
        .expect(200);

      // WS1 uses Claude Sonnet
      const ws1Models = ws1Response.body.map((item: any) => item.model);
      expect(ws1Models).toContain('claude-sonnet-4-5-20250929');

      // WS2 uses GPT-4o
      const ws2Models = ws2Response.body.map((item: any) => item.model);
      expect(ws2Models).toContain('gpt-4o');
    });
  });

  describe('Isolated Daily Usage', () => {
    it('should return isolated daily usage for Workspace 1', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace1Id}/usage/daily`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .query({ days: 7 })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Should have today's data
      const today = new Date().toISOString().split('T')[0];
      const todayData = response.body.find((item: any) => item.date === today);
      expect(todayData).toBeDefined();
      expect(todayData.cost).toBeGreaterThan(0);
    });

    it('should return isolated daily usage for Workspace 2', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace2Id}/usage/daily`)
        .set('Authorization', `Bearer ${workspace2Token}`)
        .query({ days: 7 })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      const today = new Date().toISOString().split('T')[0];
      const todayData = response.body.find((item: any) => item.date === today);
      expect(todayData).toBeDefined();
      expect(todayData.cost).toBeGreaterThan(0);
    });
  });

  describe('Database-Level Isolation (RLS)', () => {
    it('should enforce Row-Level Security on direct queries', async () => {
      // Set workspace context for Workspace 1
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', $1, FALSE)`,
        [workspace1Id],
      );

      // Query should only return Workspace 1 records
      const ws1Records = await dataSource.query(
        `SELECT COUNT(*) as count FROM api_usage`,
      );

      expect(parseInt(ws1Records[0].count)).toBe(5);

      // Switch to Workspace 2
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', $1, FALSE)`,
        [workspace2Id],
      );

      // Query should only return Workspace 2 records
      const ws2Records = await dataSource.query(
        `SELECT COUNT(*) as count FROM api_usage`,
      );

      expect(parseInt(ws2Records[0].count)).toBe(3);

      // Clear context
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', NULL, FALSE)`,
      );
    });

    it('should prevent cross-workspace updates via RLS', async () => {
      // Set workspace context for Workspace 1
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', $1, FALSE)`,
        [workspace1Id],
      );

      // Try to update a Workspace 2 record (should fail silently due to RLS)
      const result = await dataSource.query(
        `UPDATE api_usage SET cost_usd = 999.99 WHERE workspace_id = $1`,
        [workspace2Id],
      );

      // RLS should prevent the update (0 rows affected)
      expect(result[1]).toBe(0);

      // Verify Workspace 2 data wasn't modified
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', $1, FALSE)`,
        [workspace2Id],
      );

      const ws2Records = await dataSource.query(
        `SELECT * FROM api_usage WHERE cost_usd = 999.99`,
      );

      expect(ws2Records.length).toBe(0);

      // Clear context
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', NULL, FALSE)`,
      );
    });

    it('should prevent cross-workspace deletes via RLS', async () => {
      // Set workspace context for Workspace 1
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', $1, FALSE)`,
        [workspace1Id],
      );

      // Try to delete Workspace 2 records (should fail due to RLS)
      const result = await dataSource.query(
        `DELETE FROM api_usage WHERE workspace_id = $1`,
        [workspace2Id],
      );

      // RLS should prevent the delete (0 rows affected)
      expect(result[1]).toBe(0);

      // Verify Workspace 2 data still exists
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', $1, FALSE)`,
        [workspace2Id],
      );

      const ws2Records = await dataSource.query(
        `SELECT COUNT(*) as count FROM api_usage`,
      );

      expect(parseInt(ws2Records[0].count)).toBe(3);

      // Clear context
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', NULL, FALSE)`,
      );
    });
  });

  describe('Concurrent Request Isolation', () => {
    it('should handle concurrent requests from different workspaces', async () => {
      // Make 10 concurrent requests split between workspaces
      const promises = [];

      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app.getHttpServer())
            .get(`/api/v1/workspaces/${workspace1Id}/usage/summary`)
            .set('Authorization', `Bearer ${workspace1Token}`),
        );

        promises.push(
          request(app.getHttpServer())
            .get(`/api/v1/workspaces/${workspace2Id}/usage/summary`)
            .set('Authorization', `Bearer ${workspace2Token}`),
        );
      }

      const responses = await Promise.all(promises);

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      // Verify data integrity - odd indices are WS1, even are WS2
      for (let i = 0; i < responses.length; i++) {
        if (i % 2 === 0) {
          // WS1 responses
          expect(responses[i].body.totalRequests).toBe(5);
        } else {
          // WS2 responses
          expect(responses[i].body.totalRequests).toBe(3);
        }
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle requests with no token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspace1Id}/usage/summary`)
        .expect(401);
    });

    it('should handle requests with invalid workspace ID format', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/invalid-uuid/usage/summary`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .expect(403);
    });

    it('should handle requests to non-existent workspace', async () => {
      const fakeWorkspaceId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${fakeWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .expect(403);
    });
  });
});
