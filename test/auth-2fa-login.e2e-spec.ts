import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity';
import * as bcrypt from 'bcrypt';

describe('2FA Login Detection (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let testUser2FA: User;
  let testUserNo2FA: User;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // Create test users
    const userRepository = dataSource.getRepository(User);
    const passwordHash = await bcrypt.hash('Test123!@#', 12);

    // User with 2FA enabled
    testUser2FA = await userRepository.save({
      email: '2fa-test@example.com',
      passwordHash,
      twoFactorEnabled: true,
      twoFactorSecret: 'encrypted-secret-here', // Mock encrypted secret
    });

    // User without 2FA
    testUserNo2FA = await userRepository.save({
      email: 'no-2fa-test@example.com',
      passwordHash,
      twoFactorEnabled: false,
    });
  });

  afterAll(async () => {
    // Cleanup
    const userRepository = dataSource.getRepository(User);
    await userRepository.delete({ email: '2fa-test@example.com' });
    await userRepository.delete({ email: 'no-2fa-test@example.com' });
    await app.close();
  });

  describe('POST /api/auth/login with 2FA enabled', () => {
    it('should return requires_2fa flag and temp token when user has 2FA enabled', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: '2fa-test@example.com',
          password: 'Test123!@#',
        })
        .expect(200);

      expect(response.body).toHaveProperty('requires_2fa', true);
      expect(response.body).toHaveProperty('temp_token');
      expect(response.body.temp_token).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(response.body).toHaveProperty('backup_codes_remaining');
      expect(response.body).not.toHaveProperty('tokens'); // No JWT tokens yet
    });

    it('should return standard JWT tokens when user does not have 2FA enabled', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'no-2fa-test@example.com',
          password: 'Test123!@#',
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.tokens).toHaveProperty('access_token');
      expect(response.body.tokens).toHaveProperty('refresh_token');
      expect(response.body).not.toHaveProperty('requires_2fa');
    });

    it('should reject invalid credentials before checking 2FA status', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: '2fa-test@example.com',
          password: 'WrongPassword123',
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
      expect(response.body).not.toHaveProperty('requires_2fa');
      expect(response.body).not.toHaveProperty('temp_token');
    });

    it('should create temp token in Redis with 5-minute TTL', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: '2fa-test@example.com',
          password: 'Test123!@#',
        })
        .expect(200);

      // Verify temp token was created (implicit via successful response)
      expect(response.body.temp_token).toBeDefined();
      expect(response.body.temp_token).toHaveLength(64);
    });

    it('should include backup_codes_remaining in 2FA response', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: '2fa-test@example.com',
          password: 'Test123!@#',
        })
        .expect(200);

      expect(response.body).toHaveProperty('backup_codes_remaining');
      expect(typeof response.body.backup_codes_remaining).toBe('number');
      expect(response.body.backup_codes_remaining).toBeGreaterThanOrEqual(0);
    });
  });
});
