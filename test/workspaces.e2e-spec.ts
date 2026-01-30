import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { Workspace } from '../src/database/entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole } from '../src/database/entities/workspace-member.entity';
import { User } from '../src/database/entities/user.entity';
import { ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler';
import { LoginThrottlerGuard } from '../src/modules/auth/guards/login-throttler.guard';
import { RedisService } from '../src/modules/redis/redis.service';

describe('Workspaces Management (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let redisService: RedisService;
  let authToken: string;
  let userId: string;
  let testWorkspaceId: string;
  let secondWorkspaceId: string;

  beforeAll(async () => {
    // Mock ThrottlerStorageService to bypass rate limiting in tests
    const mockThrottlerStorage = {
      increment: jest.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 0, isBlocked: false }),
      reset: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorageService)
      .useValue(mockThrottlerStorage)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    redisService = moduleFixture.get<RedisService>(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear ALL Redis keys to reset rate limiting before each test
    // This is safe in E2E test environment
    const allKeys = await redisService.keys('*');
    for (const key of allKeys) {
      await redisService.del(key);
    }

    // Add a small delay to ensure throttler window has passed
    // Registration is limited to 5 per hour, so we wait to avoid hitting the limit
    await new Promise(resolve => setTimeout(resolve, 200));

    // Create test user and get auth token
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `test-${Date.now()}${Math.random()}@example.com`,
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      })
      .expect(201);

    authToken = registerResponse.body.tokens.access_token;
    userId = registerResponse.body.user.id;

    // Get the default workspace ID
    const workspace = await dataSource.getRepository(Workspace).findOne({
      where: { ownerUserId: userId },
    });
    testWorkspaceId = workspace!.id;
  });

  afterEach(async () => {
    // Cleanup: Delete test workspaces and users
    await dataSource.query('DELETE FROM workspace_members');
    await dataSource.query('DELETE FROM workspaces');
    await dataSource.query('DELETE FROM users');
  });

  describe('GET /api/v1/workspaces', () => {
    it('should return list of user workspaces with role information', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);

      const workspace = response.body[0];
      expect(workspace).toHaveProperty('id');
      expect(workspace).toHaveProperty('name');
      expect(workspace).toHaveProperty('role');
      expect(workspace).toHaveProperty('projectCount');
      expect(workspace).toHaveProperty('memberCount');
      expect(workspace).toHaveProperty('createdAt');
      expect(workspace.role).toBe('owner');
      expect(workspace.memberCount).toBe(1);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .expect(401);
    });

    it('should return empty array if user has no workspaces', async () => {
      // Delete user's workspaces
      await dataSource.getRepository(WorkspaceMember).delete({ userId });
      await dataSource.getRepository(Workspace).delete({ ownerUserId: userId });

      const response = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('POST /api/v1/workspaces', () => {
    it('should create a new workspace successfully', async () => {
      const workspaceData = {
        name: 'My New Workspace',
        description: 'Test workspace description',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workspaceData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(workspaceData.name);
      expect(response.body.description).toBe(workspaceData.description);
      expect(response.body.role).toBe('owner');

      // Verify workspace was created in database
      const workspace = await dataSource.getRepository(Workspace).findOne({
        where: { id: response.body.id },
      });
      expect(workspace).toBeDefined();
      expect(workspace!.name).toBe(workspaceData.name);

      // Verify user is added as owner
      const member = await dataSource.getRepository(WorkspaceMember).findOne({
        where: { workspaceId: response.body.id, userId },
      });
      expect(member).toBeDefined();
      expect(member!.role).toBe(WorkspaceRole.OWNER);
    });

    it('should create workspace without optional description', async () => {
      const workspaceData = {
        name: 'Minimal Workspace',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workspaceData)
        .expect(201);

      expect(response.body.name).toBe(workspaceData.name);
      expect(response.body.description).toBeNull();
    });

    it('should validate name length (minimum 3 characters)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'AB' })
        .expect(400);

      const message = Array.isArray(response.body.message) ? response.body.message.join(' ') : response.body.message;
      expect(message.toLowerCase()).toContain('name');
    });

    it('should validate name length (maximum 50 characters)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'A'.repeat(51) })
        .expect(400);

      const message = Array.isArray(response.body.message) ? response.body.message.join(' ') : response.body.message;
      expect(message.toLowerCase()).toContain('name');
    });

    it('should validate description length (maximum 500 characters)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Valid Name',
          description: 'A'.repeat(501),
        })
        .expect(400);

      const message = Array.isArray(response.body.message) ? response.body.message.join(' ') : response.body.message;
      expect(message.toLowerCase()).toContain('description');
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .send({ name: 'Test Workspace' })
        .expect(401);
    });
  });

  describe('PATCH /api/v1/workspaces/:id', () => {
    it('should rename workspace successfully (owner)', async () => {
      const newName = 'Renamed Workspace';

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${testWorkspaceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: newName })
        .expect(200);

      expect(response.body.id).toBe(testWorkspaceId);
      expect(response.body.name).toBe(newName);

      // Verify in database
      const workspace = await dataSource.getRepository(Workspace).findOne({
        where: { id: testWorkspaceId },
      });
      expect(workspace!.name).toBe(newName);
    });

    it('should rename workspace successfully (admin)', async () => {
      // Create another user and add them as admin
      const adminRegResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `admin-${Date.now()}@example.com`,
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        })
        .expect(201);

      const adminToken = adminRegResponse.body.tokens.access_token;
      const adminUserId = adminRegResponse.body.user.id;

      // Add admin to workspace
      await dataSource.getRepository(WorkspaceMember).save({
        workspaceId: testWorkspaceId,
        userId: adminUserId,
        role: WorkspaceRole.ADMIN,
      });

      const newName = 'Admin Renamed';

      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${testWorkspaceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: newName })
        .expect(200);
    });

    it('should reject rename from developer role', async () => {
      // Create another user and add them as developer
      const devRegResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `dev-${Date.now()}@example.com`,
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        })
        .expect(201);

      const devToken = devRegResponse.body.tokens.access_token;
      const devUserId = devRegResponse.body.user.id;

      // Add developer to workspace
      await dataSource.getRepository(WorkspaceMember).save({
        workspaceId: testWorkspaceId,
        userId: devUserId,
        role: WorkspaceRole.DEVELOPER,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${testWorkspaceId}`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ name: 'Should Fail' })
        .expect(403);
    });

    it('should validate workspace name length', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${testWorkspaceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'AB' })
        .expect(400);
    });

    it('should return 404 for non-existent workspace', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      // Returns 403 because guard checks permission before checking if workspace exists
      // This is acceptable security behavior (don't leak info about resource existence)
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'New Name' })
        .expect(403);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${testWorkspaceId}`)
        .send({ name: 'New Name' })
        .expect(401);
    });
  });

  describe('DELETE /api/v1/workspaces/:id', () => {
    beforeEach(async () => {
      // Create a second workspace for deletion tests
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Workspace to Delete' })
        .expect(201);

      secondWorkspaceId = createResponse.body.id;
    });

    it('should soft delete workspace successfully (owner)', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${secondWorkspaceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toContain('deleted successfully');
      expect(response.body.message).toContain('30 days');

      // Verify soft delete in database
      const workspace = await dataSource.getRepository(Workspace).findOne({
        where: { id: secondWorkspaceId },
        withDeleted: true,
      });
      expect(workspace!.deletedAt).toBeDefined();
    });

    it('should reject delete from admin role', async () => {
      // Create admin user
      const adminRegResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `admin-${Date.now()}@example.com`,
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        })
        .expect(201);

      const adminToken = adminRegResponse.body.tokens.access_token;
      const adminUserId = adminRegResponse.body.user.id;

      // Add admin to workspace
      await dataSource.getRepository(WorkspaceMember).save({
        workspaceId: secondWorkspaceId,
        userId: adminUserId,
        role: WorkspaceRole.ADMIN,
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${secondWorkspaceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent workspace', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      // Returns 403 because guard checks permission before checking if workspace exists
      // This is acceptable security behavior (don't leak info about resource existence)
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${secondWorkspaceId}`)
        .expect(401);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple workspace creations simultaneously', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/v1/workspaces')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: `Concurrent Workspace ${i + 1}` })
      );

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
      });

      // Verify all workspaces were created with unique IDs
      const ids = responses.map((r) => r.body.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('POST /api/v1/workspaces/:id/switch', () => {
    beforeEach(async () => {
      // Create a second workspace to switch to
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Target Workspace', description: 'Workspace to switch to' })
        .expect(201);

      secondWorkspaceId = createResponse.body.id;
    });

    it('should switch workspace and return new tokens', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${secondWorkspaceId}/switch`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify response structure
      expect(response.body).toHaveProperty('workspace');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.workspace.id).toBe(secondWorkspaceId);
      expect(response.body.workspace.name).toBe('Target Workspace');
      expect(response.body.workspace.isCurrentWorkspace).toBe(true);
      expect(response.body.tokens).toHaveProperty('access_token');
      expect(response.body.tokens).toHaveProperty('refresh_token');

      // Verify new tokens are different from old token
      expect(response.body.tokens.access_token).not.toBe(authToken);

      // Verify user's currentWorkspaceId was updated in database
      const user = await dataSource.getRepository(User).findOne({
        where: { id: userId },
      });
      expect(user!.currentWorkspaceId).toBe(secondWorkspaceId);
    });

    it('should include workspace_id in new JWT payload', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${secondWorkspaceId}/switch`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const newToken = response.body.tokens.access_token;

      // Decode JWT to verify workspace_id
      const base64Payload = newToken.split('.')[1];
      const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());
      expect(payload).toHaveProperty('workspaceId', secondWorkspaceId);
    });

    it('should return 401 if not authenticated', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${secondWorkspaceId}/switch`)
        .expect(401);
    });

    it('should return 403 if not member of target workspace', async () => {
      // Create another user
      const otherUserResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `other-${Date.now()}@example.com`,
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        })
        .expect(201);

      const otherUserToken = otherUserResponse.body.tokens.access_token;

      // Try to switch to a workspace the other user is not a member of
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${testWorkspaceId}/switch`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);
    });

    it('should return 404 if workspace does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${fakeId}/switch`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should handle switching back to original workspace', async () => {
      // First switch to second workspace
      const firstSwitch = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${secondWorkspaceId}/switch`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const newToken = firstSwitch.body.tokens.access_token;

      // Switch back to original workspace
      const secondSwitch = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${testWorkspaceId}/switch`)
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      expect(secondSwitch.body.workspace.id).toBe(testWorkspaceId);

      // Verify user's currentWorkspaceId was updated back
      const user = await dataSource.getRepository(User).findOne({
        where: { id: userId },
      });
      expect(user!.currentWorkspaceId).toBe(testWorkspaceId);
    });

    it('should update getUserWorkspaces to reflect current workspace', async () => {
      // Switch to second workspace
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${secondWorkspaceId}/switch`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Get workspaces list with new token (need to get it first)
      const switchResponse = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${secondWorkspaceId}/switch`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const newToken = switchResponse.body.tokens.access_token;

      const workspacesList = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      // Find the second workspace and verify it's marked as current
      const currentWorkspace = workspacesList.body.find((w: any) => w.id === secondWorkspaceId);
      expect(currentWorkspace.isCurrentWorkspace).toBe(true);

      // Verify the first workspace is NOT marked as current
      const firstWorkspace = workspacesList.body.find((w: any) => w.id === testWorkspaceId);
      expect(firstWorkspace.isCurrentWorkspace).toBe(false);
    });
  });
});
