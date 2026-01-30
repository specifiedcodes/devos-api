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

describe('Auth 2FA Disable (e2e)', () => {
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
      email: '2fa-disable-test@example.com',
      passwordHash,
      twoFactorEnabled: false,
    });
    testUser = await userRepository.save(testUser);

    // Get auth token
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: '2fa-disable-test@example.com',
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

  describe('POST /api/auth/2fa/disable', () => {
    it('should disable 2FA with valid password', async () => {
      // First enable 2FA
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

      // Now disable 2FA
      const disableResponse = await request(app.getHttpServer())
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      expect(disableResponse.body.message).toContain('2FA disabled successfully');

      // Verify 2FA is disabled
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser!.twoFactorEnabled).toBe(false);
    });

    it('should return 401 for invalid password', async () => {
      // Enable 2FA first
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

      // Try to disable with wrong password
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: 'WrongPassword123!' })
        .expect(401);

      expect(response.body.message).toContain('Invalid password');
    });

    it('should return 400 if 2FA not enabled', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(400);

      expect(response.body.message).toContain('2FA is not enabled');
    });

    it('should clear twoFactorSecret on success', async () => {
      // Enable 2FA
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

      // Disable 2FA
      await request(app.getHttpServer())
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      // Verify secret is cleared
      const user = await userRepository.findOne({ where: { id: testUser.id } });
      expect(user!.twoFactorSecret).toBeNull();
    });

    it('should delete all backup codes for user', async () => {
      // Enable 2FA
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

      // Verify backup codes exist
      let codes = await backupCodeRepository.find({
        where: { userId: testUser.id },
      });
      expect(codes.length).toBe(10);

      // Disable 2FA
      await request(app.getHttpServer())
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      // Verify backup codes are deleted
      codes = await backupCodeRepository.find({
        where: { userId: testUser.id },
      });
      expect(codes.length).toBe(0);
    });

    it('should set twoFactorEnabled=false', async () => {
      // Enable 2FA
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

      // Disable 2FA
      await request(app.getHttpServer())
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: testPassword })
        .expect(200);

      // Verify flag is false
      const user = await userRepository.findOne({ where: { id: testUser.id } });
      expect(user!.twoFactorEnabled).toBe(false);
    });

    it('should return 401 if not authenticated', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/2fa/disable')
        .send({ password: testPassword })
        .expect(401);
    });

    it('should validate password is provided', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });

    it('should validate password minimum length', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: 'short' })
        .expect(400);
    });
  });
});
