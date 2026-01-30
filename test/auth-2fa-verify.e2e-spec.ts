import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Repository } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';

describe('Auth 2FA Verification (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let testUser: User;
  let authToken: string;
  let totpSecret: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    userRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );

    // Create test user
    const passwordHash = await bcrypt.hash('TestPass123!', 12);
    testUser = userRepository.create({
      email: '2fa-verify-test@example.com',
      passwordHash,
      twoFactorEnabled: false,
    });
    testUser = await userRepository.save(testUser);

    // Get auth token
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: '2fa-verify-test@example.com',
        password: 'TestPass123!',
      });

    authToken = loginResponse.body.tokens.access_token;
  });

  afterAll(async () => {
    await userRepository.delete({ id: testUser.id });
    await app.close();
  });

  beforeEach(async () => {
    // Reset 2FA state before each test
    await userRepository.update(testUser.id, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });
  });

  describe('POST /api/auth/2fa/verify-setup', () => {
    it('should verify valid TOTP code and enable 2FA', async () => {
      // First, enable 2FA to get the secret
      const enableResponse = await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      totpSecret = enableResponse.body.secret;

      // Generate valid TOTP code
      const token = speakeasy.totp({
        secret: totpSecret,
        encoding: 'base32',
      });

      // Verify with the code
      const verifyResponse = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: token })
        .expect(200);

      expect(verifyResponse.body.message).toContain('2FA enabled successfully');

      // Check that 2FA is now enabled
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser!.twoFactorEnabled).toBe(true);
    });

    it('should return 401 for invalid TOTP code', async () => {
      // Enable 2FA first
      await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Try to verify with invalid code
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '000000' })
        .expect(401);

      expect(response.body.message).toContain('Invalid verification code');
    });

    it('should return 400 if setup not initiated', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '123456' })
        .expect(400);

      expect(response.body.message).toContain('2FA setup not initiated');
    });

    it('should set twoFactorEnabled=true on success', async () => {
      // Enable and get secret
      const enableResponse = await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const token = speakeasy.totp({
        secret: enableResponse.body.secret,
        encoding: 'base32',
      });

      // Verify
      await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: token })
        .expect(200);

      // Verify database state
      const user = await userRepository.findOne({ where: { id: testUser.id } });
      expect(user!.twoFactorEnabled).toBe(true);
      expect(user!.twoFactorSecret).toBeDefined();
    });

    it('should accept codes within 30-second window', async () => {
      // Enable 2FA
      const enableResponse = await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Generate token (window is applied during verification on the server side)
      const token = speakeasy.totp({
        secret: enableResponse.body.secret,
        encoding: 'base32',
        step: 30,
      });

      await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: token })
        .expect(200);
    });

    it('should reject codes outside time window', async () => {
      // Enable 2FA
      const enableResponse = await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Generate token with time far in the past (outside window)
      const oldTime = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago
      const token = speakeasy.totp({
        secret: enableResponse.body.secret,
        encoding: 'base32',
        time: oldTime,
      });

      await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: token })
        .expect(401);
    });

    it('should return 401 if not authenticated', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-setup')
        .send({ code: '123456' })
        .expect(401);
    });

    it('should validate code format (6 digits, numeric only)', async () => {
      // Non-numeric code
      await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: 'ABCDEF' })
        .expect(400);

      // Wrong length
      await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '12345' })
        .expect(400);

      // Too long
      await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '1234567' })
        .expect(400);
    });
  });
});
