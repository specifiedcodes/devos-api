import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { RedisService } from '../src/modules/redis/redis.service';

describe('Password Change (e2e)', () => {
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
      "DELETE FROM users WHERE email LIKE '%password-change-test%'",
    );
    await app.close();
  });

  describe('POST /api/auth/password/change', () => {
    afterEach(async () => {
      // Add delay to avoid rate limiting between tests
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should change password with valid inputs', async () => {
      const email = 'password-change-test-1@devos.dev';
      const originalPassword = 'OriginalPass123!';
      const newPassword = 'NewPass456!';

      // Register
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: originalPassword,
          passwordConfirmation: originalPassword,
        });

      const accessToken = registerResponse.body.tokens.access_token;

      // Change password
      const response = await request(app.getHttpServer())
        .post('/api/auth/password/change')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          current_password: originalPassword,
          new_password: newPassword,
          confirm_password: newPassword,
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Password changed successfully');

      // Verify can login with new password
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email,
          password: newPassword,
        })
        .expect(200);

      expect(loginResponse.body.tokens).toHaveProperty('access_token');
    });

    it('should reject when current password is incorrect', async () => {
      const email = 'password-change-test-2@devos.dev';
      const password = 'TestPass123!';

      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password,
          passwordConfirmation: password,
        });

      const token = registerResponse.body.tokens.access_token;

      await request(app.getHttpServer())
        .post('/api/auth/password/change')
        .set('Authorization', `Bearer ${token}`)
        .send({
          current_password: 'WrongPassword123!',
          new_password: 'NewPass456!',
          confirm_password: 'NewPass456!',
        })
        .expect(401);
    });

    it('should reject when new password is weak', async () => {
      const email = 'password-change-test-3@devos.dev';
      const password = 'TestPass123!';

      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password,
          passwordConfirmation: password,
        });

      const token = registerResponse.body.tokens.access_token;

      await request(app.getHttpServer())
        .post('/api/auth/password/change')
        .set('Authorization', `Bearer ${token}`)
        .send({
          current_password: password,
          new_password: 'weak',
          confirm_password: 'weak',
        })
        .expect(400);
    });

    it('should reject when passwords do not match', async () => {
      const email = 'password-change-test-4@devos.dev';
      const password = 'TestPass123!';

      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password,
          passwordConfirmation: password,
        });

      const token = registerResponse.body.tokens.access_token;

      await request(app.getHttpServer())
        .post('/api/auth/password/change')
        .set('Authorization', `Bearer ${token}`)
        .send({
          current_password: password,
          new_password: 'NewPass456!',
          confirm_password: 'DifferentPass789!',
        })
        .expect(400);
    });

    it('should reject when new password same as current', async () => {
      const email = 'password-change-test-5@devos.dev';
      const password = 'TestPass123!';

      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password,
          passwordConfirmation: password,
        });

      const token = registerResponse.body.tokens.access_token;

      await request(app.getHttpServer())
        .post('/api/auth/password/change')
        .set('Authorization', `Bearer ${token}`)
        .send({
          current_password: password,
          new_password: password,
          confirm_password: password,
        })
        .expect(400);
    });

    it('should invalidate all refresh tokens after password change', async () => {
      const email = 'password-change-test-6@devos.dev';
      const password = 'TestPass123!';

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

      // Change password
      await request(app.getHttpServer())
        .post('/api/auth/password/change')
        .set('Authorization', `Bearer ${token}`)
        .send({
          current_password: password,
          new_password: 'NewPass456!',
          confirm_password: 'NewPass456!',
        })
        .expect(200);

      // Verify session was deleted
      const sessionExists = await redisService.get(
        `session:${userId}:test-session`,
      );
      expect(sessionExists).toBeNull();
    });
  });
});
