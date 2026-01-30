import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';

describe('Profile Management (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let testUserId: string;

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

    // Register and login a test user
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'profile-test@devos.dev',
        password: 'TestPass123!',
        passwordConfirmation: 'TestPass123!',
      });

    testUserId = registerResponse.body.user.id;
    accessToken = registerResponse.body.tokens.access_token;
  });

  afterAll(async () => {
    // Cleanup test user
    await dataSource.query('DELETE FROM users WHERE email = $1', [
      'profile-test@devos.dev',
    ]);
    await app.close();
  });

  describe('GET /api/auth/profile', () => {
    it('should return user profile for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', testUserId);
      expect(response.body).toHaveProperty('email', 'profile-test@devos.dev');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('last_login_at');
      expect(response.body).toHaveProperty('two_factor_enabled', false);
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .expect(401);
    });

    it('should not include sensitive fields (password_hash, two_factor_secret)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).not.toHaveProperty('password_hash');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('two_factor_secret');
      expect(response.body).not.toHaveProperty('twoFactorSecret');
    });

    it('should include two_factor_enabled status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('two_factor_enabled');
      expect(typeof response.body.two_factor_enabled).toBe('boolean');
    });
  });
});
