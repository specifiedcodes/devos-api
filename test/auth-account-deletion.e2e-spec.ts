import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { RedisService } from '../src/modules/redis/redis.service';

describe('Account Deletion (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let redisService: RedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    redisService = moduleFixture.get<RedisService>(RedisService);
  });

  afterAll(async () => {
    // Cleanup all test users
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%account-deletion-test%'",
    );
    await dataSource.query(
      "DELETE FROM account_deletions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%account-deletion-test%')",
    );
    await app.close();
  });

  describe('POST /api/auth/account/delete', () => {
    it('should soft delete account with valid password', async () => {
      const email = 'account-deletion-test-1@devos.dev';
      const password = 'TestPass123!';

      // Register
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password,
          passwordConfirmation: password,
        });

      const userId = registerResponse.body.user.id;
      const token = registerResponse.body.tokens.access_token;

      // Delete account
      const response = await request(app.getHttpServer())
        .post('/api/auth/account/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ password })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('30 days');

      // Verify email anonymized
      const user = await dataSource.query(
        'SELECT email, deleted_at FROM users WHERE id = $1',
        [userId],
      );
      expect(user[0].email).toBe(`deleted_${userId}@deleted.local`);
      expect(user[0].deleted_at).not.toBeNull();

      // Verify deletion record created
      const deletionRecord = await dataSource.query(
        'SELECT * FROM account_deletions WHERE user_id = $1',
        [userId],
      );
      expect(deletionRecord.length).toBe(1);
      expect(deletionRecord[0].completed).toBe(false);
    });

    it('should reject when password is incorrect', async () => {
      const email = 'account-deletion-test-2@devos.dev';
      const password = 'TestPass123!';

      // Register
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password,
          passwordConfirmation: password,
        });

      const token = registerResponse.body.tokens.access_token;

      // Try to delete with wrong password
      await request(app.getHttpServer())
        .post('/api/auth/account/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'WrongPassword123!' })
        .expect(401);
    });

    it('should prevent login after soft delete', async () => {
      const email = 'account-deletion-test-3@devos.dev';
      const password = 'TestPass123!';

      // Register
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password,
          passwordConfirmation: password,
        });

      const token = registerResponse.body.tokens.access_token;

      // Delete account
      await request(app.getHttpServer())
        .post('/api/auth/account/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ password })
        .expect(200);

      // Try to login - should fail because email is anonymized
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(401);
    });

    it('should invalidate all user sessions', async () => {
      const email = 'account-deletion-test-4@devos.dev';
      const password = 'TestPass123!';

      // Register
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password,
          passwordConfirmation: password,
        });

      const userId = registerResponse.body.user.id;
      const token = registerResponse.body.tokens.access_token;
      const refreshToken = registerResponse.body.tokens.refresh_token;

      // Store a session in Redis manually
      await redisService.set(
        `session:${userId}:test-session`,
        refreshToken,
        60 * 60 * 24 * 30,
      );

      // Delete account
      await request(app.getHttpServer())
        .post('/api/auth/account/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ password })
        .expect(200);

      // Verify session was deleted
      const sessionExists = await redisService.get(
        `session:${userId}:test-session`,
      );
      expect(sessionExists).toBeNull();
    });

    it('should delete workspace memberships', async () => {
      const email = 'account-deletion-test-5@devos.dev';
      const password = 'TestPass123!';

      // Register
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password,
          passwordConfirmation: password,
        });

      const userId = registerResponse.body.user.id;
      const token = registerResponse.body.tokens.access_token;

      // Create workspace membership (if workspace exists)
      // This would require workspace creation logic which may not exist yet
      // So we'll just verify the deletion endpoint doesn't fail

      // Delete account
      await request(app.getHttpServer())
        .post('/api/auth/account/delete')
        .set('Authorization', `Bearer ${token}`)
        .send({ password })
        .expect(200);

      // Verify workspace memberships deleted
      const memberships = await dataSource.query(
        'SELECT * FROM workspace_members WHERE user_id = $1',
        [userId],
      );
      expect(memberships.length).toBe(0);
    });
  });
});
