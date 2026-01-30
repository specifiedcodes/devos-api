import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Auth Security & Session Management (E2E)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  describe('Security Event Logging', () => {
    const testEmail = `security-test-${Date.now()}@example.com`;
    const testPassword = 'SecurePass123!';

    it('should log successful registration event', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          passwordConfirmation: testPassword,
        })
        .expect(201);

      // Check security event was logged
      const result = await dataSource.query(
        `SELECT * FROM security_events
         WHERE email = $1 AND event_type = 'login_success'
         AND metadata @> '{"registration": true}'
         ORDER BY created_at DESC LIMIT 1`,
        [testEmail],
      );

      expect(result).toHaveLength(1);
      expect(result[0].event_type).toBe('login_success');
      expect(result[0].ip_address).toBeDefined();
    });

    it('should log failed login with invalid email', async () => {
      const nonExistentEmail = `nonexistent-${Date.now()}@example.com`;

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: nonExistentEmail,
          password: 'wrongpassword',
        })
        .expect(401);

      // Check security event was logged
      const result = await dataSource.query(
        `SELECT * FROM security_events
         WHERE email = $1 AND event_type = 'login_failed' AND reason = 'invalid_email'
         ORDER BY created_at DESC LIMIT 1`,
        [nonExistentEmail],
      );

      expect(result).toHaveLength(1);
      expect(result[0].event_type).toBe('login_failed');
      expect(result[0].reason).toBe('invalid_email');
    });

    it('should log failed login with invalid password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'wrongpassword',
        })
        .expect(401);

      // Check security event was logged
      const result = await dataSource.query(
        `SELECT * FROM security_events
         WHERE email = $1 AND event_type = 'login_failed' AND reason = 'invalid_password'
         ORDER BY created_at DESC LIMIT 1`,
        [testEmail],
      );

      expect(result).toHaveLength(1);
      expect(result[0].event_type).toBe('login_failed');
      expect(result[0].reason).toBe('invalid_password');
    });

    it('should log successful login event', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(200);

      // Check security event was logged
      const result = await dataSource.query(
        `SELECT * FROM security_events
         WHERE email = $1 AND event_type = 'login_success'
         ORDER BY created_at DESC LIMIT 1`,
        [testEmail],
      );

      expect(result).toHaveLength(1);
      expect(result[0].event_type).toBe('login_success');
      expect(result[0].user_id).toBeDefined();
      expect(result[0].ip_address).toBeDefined();
      expect(result[0].user_agent).toBeDefined();
    });
  });

  describe('Session Management', () => {
    let accessToken: string;
    let userId: string;
    const testEmail = `session-test-${Date.now()}@example.com`;
    const testPassword = 'SecurePass123!';

    beforeAll(async () => {
      // Register and login
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          passwordConfirmation: testPassword,
        })
        .expect(201);

      accessToken = registerResponse.body.tokens.access_token;
      userId = registerResponse.body.user.id;
    });

    it('should create session in Redis on registration', async () => {
      // Check session exists in Redis
      const sessions = await dataSource.query(
        `SELECT * FROM security_events
         WHERE user_id = $1 AND event_type = 'session_created'
         ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );

      expect(sessions).toHaveLength(1);
      expect(sessions[0].metadata).toHaveProperty('session_id');
    });

    it('should list all active sessions for user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('session_id');
      expect(response.body[0]).toHaveProperty('created_at');
      expect(response.body[0]).toHaveProperty('ip_address');
      expect(response.body[0]).toHaveProperty('user_agent');
      expect(response.body[0]).toHaveProperty('is_current');
      expect(response.body[0].is_current).toBe(true);
    });

    it('should delete specific session', async () => {
      // Create a second session by logging in again
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(200);

      const secondAccessToken = loginResponse.body.tokens.access_token;

      // Get all sessions
      const sessionsResponse = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(sessionsResponse.body.length).toBeGreaterThanOrEqual(2);

      // Find a session that is not current
      const sessionToDelete = sessionsResponse.body.find(
        (s: any) => !s.is_current,
      );
      expect(sessionToDelete).toBeDefined();

      // Delete the session
      await request(app.getHttpServer())
        .delete(`/api/auth/sessions/${sessionToDelete.session_id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify session was deleted
      const updatedSessions = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(updatedSessions.body.length).toBe(
        sessionsResponse.body.length - 1,
      );
    });
  });

  describe('Token Revocation', () => {
    let accessToken: string;
    let refreshToken: string;
    const testEmail = `revocation-test-${Date.now()}@example.com`;
    const testPassword = 'SecurePass123!';

    beforeAll(async () => {
      // Register
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          passwordConfirmation: testPassword,
        })
        .expect(201);

      accessToken = response.body.tokens.access_token;
      refreshToken = response.body.tokens.refresh_token;
    });

    it('should allow non-revoked token to access protected endpoint', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should revoke all user tokens on password change', async () => {
      const newPassword = 'NewSecurePass456!';

      await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          current_password: testPassword,
          new_password: newPassword,
          confirm_password: newPassword,
        })
        .expect(200);

      // Old token should no longer work
      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      // Check password changed security event was logged
      const result = await dataSource.query(
        `SELECT * FROM security_events
         WHERE email = $1 AND event_type = 'password_changed'
         ORDER BY created_at DESC LIMIT 1`,
        [testEmail],
      );

      expect(result).toHaveLength(1);
      expect(result[0].event_type).toBe('password_changed');
    });
  });

  describe('Security Dashboard', () => {
    let accessToken: string;
    const testEmail = `dashboard-test-${Date.now()}@example.com`;
    const testPassword = 'SecurePass123!';

    beforeAll(async () => {
      // Register
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          passwordConfirmation: testPassword,
        })
        .expect(201);

      accessToken = response.body.tokens.access_token;
    });

    it('should return security dashboard metrics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/security/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('failed_login_rate');
      expect(response.body).toHaveProperty('total_failed_logins');
      expect(response.body).toHaveProperty('active_sessions_count');
      expect(response.body).toHaveProperty('two_factor_adoption_rate');
      expect(response.body).toHaveProperty('account_lockouts');
      expect(response.body).toHaveProperty('deleted_accounts');
      expect(response.body).toHaveProperty('generated_at');

      expect(typeof response.body.failed_login_rate).toBe('number');
      expect(typeof response.body.active_sessions_count).toBe('number');
      expect(typeof response.body.two_factor_adoption_rate).toBe('number');
    });
  });
});
