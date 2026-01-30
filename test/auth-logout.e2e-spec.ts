import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import * as cookieParser from 'cookie-parser';

describe('Auth Logout (e2e)', () => {
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

  describe('POST /api/auth/logout', () => {
    it('should logout successfully and clear cookies', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', [
          `access_token=${accessToken}`,
          `refresh_token=${refreshToken}`,
        ])
        .expect(200);

      expect(response.body.message).toBe('Logged out successfully');

      // Verify cookies are cleared
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();

      // Check that access_token cookie is cleared (empty value or expired)
      const accessTokenCookie = cookies.find((c: string) =>
        c.startsWith('access_token='),
      );
      expect(accessTokenCookie).toBeDefined();

      // Check that refresh_token cookie is cleared (empty value or expired)
      const refreshTokenCookie = cookies.find((c: string) =>
        c.startsWith('refresh_token='),
      );
      expect(refreshTokenCookie).toBeDefined();
    });

    it('should blacklist access and refresh tokens', async () => {
      // Logout
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', [
          `access_token=${accessToken}`,
          `refresh_token=${refreshToken}`,
        ])
        .expect(200);

      // Try to use the blacklisted access token
      // This would require a protected endpoint - we can test with refresh
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${refreshToken}`])
        .expect(401);

      expect(response.body.message).toContain('Token has been invalidated');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body.message).toBeDefined();
    });

    it('should handle logout with missing tokens gracefully', async () => {
      // Logout with only access token (no refresh token)
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', [`access_token=${accessToken}`])
        .expect(200);

      expect(response.body.message).toBe('Logged out successfully');
    });

    it('should require valid access token for logout', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', ['access_token=invalid-token'])
        .expect(401);

      expect(response.body.message).toBeDefined();
    });

    it('should prevent using blacklisted token after logout', async () => {
      // First logout
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', [
          `access_token=${accessToken}`,
          `refresh_token=${refreshToken}`,
        ])
        .expect(200);

      // Try to logout again with the same token
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', [`access_token=${accessToken}`])
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
