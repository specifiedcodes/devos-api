import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { Workspace } from '../src/database/entities/workspace.entity';
import { WorkspaceMember } from '../src/database/entities/workspace-member.entity';
import * as jwt from 'jsonwebtoken';

describe('Authentication Registration (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply the same validation pipe as in main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up all tables (CASCADE handles foreign keys)
    if (dataSource.isInitialized) {
      await dataSource.query('TRUNCATE TABLE workspace_members, workspaces, security_events, backup_codes, users CASCADE');
    }
  });

  describe('POST /api/auth/register', () => {
    const validRegisterDto = {
      email: 'user@example.com',
      password: 'SecurePass123!',
      passwordConfirmation: 'SecurePass123!',
    };

    it('should complete full registration flow', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validRegisterDto)
        .expect(201);

      // Verify response structure
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');

      // Verify user data
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe('user@example.com');
      expect(response.body.user).toHaveProperty('created_at');
      expect(response.body.user).not.toHaveProperty('passwordHash');

      // Verify tokens
      expect(response.body.tokens).toHaveProperty('access_token');
      expect(response.body.tokens).toHaveProperty('refresh_token');
      expect(response.body.tokens.expires_in).toBe(86400);

      // Verify tokens are valid JWT
      expect(response.body.tokens.access_token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(response.body.tokens.refresh_token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });

    it('should create user record in database', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validRegisterDto)
        .expect(201);

      // Verify user was created in database
      const userRepo = dataSource.getRepository(User);
      const user = await userRepo.findOne({
        where: { email: 'user@example.com' },
      });

      expect(user).toBeDefined();
      expect(user!.id).toBe(response.body.user.id);
      expect(user!.email).toBe('user@example.com');
      expect(user!.passwordHash).toBeDefined();
      expect(user!.passwordHash).not.toBe('SecurePass123!'); // Verify hashed
      expect(user!.twoFactorEnabled).toBe(false);
    });

    it('should prevent duplicate email registration', async () => {
      // First registration
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validRegisterDto)
        .expect(201);

      // Second registration with same email
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validRegisterDto)
        .expect(409);

      expect(response.body.message).toContain('Email already registered');
    });

    it('should validate JWT token structure and expiry', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validRegisterDto)
        .expect(201);

      const accessToken = response.body.tokens.access_token;
      const refreshToken = response.body.tokens.refresh_token;

      // Decode tokens (without verification for testing)
      const decodedAccess = jwt.decode(accessToken) as any;
      const decodedRefresh = jwt.decode(refreshToken) as any;

      // Verify access token payload
      expect(decodedAccess).toHaveProperty('sub');
      expect(decodedAccess).toHaveProperty('email');
      expect(decodedAccess.email).toBe('user@example.com');
      expect(decodedAccess).toHaveProperty('iat');
      expect(decodedAccess).toHaveProperty('exp');

      // Verify refresh token payload
      expect(decodedRefresh).toHaveProperty('sub');
      expect(decodedRefresh).toHaveProperty('email');
      expect(decodedRefresh.email).toBe('user@example.com');

      // Verify expiry times (approximate check)
      const now = Math.floor(Date.now() / 1000);
      const accessExpiry = decodedAccess.exp - now;
      const refreshExpiry = decodedRefresh.exp - now;

      // Access token should expire in ~24 hours (86400 seconds)
      expect(accessExpiry).toBeGreaterThan(86300); // Allow 100s margin
      expect(accessExpiry).toBeLessThan(86500);

      // Refresh token should expire in ~30 days (2592000 seconds)
      expect(refreshExpiry).toBeGreaterThan(2591900); // Allow 100s margin
      expect(refreshExpiry).toBeLessThan(2592100);
    });

    it('should reject invalid email format', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          ...validRegisterDto,
          email: 'invalid-email',
        })
        .expect(400);

      expect(response.body.message).toContain('Invalid email format');
    });

    it('should reject weak password (too short)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          ...validRegisterDto,
          password: 'Short1!',
          passwordConfirmation: 'Short1!',
        })
        .expect(400);

      expect(response.body.message).toContain('at least 8 characters');
    });

    it('should reject password without uppercase', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          ...validRegisterDto,
          password: 'lowercase123',
          passwordConfirmation: 'lowercase123',
        })
        .expect(400);

      expect(response.body.message).toContain('uppercase');
    });

    it('should reject password without lowercase', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          ...validRegisterDto,
          password: 'UPPERCASE123',
          passwordConfirmation: 'UPPERCASE123',
        })
        .expect(400);

      expect(response.body.message).toContain('lowercase');
    });

    it('should reject password without number', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          ...validRegisterDto,
          password: 'NoNumbers!',
          passwordConfirmation: 'NoNumbers!',
        })
        .expect(400);

      expect(response.body.message).toContain('number');
    });

    it('should reject mismatched password confirmation', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          ...validRegisterDto,
          passwordConfirmation: 'DifferentPass456!',
        })
        .expect(400);

      expect(response.body.message).toContain('Password confirmation does not match');
    });

    it('should handle database connection errors gracefully', async () => {
      // Close database connection to simulate error
      await dataSource.destroy();

      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validRegisterDto)
        .expect(500);

      expect(response.body).toHaveProperty('statusCode', 500);
    });

    it('should store email in lowercase for case-insensitive comparison', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'User@Example.COM',
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        })
        .expect(201);

      expect(response.body.user.email).toBe('user@example.com');

      // Verify in database
      const userRepo = dataSource.getRepository(User);
      const user = await userRepo.findOne({
        where: { email: 'user@example.com' },
      });

      expect(user).toBeDefined();
      expect(user!.email).toBe('user@example.com');
    });

    it('should accept password with special characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'user@example.com',
          password: 'SecurePass123!@#$%',
          passwordConfirmation: 'SecurePass123!@#$%',
        })
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
    });

    it('should accept password without special characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'user@example.com',
          password: 'SecurePass123',
          passwordConfirmation: 'SecurePass123',
        })
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
    });

    // Story 2.1: Workspace Creation Tests
    describe('Workspace Creation on Registration', () => {
      it('should create default workspace on registration', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/register')
          .send(validRegisterDto)
          .expect(201);

        const userId = response.body.user.id;

        // Verify workspace was created
        const workspaceRepo = dataSource.getRepository(Workspace);
        const workspaces = await workspaceRepo.find({
          where: { ownerUserId: userId },
        });

        expect(workspaces).toHaveLength(1);
        expect(workspaces[0].name).toBe("User's Workspace");
        expect(workspaces[0].ownerUserId).toBe(userId);
        expect(workspaces[0].schemaName).toMatch(/^workspace_[a-f0-9]{32}$/);
      });

      it('should create workspace with correct name from email', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            email: 'johndoe@example.com',
            password: 'SecurePass123!',
            passwordConfirmation: 'SecurePass123!',
          })
          .expect(201);

        const userId = response.body.user.id;
        const workspaceRepo = dataSource.getRepository(Workspace);
        const workspace = await workspaceRepo.findOne({
          where: { ownerUserId: userId },
        });

        expect(workspace).toBeDefined();
        expect(workspace!.name).toBe("Johndoe's Workspace");
      });

      it('should add user as workspace owner in workspace_members', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/register')
          .send(validRegisterDto)
          .expect(201);

        const userId = response.body.user.id;

        // Get workspace
        const workspaceRepo = dataSource.getRepository(Workspace);
        const workspace = await workspaceRepo.findOne({
          where: { ownerUserId: userId },
        });

        // Verify workspace member entry
        const memberRepo = dataSource.getRepository(WorkspaceMember);
        const member = await memberRepo.findOne({
          where: {
            workspaceId: workspace!.id,
            userId: userId,
          },
        });

        expect(member).toBeDefined();
        expect(member!.role).toBe('owner');
      });

      it('should create PostgreSQL schema for workspace', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/register')
          .send(validRegisterDto)
          .expect(201);

        const userId = response.body.user.id;
        const workspaceRepo = dataSource.getRepository(Workspace);
        const workspace = await workspaceRepo.findOne({
          where: { ownerUserId: userId },
        });

        // Verify schema exists in PostgreSQL
        const schemaQuery = await dataSource.query(
          `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
          [workspace!.schemaName],
        );

        expect(schemaQuery).toHaveLength(1);
        expect(schemaQuery[0].schema_name).toBe(workspace!.schemaName);
      });

      it('should create base tables in workspace schema', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/register')
          .send(validRegisterDto)
          .expect(201);

        const userId = response.body.user.id;
        const workspaceRepo = dataSource.getRepository(Workspace);
        const workspace = await workspaceRepo.findOne({
          where: { ownerUserId: userId },
        });

        const schemaName = workspace!.schemaName;

        // Verify projects table exists
        const projectsTableQuery = await dataSource.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
          [schemaName, 'projects'],
        );
        expect(projectsTableQuery).toHaveLength(1);

        // Verify integrations table exists
        const integrationsTableQuery = await dataSource.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
          [schemaName, 'integrations'],
        );
        expect(integrationsTableQuery).toHaveLength(1);

        // Verify byok_secrets table exists
        const byokTableQuery = await dataSource.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
          [schemaName, 'byok_secrets'],
        );
        expect(byokTableQuery).toHaveLength(1);
      });

      it('should rollback workspace on registration failure', async () => {
        // Attempt registration with invalid data (after initial validation passes)
        // This test verifies transaction rollback
        const workspaceRepo = dataSource.getRepository(Workspace);
        const initialWorkspaceCount = await workspaceRepo.count();

        await request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            email: 'test@example.com',
            password: 'Pass123!',
            passwordConfirmation: 'DifferentPass123!',
          })
          .expect(400);

        const finalWorkspaceCount = await workspaceRepo.count();
        expect(finalWorkspaceCount).toBe(initialWorkspaceCount);
      });

      it('should handle concurrent workspace creation', async () => {
        const user1 = {
          email: 'user1@example.com',
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        };

        const user2 = {
          email: 'user2@example.com',
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        };

        // Register two users concurrently
        const [response1, response2] = await Promise.all([
          request(app.getHttpServer()).post('/api/auth/register').send(user1),
          request(app.getHttpServer()).post('/api/auth/register').send(user2),
        ]);

        expect(response1.status).toBe(201);
        expect(response2.status).toBe(201);

        // Verify both workspaces were created
        const workspaceRepo = dataSource.getRepository(Workspace);
        const workspaces = await workspaceRepo.find();

        expect(workspaces).toHaveLength(2);
        expect(workspaces[0].id).not.toBe(workspaces[1].id);
        expect(workspaces[0].schemaName).not.toBe(workspaces[1].schemaName);
      });
    });
  });
});
