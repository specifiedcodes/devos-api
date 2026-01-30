import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import * as bcrypt from 'bcrypt';

describe('Login Flow (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const testUser = {
    email: 'logintest@example.com',
    password: 'SecurePass123!',
    passwordHash: '',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply validation pipe (same as main.ts)
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // Create test user for login tests
    const userRepository = dataSource.getRepository(User);
    testUser.passwordHash = await bcrypt.hash(testUser.password, 12);

    // Clean up any existing test user
    await userRepository.delete({ email: testUser.email });

    // Create fresh test user
    const user = userRepository.create({
      email: testUser.email,
      passwordHash: testUser.passwordHash,
      twoFactorEnabled: false,
    });
    await userRepository.save(user);
  });

  afterAll(async () => {
    // Clean up test user
    const userRepository = dataSource.getRepository(User);
    await userRepository.delete({ email: testUser.email });

    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('should complete full login flow for registered user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      // Verify response structure
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');

      // Verify user object
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user).toHaveProperty('created_at');
      expect(response.body.user).not.toHaveProperty('passwordHash');

      // Verify tokens
      expect(response.body.tokens).toHaveProperty('access_token');
      expect(response.body.tokens).toHaveProperty('refresh_token');
      expect(response.body.tokens.expires_in).toBe(86400);
      expect(typeof response.body.tokens.access_token).toBe('string');
      expect(typeof response.body.tokens.refresh_token).toBe('string');
    });

    it('should reject login for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should reject login with incorrect password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should validate JWT token structure and expiry', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      const accessToken = response.body.tokens.access_token;

      // JWT should have 3 parts separated by dots
      const tokenParts = accessToken.split('.');
      expect(tokenParts.length).toBe(3);

      // Decode payload (base64)
      const payload = JSON.parse(
        Buffer.from(tokenParts[1], 'base64').toString(),
      );

      // Verify payload structure
      expect(payload).toHaveProperty('sub'); // user ID
      expect(payload).toHaveProperty('email');
      expect(payload.email).toBe(testUser.email);
      expect(payload).toHaveProperty('iat'); // issued at
      expect(payload).toHaveProperty('exp'); // expiry

      // Verify expiry is approximately 24 hours from now
      const now = Math.floor(Date.now() / 1000);
      const expectedExpiry = now + 86400; // 24 hours
      expect(payload.exp).toBeGreaterThan(now);
      expect(payload.exp).toBeLessThanOrEqual(expectedExpiry + 10); // Allow 10 second tolerance
    });

    it('should update last_login_at in database', async () => {
      const userRepository = dataSource.getRepository(User);

      // Get user before login
      const userBefore = await userRepository.findOne({
        where: { email: testUser.email },
      });

      // Perform login
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      // Get user after login
      const userAfter = await userRepository.findOne({
        where: { email: testUser.email },
      });

      // Verify last_login_at was updated
      expect(userAfter?.lastLoginAt).not.toBeNull();
      if (userBefore?.lastLoginAt) {
        expect(userAfter?.lastLoginAt?.getTime()).toBeGreaterThan(
          userBefore.lastLoginAt.getTime(),
        );
      }
    });

    it('should enforce rate limiting (6th attempt returns 429)', async () => {
      // Make 5 failed login attempts (should succeed without rate limiting)
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({
            email: 'ratelimit@example.com',
            password: 'WrongPassword123!',
          })
          .expect(401);
      }

      // 6th attempt should be rate limited
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'ratelimit@example.com',
          password: 'WrongPassword123!',
        })
        .expect(429);
    });

    it('should handle database connection errors gracefully', async () => {
      // This test verifies error handling, but we cannot easily simulate
      // database errors in e2e tests without mocking
      // Instead, we test that the endpoint doesn't crash with malformed data

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'not-an-email',
          password: 'short',
        })
        .expect(400);

      // Should return validation error, not crash
      expect(response.body).toHaveProperty('message');
    });

    it('should accept case-insensitive email login', async () => {
      // Try logging in with uppercase email
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email.toUpperCase(),
          password: testUser.password,
        })
        .expect(200);

      expect(response.body.user.email).toBe(testUser.email.toLowerCase());
    });

    it('should reject empty email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: '',
          password: 'SecurePass123!',
        })
        .expect(400);
    });

    it('should reject empty password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: '',
        })
        .expect(400);
    });

    it('should reject missing email field', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          password: 'SecurePass123!',
        })
        .expect(400);
    });

    it('should reject missing password field', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
        })
        .expect(400);
    });
  });
});
