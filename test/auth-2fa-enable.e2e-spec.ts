import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Repository } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { BackupCode } from '../src/database/entities/backup-code.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';

describe('Auth 2FA Enable (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let backupCodeRepository: Repository<BackupCode>;
  let testUser: User;
  let authToken: string;

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
    backupCodeRepository = moduleFixture.get<Repository<BackupCode>>(
      getRepositoryToken(BackupCode),
    );

    // Create test user
    const passwordHash = await bcrypt.hash('TestPass123!', 12);
    testUser = userRepository.create({
      email: '2fa-test@example.com',
      passwordHash,
      twoFactorEnabled: false,
    });
    testUser = await userRepository.save(testUser);

    // Get auth token
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: '2fa-test@example.com',
        password: 'TestPass123!',
      });

    authToken = loginResponse.body.tokens.access_token;
  });

  afterAll(async () => {
    await backupCodeRepository.delete({ userId: testUser.id });
    await userRepository.delete({ id: testUser.id });
    await app.close();
  });

  afterEach(async () => {
    // Reset 2FA state
    await backupCodeRepository.delete({ userId: testUser.id });
    await userRepository.update(testUser.id, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });
  });

  describe('POST /api/auth/2fa/enable', () => {
    it('should initiate 2FA setup and return QR code and backup codes', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('qrCode');
      expect(response.body).toHaveProperty('secret');
      expect(response.body).toHaveProperty('backupCodes');

      // QR code should be a base64 data URL
      expect(response.body.qrCode).toMatch(/^data:image\/png;base64,/);

      // Secret should be base32 encoded (alphanumeric uppercase)
      expect(response.body.secret).toMatch(/^[A-Z2-7]+$/);

      // Should have exactly 10 backup codes
      expect(response.body.backupCodes).toHaveLength(10);

      // Each backup code should be 10 characters
      response.body.backupCodes.forEach((code: string) => {
        expect(code).toHaveLength(10);
        expect(code).toMatch(/^[A-Z0-9]+$/);
      });
    });

    it('should return 400 if 2FA already enabled', async () => {
      // Enable 2FA first
      await userRepository.update(testUser.id, {
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted_secret',
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.message).toContain('already enabled');
    });

    it('should return 401 if not authenticated', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .expect(401);
    });

    it('should encrypt TOTP secret before storing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });

      expect(updatedUser!.twoFactorSecret).toBeDefined();
      expect(updatedUser!.twoFactorSecret).not.toBeNull();
      // Encrypted format should be: iv:authTag:ciphertext
      expect(updatedUser!.twoFactorSecret!.split(':')).toHaveLength(3);
    });

    it('should generate exactly 10 backup codes', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const codes = await backupCodeRepository.find({
        where: { userId: testUser.id },
      });

      expect(codes).toHaveLength(10);
    });

    it('should store backup codes as SHA-256 hashes', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const plainCodes = response.body.backupCodes;
      const storedCodes = await backupCodeRepository.find({
        where: { userId: testUser.id },
      });

      storedCodes.forEach((storedCode) => {
        // Hash should be 64 characters (SHA-256 hex)
        expect(storedCode.codeHash).toHaveLength(64);
        expect(storedCode.codeHash).toMatch(/^[a-f0-9]{64}$/);

        // Verify no plain codes match stored hashes
        expect(plainCodes).not.toContain(storedCode.codeHash);
      });
    });

    it('should generate valid QR code data URL', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const qrCode = response.body.qrCode;

      // Should be a valid base64 PNG data URL
      expect(qrCode).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    });

    it('should return base32-encoded secret for manual entry', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const secret = response.body.secret;

      // Base32 uses A-Z and 2-7
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(secret.length).toBeGreaterThan(0);
    });
  });
});
