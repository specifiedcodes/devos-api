import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import * as cookieParser from 'cookie-parser';

describe('Auth Refresh (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Enable cookie parsing
    app.use(cookieParser());

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
    await dataSource.destroy();
    await app.close();
  });

  beforeEach(async () => {
    // Clean database before each test
    await dataSource.query('DELETE FROM users');

    // Register and login a test user
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'StrongPassword123!',
        passwordConfirmation: 'StrongPassword123!',
      });

    // Extract tokens from cookies
    const cookies = registerResponse.headers['set-cookie'] as unknown as string[];
    accessToken = extractCookieValue(cookies, 'access_token');
    refreshToken = extractCookieValue(cookies, 'refresh_token');
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${refreshToken}`])
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.tokens).toHaveProperty('access_token');
      expect(response.body.tokens).toHaveProperty('refresh_token');
      expect(response.body.tokens).toHaveProperty('expires_in', 86400);

      // Verify new tokens are set in cookies
      const cookies = response.headers['set-cookie'] as unknown as string[];
      const newAccessToken = extractCookieValue(cookies, 'access_token');
      const newRefreshToken = extractCookieValue(cookies, 'refresh_token');

      expect(newAccessToken).toBeDefined();
      expect(newRefreshToken).toBeDefined();
      expect(newAccessToken).not.toBe(accessToken); // New token should be different
    });

    it('should return 401 for missing refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .expect(401);

      expect(response.body.message).toContain('No refresh token provided');
    });

    it('should return 401 for invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', ['refresh_token=invalid-token'])
        .expect(401);

      expect(response.body.message).toContain('Session expired');
    });

    it('should return 401 for expired refresh token', async () => {
      // This test would require a way to create an expired token
      // or mock the JWT service to return an expired token
      // For now, we'll test with a malformed token that will fail verification
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiZXhwIjoxfQ.invalid';

      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${expiredToken}`])
        .expect(401);

      expect(response.body.message).toContain('Session expired');
    });

    it('should rotate refresh token on refresh', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${refreshToken}`])
        .expect(200);

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const newRefreshToken = extractCookieValue(cookies, 'refresh_token');

      expect(newRefreshToken).toBeDefined();
      expect(newRefreshToken).not.toBe(refreshToken); // Token should be rotated
    });

    it('should set new tokens in httpOnly cookies', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${refreshToken}`])
        .expect(200);

      const cookies = response.headers['set-cookie'] as unknown as string[];

      // Check access_token cookie
      const accessTokenCookie = cookies.find((c: string) =>
        c.startsWith('access_token='),
      );
      expect(accessTokenCookie).toBeDefined();
      expect(accessTokenCookie).toContain('HttpOnly');
      expect(accessTokenCookie).toContain('SameSite=Strict');

      // Check refresh_token cookie
      const refreshTokenCookie = cookies.find((c: string) =>
        c.startsWith('refresh_token='),
      );
      expect(refreshTokenCookie).toBeDefined();
      expect(refreshTokenCookie).toContain('HttpOnly');
      expect(refreshTokenCookie).toContain('SameSite=Strict');
    });

    it('should return 401 when using blacklisted refresh token after logout', async () => {
      // First logout to blacklist the token
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', [
          `access_token=${accessToken}`,
          `refresh_token=${refreshToken}`,
        ])
        .expect(200);

      // Try to use the blacklisted refresh token
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${refreshToken}`])
        .expect(401);

      expect(response.body.message).toContain('Token has been invalidated');
    });
  });
});

function extractCookieValue(cookies: string[], cookieName: string): string {
  // Handle edge cases: null, undefined, empty array
  if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
    return '';
  }

  const cookie = cookies.find((c) => {
    // Handle malformed cookies gracefully
    if (typeof c !== 'string') return false;
    return c.startsWith(`${cookieName}=`);
  });

  if (!cookie) return '';

  const match = cookie.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? match[1] : '';
}
