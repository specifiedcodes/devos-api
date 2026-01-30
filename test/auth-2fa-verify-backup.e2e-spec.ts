import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import { BackupCode } from '../src/database/entities/backup-code.entity';
import * as bcrypt from 'bcrypt';
import { EncryptionService } from '../src/shared/encryption/encryption.service';

describe('2FA Backup Code Verification (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let encryptionService: EncryptionService;
  let testUser: User;
  let validBackupCode: string;
  let tempToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    encryptionService = moduleFixture.get<EncryptionService>(EncryptionService);

    // Create test user with 2FA enabled
    const userRepository = dataSource.getRepository(User);
    const passwordHash = await bcrypt.hash('Test123!@#', 12);

    testUser = await userRepository.save({
      email: 'backup-test@example.com',
      passwordHash,
      twoFactorEnabled: true,
      twoFactorSecret: 'encrypted-secret-placeholder',
    });

    // Create backup codes
    const backupCodeRepository = dataSource.getRepository(BackupCode);
    validBackupCode = 'ABCD123456';
    const codeHash = encryptionService.hash(validBackupCode);

    await backupCodeRepository.save({
      userId: testUser.id,
      codeHash,
      used: false,
    });

    // Create already-used backup code
    const usedCodeHash = encryptionService.hash('USED123456');
    await backupCodeRepository.save({
      userId: testUser.id,
      codeHash: usedCodeHash,
      used: true,
    });
  });

  beforeEach(async () => {
    // Get temp token for each test
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'backup-test@example.com',
        password: 'Test123!@#',
      });

    tempToken = loginResponse.body.temp_token;
  });

  afterAll(async () => {
    // Cleanup
    const userRepository = dataSource.getRepository(User);
    const backupCodeRepository = dataSource.getRepository(BackupCode);
    await backupCodeRepository.delete({ userId: testUser.id });
    await userRepository.delete({ email: 'backup-test@example.com' });
    await app.close();
  });

  describe('POST /api/auth/2fa/verify-backup', () => {
    it('should verify valid backup code and return JWT tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-backup')
        .send({
          temp_token: tempToken,
          backup_code: validBackupCode,
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.tokens).toHaveProperty('access_token');
      expect(response.body.tokens).toHaveProperty('refresh_token');
      expect(response.body).toHaveProperty('backup_codes_remaining');
    });

    it('should mark backup code as used=true after successful verification', async () => {
      // Create fresh temp token
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'backup-test@example.com',
          password: 'Test123!@#',
        });

      const freshTempToken = loginResponse.body.temp_token;
      const freshBackupCode = 'FRESH12345';
      const backupCodeRepository = dataSource.getRepository(BackupCode);

      // Create fresh backup code
      await backupCodeRepository.save({
        userId: testUser.id,
        codeHash: encryptionService.hash(freshBackupCode),
        used: false,
      });

      // Verify with fresh code
      await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-backup')
        .send({
          temp_token: freshTempToken,
          backup_code: freshBackupCode,
        })
        .expect(200);

      // Check that code is now marked as used
      const usedCode = await backupCodeRepository.findOne({
        where: {
          userId: testUser.id,
          codeHash: encryptionService.hash(freshBackupCode),
        },
      });

      expect(usedCode?.used).toBe(true);
    });

    it('should reject already-used backup code with 401 error', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-backup')
        .send({
          temp_token: tempToken,
          backup_code: 'USED123456',
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid backup code');
    });

    it('should reject invalid backup code with 401 error', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-backup')
        .send({
          temp_token: tempToken,
          backup_code: 'INVALID123',
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid backup code');
    });

    it('should be case-insensitive (accept lowercase and uppercase)', async () => {
      // Create new temp token
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'backup-test@example.com',
          password: 'Test123!@#',
        });

      const freshTempToken = loginResponse.body.temp_token;
      const caseTestCode = 'CASE123456';
      const backupCodeRepository = dataSource.getRepository(BackupCode);

      // Create code
      await backupCodeRepository.save({
        userId: testUser.id,
        codeHash: encryptionService.hash(caseTestCode),
        used: false,
      });

      // Try with lowercase
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-backup')
        .send({
          temp_token: freshTempToken,
          backup_code: caseTestCode.toLowerCase(),
        })
        .expect(200);

      expect(response.body).toHaveProperty('tokens');
    });

    it('should update last_login_at timestamp on success', async () => {
      // Create new temp token and code
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'backup-test@example.com',
          password: 'Test123!@#',
        });

      const freshTempToken = loginResponse.body.temp_token;
      const timestampTestCode = 'TIME123456';
      const backupCodeRepository = dataSource.getRepository(BackupCode);

      await backupCodeRepository.save({
        userId: testUser.id,
        codeHash: encryptionService.hash(timestampTestCode),
        used: false,
      });

      const beforeTimestamp = new Date();

      await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-backup')
        .send({
          temp_token: freshTempToken,
          backup_code: timestampTestCode,
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

    it('should include backup_codes_remaining in response', async () => {
      // Create new temp token and code
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'backup-test@example.com',
          password: 'Test123!@#',
        });

      const freshTempToken = loginResponse.body.temp_token;
      const countTestCode = 'COUNT12345';
      const backupCodeRepository = dataSource.getRepository(BackupCode);

      await backupCodeRepository.save({
        userId: testUser.id,
        codeHash: encryptionService.hash(countTestCode),
        used: false,
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-backup')
        .send({
          temp_token: freshTempToken,
          backup_code: countTestCode,
        })
        .expect(200);

      expect(response.body).toHaveProperty('backup_codes_remaining');
      expect(typeof response.body.backup_codes_remaining).toBe('number');
    });

    it('should enforce rate limiting (6th attempt returns 429)', async () => {
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/2fa/verify-backup')
          .send({
            temp_token: tempToken,
            backup_code: 'WRONG12345',
          })
          .expect(401);
      }

      // 6th attempt should be rate limited
      const response = await request(app.getHttpServer())
        .post('/api/auth/2fa/verify-backup')
        .send({
          temp_token: tempToken,
          backup_code: 'WRONG12345',
        })
        .expect(429);

      expect(response.body.message).toContain('ThrottlerException');
    });
  });
});
