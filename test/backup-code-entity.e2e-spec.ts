import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BackupCode } from '../src/database/entities/backup-code.entity';
import { User } from '../src/database/entities/user.entity';
import { ConfigModule } from '@nestjs/config';
import * as crypto from 'crypto';

describe('BackupCode Entity (e2e)', () => {
  let app: INestApplication;
  let backupCodeRepository: Repository<BackupCode>;
  let userRepository: Repository<User>;
  let testUser: User;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DATABASE_HOST || 'localhost',
          port: parseInt(process.env.DATABASE_PORT || '5432', 10),
          username: process.env.DATABASE_USER || 'devos',
          password: process.env.DATABASE_PASSWORD || 'devos_password',
          database: process.env.DATABASE_NAME || 'devos_db_test',
          entities: [User, BackupCode],
          synchronize: true, // Only for test database
          dropSchema: true, // Clean slate for each test run
        }),
        TypeOrmModule.forFeature([User, BackupCode]),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    backupCodeRepository = moduleFixture.get('BackupCodeRepository');
    userRepository = moduleFixture.get('UserRepository');

    // Create a test user
    testUser = userRepository.create({
      email: 'test@example.com',
      passwordHash: 'hashed_password',
      twoFactorEnabled: false,
    });
    testUser = await userRepository.save(testUser);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await backupCodeRepository.delete({});
  });

  describe('BackupCode entity structure', () => {
    it('should create a backup code with all required fields', async () => {
      const codeHash = crypto.createHash('sha256').update('TESTCODE123').digest('hex');

      const backupCode = backupCodeRepository.create({
        userId: testUser.id,
        codeHash,
        used: false,
      });

      const savedCode = await backupCodeRepository.save(backupCode);

      expect(savedCode.id).toBeDefined();
      expect(savedCode.userId).toBe(testUser.id);
      expect(savedCode.codeHash).toBe(codeHash);
      expect(savedCode.used).toBe(false);
      expect(savedCode.createdAt).toBeInstanceOf(Date);
    });

    it('should have a foreign key relationship to User', async () => {
      const codeHash = crypto.createHash('sha256').update('TESTCODE456').digest('hex');

      const backupCode = backupCodeRepository.create({
        userId: testUser.id,
        codeHash,
        used: false,
      });

      await backupCodeRepository.save(backupCode);

      const foundCode = await backupCodeRepository.findOne({
        where: { userId: testUser.id },
        relations: ['user'],
      });

      expect(foundCode).toBeDefined();
      expect(foundCode!.user).toBeDefined();
      expect(foundCode!.user.id).toBe(testUser.id);
      expect(foundCode!.user.email).toBe(testUser.email);
    });

    it('should cascade delete backup codes when user is deleted', async () => {
      // Create a temporary user
      const tempUser = userRepository.create({
        email: 'temp@example.com',
        passwordHash: 'hashed_password',
      });
      const savedTempUser = await userRepository.save(tempUser);

      // Create backup codes for temp user
      const code1 = backupCodeRepository.create({
        userId: savedTempUser.id,
        codeHash: crypto.createHash('sha256').update('CODE1').digest('hex'),
      });
      const code2 = backupCodeRepository.create({
        userId: savedTempUser.id,
        codeHash: crypto.createHash('sha256').update('CODE2').digest('hex'),
      });

      await backupCodeRepository.save([code1, code2]);

      // Verify codes exist
      let codes = await backupCodeRepository.find({ where: { userId: savedTempUser.id } });
      expect(codes).toHaveLength(2);

      // Delete user
      await userRepository.delete(savedTempUser.id);

      // Verify backup codes are also deleted
      codes = await backupCodeRepository.find({ where: { userId: savedTempUser.id } });
      expect(codes).toHaveLength(0);
    });

    it('should support marking backup codes as used', async () => {
      const codeHash = crypto.createHash('sha256').update('TESTCODE789').digest('hex');

      const backupCode = backupCodeRepository.create({
        userId: testUser.id,
        codeHash,
        used: false,
      });

      const savedCode = await backupCodeRepository.save(backupCode);
      expect(savedCode.used).toBe(false);

      // Mark as used
      savedCode.used = true;
      const updatedCode = await backupCodeRepository.save(savedCode);

      expect(updatedCode.used).toBe(true);
    });

    it('should allow multiple backup codes for the same user', async () => {
      const codes = [];
      for (let i = 0; i < 10; i++) {
        const codeHash = crypto.createHash('sha256').update(`CODE${i}`).digest('hex');
        codes.push(
          backupCodeRepository.create({
            userId: testUser.id,
            codeHash,
            used: false,
          }),
        );
      }

      await backupCodeRepository.save(codes);

      const foundCodes = await backupCodeRepository.find({
        where: { userId: testUser.id },
      });

      expect(foundCodes).toHaveLength(10);
    });

    it('should query unused codes efficiently using index', async () => {
      // Create mix of used and unused codes
      const usedCode = backupCodeRepository.create({
        userId: testUser.id,
        codeHash: crypto.createHash('sha256').update('USED').digest('hex'),
        used: true,
      });

      const unusedCodes = [];
      for (let i = 0; i < 5; i++) {
        unusedCodes.push(
          backupCodeRepository.create({
            userId: testUser.id,
            codeHash: crypto.createHash('sha256').update(`UNUSED${i}`).digest('hex'),
            used: false,
          }),
        );
      }

      await backupCodeRepository.save([usedCode, ...unusedCodes]);

      // Query for unused codes (this should use the index)
      const foundUnusedCodes = await backupCodeRepository.find({
        where: { userId: testUser.id, used: false },
      });

      expect(foundUnusedCodes).toHaveLength(5);
      foundUnusedCodes.forEach((code) => {
        expect(code.used).toBe(false);
      });
    });

    it('should store code hash as 64-character SHA-256 hex string', async () => {
      const plainCode = 'TESTCODE123';
      const codeHash = crypto.createHash('sha256').update(plainCode).digest('hex');

      expect(codeHash).toHaveLength(64); // SHA-256 hex string is 64 chars

      const backupCode = backupCodeRepository.create({
        userId: testUser.id,
        codeHash,
        used: false,
      });

      const savedCode = await backupCodeRepository.save(backupCode);

      expect(savedCode.codeHash).toHaveLength(64);
      expect(savedCode.codeHash).toBe(codeHash);
    });
  });

  describe('BackupCode entity constraints', () => {
    it('should require userId', async () => {
      const codeHash = crypto.createHash('sha256').update('TEST').digest('hex');

      const backupCode = backupCodeRepository.create({
        codeHash,
        used: false,
      } as any);

      await expect(backupCodeRepository.save(backupCode)).rejects.toThrow();
    });

    it('should require codeHash', async () => {
      const backupCode = backupCodeRepository.create({
        userId: testUser.id,
        used: false,
      } as any);

      await expect(backupCodeRepository.save(backupCode)).rejects.toThrow();
    });

    it('should set used to false by default', async () => {
      const codeHash = crypto.createHash('sha256').update('DEFAULT').digest('hex');

      const backupCode = backupCodeRepository.create({
        userId: testUser.id,
        codeHash,
      });

      const savedCode = await backupCodeRepository.save(backupCode);

      expect(savedCode.used).toBe(false);
    });
  });
});
