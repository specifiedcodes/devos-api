import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Projects E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let developerToken: string;
  let viewerToken: string;
  let workspaceId: string;
  let projectId: string;
  let otherWorkspaceId: string;

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

  describe('Project CRUD Operations', () => {
    it('should register developer and create workspace', async () => {
      const email = `developer-${Date.now()}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'SecurePassword123!',
        })
        .expect(201);

      developerToken = response.body.tokens.access_token;
      workspaceId = response.body.user.currentWorkspaceId;

      expect(developerToken).toBeDefined();
      expect(workspaceId).toBeDefined();
    });

    it('should create a project as developer', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          name: 'Test Project',
          description: 'A test project',
          preferences: {
            repositoryStructure: 'monorepo',
            codeStyle: 'functional',
          },
        })
        .expect(201);

      projectId = response.body.id;

      expect(response.body.name).toBe('Test Project');
      expect(response.body.description).toBe('A test project');
      expect(response.body.workspaceId).toBe(workspaceId);
      expect(response.body.status).toBe('active');
      expect(response.body.preferences).toBeDefined();
    });

    it('should reject duplicate project name in workspace', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          name: 'Test Project', // Duplicate name
          description: 'Another project',
        })
        .expect(409);
    });

    it('should list all projects in workspace', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].name).toBe('Test Project');
    });

    it('should get a single project by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      expect(response.body.id).toBe(projectId);
      expect(response.body.name).toBe('Test Project');
      expect(response.body.createdBy).toBeDefined();
    });

    it('should update a project', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          name: 'Updated Project',
          description: 'Updated description',
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Project');
      expect(response.body.description).toBe('Updated description');
    });

    it('should get project preferences', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/preferences`,
        )
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      expect(response.body.repositoryStructure).toBe('monorepo');
      expect(response.body.codeStyle).toBe('functional');
    });

    it('should update project preferences', async () => {
      const response = await request(app.getHttpServer())
        .patch(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/preferences`,
        )
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          codeStyle: 'oop',
        })
        .expect(200);

      expect(response.body.codeStyle).toBe('oop');
    });
  });

  describe('Permission Tests', () => {
    it('should register viewer user and add to workspace', async () => {
      const email = `viewer-${Date.now()}@example.com`;

      const regResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'SecurePassword123!',
        })
        .expect(201);

      viewerToken = regResponse.body.tokens.access_token;

      // Add viewer to workspace (simulated - in real scenario, use invitation flow)
      await dataSource.query(
        'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
        [workspaceId, regResponse.body.user.id, 'viewer'],
      );
    });

    it('should allow viewer to list projects', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('should allow viewer to get single project', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('should reject viewer creating project', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Viewer Project',
        })
        .expect(403);
    });

    it('should reject viewer updating project', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Hacked Name',
        })
        .expect(403);
    });

    it('should reject viewer deleting project', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });
  });

  describe('Workspace Isolation', () => {
    it('should create another workspace', async () => {
      const email = `other-user-${Date.now()}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'SecurePassword123!',
        })
        .expect(201);

      otherWorkspaceId = response.body.user.currentWorkspaceId;
    });

    it('should not access project from different workspace', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${otherWorkspaceId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(404);
    });

    it('should allow same project name in different workspace', async () => {
      const email = `other-dev-${Date.now()}@example.com`;

      const regResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'SecurePassword123!',
        })
        .expect(201);

      const otherToken = regResponse.body.tokens.access_token;
      const otherWorkspace = regResponse.body.user.currentWorkspaceId;

      // Should allow same name in different workspace
      const response = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${otherWorkspace}/projects`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          name: 'Updated Project', // Same name as in first workspace
        })
        .expect(201);

      expect(response.body.name).toBe('Updated Project');
      expect(response.body.workspaceId).toBe(otherWorkspace);
    });
  });

  describe('Soft Delete', () => {
    it('should soft delete a project', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(204);
    });

    it('should not list deleted project', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      expect(response.body.find((p: any) => p.id === projectId)).toBeUndefined();
    });
  });
});
