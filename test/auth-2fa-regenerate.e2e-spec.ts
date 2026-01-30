import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Repository } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { BackupCode } from '../src/database/entities/backup-code.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as crypto from 'crypto';

describe('Auth 2FA Regenerate Backup Codes (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let backupCodeRepository: Repository<BackupCode>;
  let testUser: User;
  let authToken: string;
  const testPassword = 'TestPass123!';

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
    const passwordHash = await bcrypt.hash(testPassword, 12);
    testUser = userRepository.create({
      email: '2fa-regenerate-test@example.com',
      passwordHash,
      twoFactorEnabled: false,
    });
    testUser = await userRepository.save(testUser);

    // Get auth token
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: '2fa-regenerate-test@example.com',
        password: testPassword,
      });

    authToken = loginResponse.body.tokens.access_token;
  });

  afterAll(async () => {
    await backupCodeRepository.delete({ userId: testUser.id });
    await userRepository.delete({ id: testUser.id });
    await app.close();
  });

  beforeEach(async () => {
    // Reset state before each test
    await backupCodeRepository.delete({ userId: testUser.id });
    await userRepository.update(testUser.id, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });
  });

  async function enable2FAForUser(): Promise<void> {
    const enableResponse = await request(app.getHttpServer())
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const token = speakeasy.totp({
      secret: enableResponse.body.secret,
      encoding: 'base32',
    });

    await request(app.getHttpServer())
      .post('/api/auth/2fa/verify-setup')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ code: token })
      .expect(200);
  }

  describe('POST /api/auth/2fa/backup-codes/regenerate', () => {
    it('should regenerate backup codes with valid password', async () => {
      // Enable 2FA first
      await enable2FAForUser();

      // Get old backup codes
      const oldCodes = await backupCodeRepository.find({
        where: { userId: testUser.id },
      });
      expect(oldCodes.length).toBe(10);
      const oldHashes = oldCodes.map((c) => c.codeHash);

      // Regenerate backup codes
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      expect(response.body).toHaveProperty('backupCodes');
      expect(response.body.backupCodes).toHaveLength(10);

      // Get new backup codes from database
      const newCodes = await backupCodeRepository.find({
        where: { userId: testUser.id },
      });
      expect(newCodes.length).toBe(10);

      // Verify new hashes are different from old ones
      const newHashes = newCodes.map((c) => c.codeHash);
      newHashes.forEach((newHash) => {
        expect(oldHashes).not.toContain(newHash);
      });
    });

    it('should return 401 for invalid password', async () => {
      // Enable 2FA first
      await enable2FAForUser();

      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: 'WrongPassword123!' })
        .expect(401);

      expect(response.body.message).toContain('Invalid password');
    });

    it('should return 400 if 2FA not enabled', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(400);

      expect(response.body.message).toContain('2FA is not enabled');
    });

    it('should delete all old backup codes', async () => {
      // Enable 2FA
      await enable2FAForUser();

      // Get old codes
      const oldCodes = await backupCodeRepository.find({
        where: { userId: testUser.id },
      });
      expect(oldCodes.length).toBe(10);
      const oldIds = oldCodes.map((c) => c.id);

      // Regenerate
      await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      // Verify old codes no longer exist
      for (const oldId of oldIds) {
        const found = await backupCodeRepository.findOne({
          where: { id: oldId },
        });
        expect(found).toBeNull();
      }
    });

    it('should generate 10 new unique codes', async () => {
      // Enable 2FA
      await enable2FAForUser();

      // Regenerate
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      const codes = response.body.backupCodes;
      expect(codes).toHaveLength(10);

      // Verify all codes are unique
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(10);

      // Verify format (10 characters, alphanumeric uppercase)
      codes.forEach((code: string) => {
        expect(code).toHaveLength(10);
        expect(code).toMatch(/^[A-Z0-9]+$/);
      });
    });

    it('should return new backup codes to user', async () => {
      // Enable 2FA
      await enable2FAForUser();

      // Regenerate
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      expect(response.body.backupCodes).toBeDefined();
      expect(Array.isArray(response.body.backupCodes)).toBe(true);
      expect(response.body.backupCodes.length).toBe(10);
    });

    it('should store new codes as SHA-256 hashes', async () => {
      // Enable 2FA
      await enable2FAForUser();

      // Regenerate
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      const plainCodes = response.body.backupCodes;

      // Get stored codes
      const storedCodes = await backupCodeRepository.find({
        where: { userId: testUser.id },
      });

      expect(storedCodes.length).toBe(10);

      // Verify hashing
      storedCodes.forEach((storedCode) => {
        expect(storedCode.codeHash).toHaveLength(64); // SHA-256 hex
        expect(storedCode.codeHash).toMatch(/^[a-f0-9]{64}$/);

        // Verify none of the plain codes match stored hashes
        expect(plainCodes).not.toContain(storedCode.codeHash);
      });

      // Verify we can find codes by hashing plain codes
      plainCodes.forEach((plainCode: string) => {
        const hash = crypto.createHash('sha256').update(plainCode).digest('hex');
        const found = storedCodes.find((sc) => sc.codeHash === hash);
        expect(found).toBeDefined();
      });
    });

    it('should return 401 if not authenticated', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .send({ password: testPassword })
        .expect(401);
    });

    it('should validate password is provided', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });

    it('should maintain 2FA enabled status after regeneration', async () => {
      // Enable 2FA
      await enable2FAForUser();

      // Regenerate codes
      await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      // Verify 2FA still enabled
      const user = await userRepository.findOne({ where: { id: testUser.id } });
      expect(user!.twoFactorEnabled).toBe(true);
      expect(user!.twoFactorSecret).toBeDefined();
    });

    it('should allow multiple regenerations', async () => {
      // Enable 2FA
      await enable2FAForUser();

      // First regeneration
      const response1 = await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      const codes1 = response1.body.backupCodes;

      // Second regeneration
      const response2 = await request(app.getHttpServer())
        .post('/api/auth/2fa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      const codes2 = response2.body.backupCodes;

      // Verify codes are different
      expect(codes1).not.toEqual(codes2);

      // Verify still have exactly 10 codes in database
      const finalCodes = await backupCodeRepository.find({
        where: { userId: testUser.id },
      });
      expect(finalCodes.length).toBe(10);
    });
  });
});
