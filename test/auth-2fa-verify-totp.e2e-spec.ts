import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { EncryptionService } from '../src/shared/encryption/encryption.service';

describe('2FA TOTP Verification (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let encryptionService: EncryptionService;
  let testUser: User;
  let totpSecret: string;
  let tempToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    encryptionService = moduleFixture.get<EncryptionService>(EncryptionService);

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({ length: 32 });
    totpSecret = secret.base32;

    // Create test user with 2FA enabled
    const userRepository = dataSource.getRepository(User);
    const passwordHash = await bcrypt.hash('Test123!@#', 12);
    const encryptedSecret = encryptionService.encrypt(totpSecret);

    testUser = await userRepository.save({
      email: 'totp-test@example.com',
      passwordHash,
      twoFactorEnabled: true,
      twoFactorSecret: encryptedSecret,
    });
  });

  beforeEach(async () => {
    // Get temp token for each test
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'totp-test@example.com',
        password: 'Test123!@#',
      });

    tempToken = loginResponse.body.temp_token;
  });

  afterAll(async () => {
    // Cleanup
    const userRepository = dataSource.getRepository(User);
    await userRepository.delete({ email: 'totp-test@example.com' });
    await app.close();
  });

  describe('POST /api/auth/2fa/verify', () => {
    it('should verify valid TOTP code and return JWT tokens', async () => {
      // Generate valid TOTP code
      const validCode = speakeasy.totp({
        secret: totpSecret,
        encoding: 'base32',
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify')
        .send({
          temp_token: tempToken,
          code: validCode,
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.tokens).toHaveProperty('access_token');
      expect(response.body.tokens).toHaveProperty('refresh_token');
      expect(response.body.tokens).toHaveProperty('expires_in', 86400);
    });

    it('should update last_login_at timestamp on success', async () => {
      const validCode = speakeasy.totp({
        secret: totpSecret,
        encoding: 'base32',
      });

      const beforeTimestamp = new Date();

      await request(app.getHttpServer())
        .post('/api/auth/2fa/verify')
        .send({
          temp_token: tempToken,
          code: validCode,
        })
        .expect(200);

      // Verify timestamp was updated
      const userRepository = dataSource.getRepository(User);
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });

      expect(updatedUser?.lastLoginAt).toBeDefined();
      expect(updatedUser?.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(
        beforeTimestamp.getTime(),
      );
    });

    it('should reject invalid TOTP code with 401 error', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify')
        .send({
          temp_token: tempToken,
          code: '000000', // Invalid code
        })
        .expect(401);

      expect(response.body.message).toBe('Incorrect code, please try again');
    });

    it('should reject expired temp token with 401 error', async () => {
      const validCode = speakeasy.totp({
        secret: totpSecret,
        encoding: 'base32',
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify')
        .send({
          temp_token: 'expired-or-invalid-token-with-exactly-64-chars-aaaaaaaaaaaaa',
          code: validCode,
        })
        .expect(401);

      expect(response.body.message).toBe(
        'Verification timeout, please log in again',
      );
    });

    it('should verify codes within ±30 second time window', async () => {
      // Generate code for previous time step (30 seconds ago)
      const pastCode = speakeasy.totp({
        secret: totpSecret,
        encoding: 'base32',
        time: Math.floor(Date.now() / 1000) - 30, // 30 seconds in the past
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify')
        .send({
          temp_token: tempToken,
          code: pastCode,
        })
        .expect(200);

      expect(response.body).toHaveProperty('tokens');
    });

    it('should enforce rate limiting (6th attempt returns 429)', async () => {
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/2fa/verify')
          .send({
            temp_token: tempToken,
            code: '000000',
          })
          .expect(401);
      }

      // 6th attempt should be rate limited
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify')
        .send({
          temp_token: tempToken,
          code: '000000',
        })
        .expect(429);

      expect(response.body.message).toContain('ThrottlerException');
    });
  });
});
