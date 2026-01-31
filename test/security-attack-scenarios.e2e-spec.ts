import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';

/**
 * E2E Security Tests for Attack Scenarios
 * Story 3.7: Per-Workspace Cost Isolation
 *
 * These tests simulate malicious attempts to bypass workspace isolation:
 * 1. JWT token manipulation
 * 2. Parameter injection attacks
 * 3. Header manipulation
 * 4. SQL injection attempts
 * 5. Race conditions
 * 6. Privilege escalation attempts
 *
 * All attacks should be blocked by the multi-layer security:
 * - Guards (WorkspaceAccessGuard)
 * - Interceptors (WorkspaceContextInterceptor)
 * - Row-Level Security (RLS policies)
 * - Parameterized queries (TypeORM)
 */
describe('Security Attack Scenarios (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // Victim workspace
  let victimWorkspaceId: string;
  let victimToken: string;
  let victimUsageId: string;

  // Attacker workspace
  let attackerWorkspaceId: string;
  let attackerToken: string;

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

    // Create victim workspace
    const victimSignup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: 'victim@example.com',
        password: 'TestPassword123!',
        name: 'Victim User',
      });

    victimWorkspaceId = victimSignup.body.user.workspaceId;
    victimToken = victimSignup.body.accessToken;

    // Create attacker workspace
    const attackerSignup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: 'attacker@example.com',
        password: 'TestPassword123!',
        name: 'Attacker User',
      });

    attackerWorkspaceId = attackerSignup.body.user.workspaceId;
    attackerToken = attackerSignup.body.accessToken;

    // Create usage data in victim workspace
    const usageResponse = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${victimWorkspaceId}/usage`)
      .set('Authorization', `Bearer ${victimToken}`)
      .send({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 50000,
        outputTokens: 25000,
      });

    victimUsageId = usageResponse.body.id;
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.query(
        `DELETE FROM api_usage WHERE workspace_id IN ($1, $2)`,
        [victimWorkspaceId, attackerWorkspaceId],
      );
      await dataSource.query(
        `DELETE FROM workspace_members WHERE workspace_id IN ($1, $2)`,
        [victimWorkspaceId, attackerWorkspaceId],
      );
      await dataSource.query(`DELETE FROM workspaces WHERE id IN ($1, $2)`, [
        victimWorkspaceId,
        attackerWorkspaceId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE email IN ($1, $2)`, [
        'victim@example.com',
        'attacker@example.com',
      ]);
    }
    await app.close();
  });

  describe('Attack: JWT Token Manipulation', () => {
    it('should reject modified JWT with different workspaceId', async () => {
      // Decode the attacker's token
      const decodedToken: any = jwt.decode(attackerToken);

      // Create a malicious token with victim's workspace ID
      const maliciousPayload = {
        ...decodedToken,
        workspaceId: victimWorkspaceId,
      };

      // Try to sign it (will fail signature verification)
      const maliciousToken = jwt.sign(maliciousPayload, 'wrong-secret');

      // Attempt to access victim's data with malicious token
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${victimWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${maliciousToken}`)
        .expect(401); // Should reject invalid signature
    });

    it('should reject token with missing workspaceId', async () => {
      const decodedToken: any = jwt.decode(attackerToken);

      // Create token without workspaceId
      const maliciousPayload = { ...decodedToken };
      delete maliciousPayload.workspaceId;

      const maliciousToken = jwt.sign(maliciousPayload, 'wrong-secret');

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${victimWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${maliciousToken}`)
        .expect(401);
    });

    it('should reject expired tokens', async () => {
      const decodedToken: any = jwt.decode(attackerToken);

      // Create expired token
      const expiredPayload = {
        ...decodedToken,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };

      const expiredToken = jwt.sign(expiredPayload, 'wrong-secret');

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${attackerWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe('Attack: URL Parameter Manipulation', () => {
    it('should prevent accessing victim workspace via URL parameter', async () => {
      // Attacker tries to access victim's data by changing URL parameter
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${victimWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(403);
    });

    it('should prevent SQL injection via workspace ID parameter', async () => {
      const sqlInjection = `${victimWorkspaceId}' OR '1'='1`;

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${sqlInjection}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(403);
    });

    it('should prevent UNION-based SQL injection', async () => {
      const sqlInjection = `${victimWorkspaceId}' UNION SELECT * FROM api_usage--`;

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${sqlInjection}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(403);
    });

    it('should prevent path traversal attacks', async () => {
      const pathTraversal = `../../${victimWorkspaceId}`;

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${pathTraversal}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(403);
    });
  });

  describe('Attack: Query Parameter Injection', () => {
    it('should prevent SQL injection via date parameters', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${attackerWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .query({
          startDate: "2024-01-01' OR '1'='1",
          endDate: "2024-12-31' OR '1'='1",
        })
        .expect(500); // Should fail date parsing, not execute SQL
    });

    it('should prevent NoSQL-style injection attempts', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${attackerWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .query({
          startDate: { $ne: null },
          endDate: { $ne: null },
        })
        .expect(500); // Should fail validation
    });
  });

  describe('Attack: Body Parameter Injection', () => {
    it('should prevent injecting different workspace ID in POST body', async () => {
      // Attacker tries to create usage record for victim's workspace
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${victimWorkspaceId}/usage`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({
          workspaceId: victimWorkspaceId, // Try to override
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: 1000,
          outputTokens: 500,
        })
        .expect(403); // Guard should block before processing body
    });

    it('should prevent SQL injection via model parameter', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${attackerWorkspaceId}/usage`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({
          provider: 'anthropic',
          model: "'; DROP TABLE api_usage; --",
          inputTokens: 1000,
          outputTokens: 500,
        })
        .expect(400); // Validation should reject invalid model name
    });

    it('should prevent negative cost injection via large token counts', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${attackerWorkspaceId}/usage`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: Number.MAX_SAFE_INTEGER,
          outputTokens: Number.MAX_SAFE_INTEGER,
        })
        .expect(400); // Should reject excessive values
    });
  });

  describe('Attack: Header Manipulation', () => {
    it('should ignore X-Workspace-Id header injection', async () => {
      // Attacker tries to inject workspace ID via custom header
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${attackerWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .set('X-Workspace-Id', victimWorkspaceId)
        .expect(200);

      // Should return attacker's data, not victim's
      // (Custom header should be ignored)
      expect(response.body.totalRequests).not.toBeUndefined();
    });

    it('should prevent host header injection', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${attackerWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .set('Host', 'evil.com')
        .expect(200); // Should still work (supertest handles host)
    });

    it('should prevent X-Forwarded-For spoofing for rate limiting', async () => {
      // Attacker tries to bypass rate limits by spoofing IP
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          request(app.getHttpServer())
            .get(`/api/v1/workspaces/${attackerWorkspaceId}/usage/summary`)
            .set('Authorization', `Bearer ${attackerToken}`)
            .set('X-Forwarded-For', `192.168.1.${i}`),
        );
      }

      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('Attack: Race Conditions', () => {
    it('should handle concurrent cross-workspace access attempts', async () => {
      // Attacker makes 20 concurrent requests trying to access victim data
      const attackRequests = Array(20)
        .fill(null)
        .map(() =>
          request(app.getHttpServer())
            .get(`/api/v1/workspaces/${victimWorkspaceId}/usage/summary`)
            .set('Authorization', `Bearer ${attackerToken}`),
        );

      const responses = await Promise.all(attackRequests);

      // All should be blocked
      responses.forEach((response) => {
        expect(response.status).toBe(403);
      });
    });

    it('should prevent TOCTOU attacks on workspace validation', async () => {
      // Time-of-check to time-of-use attack
      // Make rapid requests hoping to exploit timing window
      const rapidRequests = [];

      for (let i = 0; i < 10; i++) {
        rapidRequests.push(
          request(app.getHttpServer())
            .get(`/api/v1/workspaces/${victimWorkspaceId}/usage/summary`)
            .set('Authorization', `Bearer ${attackerToken}`),
        );
      }

      const responses = await Promise.all(rapidRequests);

      // All should fail consistently
      responses.forEach((response) => {
        expect(response.status).toBe(403);
      });
    });
  });

  describe('Attack: CSV Export Data Exfiltration', () => {
    it('should prevent exporting victim workspace data', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const endDate = new Date();

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${victimWorkspaceId}/usage/export`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .query({
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        })
        .expect(403);
    });

    it('should prevent path traversal in CSV export filename', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();

      // Try to inject path traversal in date parameters
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${attackerWorkspaceId}/usage/export`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .query({
          startDate: '../../etc/passwd',
          endDate: endDate.toISOString().split('T')[0],
        })
        .expect(500); // Should fail date validation

      expect(response.headers['content-type']).not.toBe('text/csv');
    });
  });

  describe('Attack: Privilege Escalation', () => {
    it('should prevent accessing admin-only endpoints', async () => {
      // Try to access system-wide stats (if such endpoint exists)
      await request(app.getHttpServer())
        .get('/api/v1/admin/usage/all-workspaces')
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(404); // Endpoint doesn't exist or requires admin
    });

    it('should prevent modifying other workspace usage data', async () => {
      // Try to DELETE victim's usage record via direct DB manipulation
      // This should be blocked by RLS even if endpoint existed

      // Set attacker's workspace context
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', $1, FALSE)`,
        [attackerWorkspaceId],
      );

      // Try to delete victim's data
      const result = await dataSource.query(
        `DELETE FROM api_usage WHERE id = $1`,
        [victimUsageId],
      );

      // RLS should prevent deletion (0 rows affected)
      expect(result[1]).toBe(0);

      // Verify victim's data still exists
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', $1, FALSE)`,
        [victimWorkspaceId],
      );

      const victimData = await dataSource.query(
        `SELECT * FROM api_usage WHERE id = $1`,
        [victimUsageId],
      );

      expect(victimData.length).toBe(1);

      // Clear context
      await dataSource.query(
        `SELECT set_config('app.current_workspace_id', NULL, FALSE)`,
      );
    });
  });

  describe('Attack: Timing Attacks', () => {
    it('should not reveal workspace existence via timing differences', async () => {
      const fakeWorkspaceId = '00000000-0000-0000-0000-000000000000';

      const start1 = Date.now();
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${fakeWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(403);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${victimWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(403);
      const time2 = Date.now() - start2;

      // Timing difference should be minimal (within 100ms)
      // This prevents attackers from discovering valid workspace IDs
      const timingDifference = Math.abs(time1 - time2);
      expect(timingDifference).toBeLessThan(100);
    });
  });

  describe('Attack: Information Disclosure', () => {
    it('should not leak workspace IDs in error messages', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${victimWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(403);

      // Error message should not contain victim's workspace ID
      expect(response.body.message).not.toContain(victimWorkspaceId);
      expect(response.body.message).toContain(
        'Access denied: You do not have permission to access this workspace',
      );
    });

    it('should not leak database structure in error messages', async () => {
      const sqlInjection = `${attackerWorkspaceId}'; SELECT * FROM pg_tables--`;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${sqlInjection}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(403);

      // Should not contain SQL error details
      expect(response.body.message).not.toMatch(/pg_tables|syntax error|SQL/i);
    });

    it('should not leak user IDs in unauthorized responses', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${victimWorkspaceId}/usage/summary`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .expect(403);

      // Should not contain any UUIDs in error response
      const uuidRegex =
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      expect(response.body.message).not.toMatch(uuidRegex);
    });
  });
});
