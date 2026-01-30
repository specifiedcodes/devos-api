import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

/**
 * E2E Tests for BYOK Key Cross-Workspace Isolation
 *
 * These tests verify that workspace isolation is enforced at the HTTP API level,
 * preventing users from one workspace accessing BYOK keys from another workspace.
 */
describe('BYOK Key API - Cross-Workspace Isolation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // Mock JWT tokens for two different workspaces
  const workspaceAToken = 'mock-jwt-token-workspace-a';
  const workspaceBToken = 'mock-jwt-token-workspace-b';

  const workspaceAId = 'workspace-a-id';
  const workspaceBId = 'workspace-b-id';
  const userAId = 'user-a-id';
  const userBId = 'user-b-id';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/byok/keys - Create Key', () => {
    it('should create a BYOK key for workspace A', async () => {
      const createKeyDto = {
        keyName: 'Workspace A Key',
        provider: 'anthropic',
        apiKey: 'sk-ant-api03-test-key-workspace-a-1234567890abcdefghijklmnop',
      };

      const response = await request(app.getHttpServer())
        .post('/api/byok/keys')
        .set('Authorization', `Bearer ${workspaceAToken}`)
        .send(createKeyDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.keyName).toBe(createKeyDto.keyName);
      expect(response.body).not.toHaveProperty('apiKey'); // Should not return plaintext key
    });

    it('should create a BYOK key for workspace B', async () => {
      const createKeyDto = {
        keyName: 'Workspace B Key',
        provider: 'openai',
        apiKey: 'sk-proj-test-key-workspace-b-1234567890abcdefghijklmnop',
      };

      const response = await request(app.getHttpServer())
        .post('/api/byok/keys')
        .set('Authorization', `Bearer ${workspaceBToken}`)
        .send(createKeyDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.keyName).toBe(createKeyDto.keyName);
    });
  });

  describe('GET /api/byok/keys - List Keys', () => {
    it('should only return keys for workspace A', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/byok/keys')
        .set('Authorization', `Bearer ${workspaceAToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Verify all returned keys belong to workspace A
      for (const key of response.body) {
        expect(key.keyName).toContain('Workspace A');
      }
    });

    it('should only return keys for workspace B', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/byok/keys')
        .set('Authorization', `Bearer ${workspaceBToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Verify all returned keys belong to workspace B
      for (const key of response.body) {
        expect(key.keyName).toContain('Workspace B');
      }
    });
  });

  describe('Cross-Workspace Access Prevention', () => {
    let keyIdWorkspaceA: string;
    let keyIdWorkspaceB: string;

    beforeAll(async () => {
      // Create keys for both workspaces via direct database access
      const keyA = await dataSource.query(
        `INSERT INTO byok_secrets (id, workspace_id, key_name, provider, encrypted_key, encryption_iv, created_by_user_id, is_active)
         VALUES (gen_random_uuid(), $1, 'Test Key A', 'anthropic', 'encrypted', 'iv', $2, true)
         RETURNING id`,
        [workspaceAId, userAId],
      );
      keyIdWorkspaceA = keyA[0].id;

      const keyB = await dataSource.query(
        `INSERT INTO byok_secrets (id, workspace_id, key_name, provider, encrypted_key, encryption_iv, created_by_user_id, is_active)
         VALUES (gen_random_uuid(), $1, 'Test Key B', 'openai', 'encrypted', 'iv', $2, true)
         RETURNING id`,
        [workspaceBId, userBId],
      );
      keyIdWorkspaceB = keyB[0].id;
    });

    it('should BLOCK workspace A from accessing workspace B key', async () => {
      await request(app.getHttpServer())
        .get(`/api/byok/keys/${keyIdWorkspaceB}`)
        .set('Authorization', `Bearer ${workspaceAToken}`)
        .expect(403); // Forbidden
    });

    it('should BLOCK workspace B from accessing workspace A key', async () => {
      await request(app.getHttpServer())
        .get(`/api/byok/keys/${keyIdWorkspaceA}`)
        .set('Authorization', `Bearer ${workspaceBToken}`)
        .expect(403); // Forbidden
    });

    it('should ALLOW workspace A to access its own key', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/byok/keys/${keyIdWorkspaceA}`)
        .set('Authorization', `Bearer ${workspaceAToken}`)
        .expect(200);

      expect(response.body.id).toBe(keyIdWorkspaceA);
    });

    it('should ALLOW workspace B to access its own key', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/byok/keys/${keyIdWorkspaceB}`)
        .set('Authorization', `Bearer ${workspaceBToken}`)
        .expect(200);

      expect(response.body.id).toBe(keyIdWorkspaceB);
    });

    it('should BLOCK workspace A from deleting workspace B key', async () => {
      await request(app.getHttpServer())
        .delete(`/api/byok/keys/${keyIdWorkspaceB}`)
        .set('Authorization', `Bearer ${workspaceAToken}`)
        .expect(403); // Forbidden
    });

    it('should BLOCK workspace B from deleting workspace A key', async () => {
      await request(app.getHttpServer())
        .delete(`/api/byok/keys/${keyIdWorkspaceA}`)
        .set('Authorization', `Bearer ${workspaceBToken}`)
        .expect(403); // Forbidden
    });
  });

  describe('API Key Validation', () => {
    it('should reject API key shorter than 50 characters', async () => {
      const invalidKeyDto = {
        keyName: 'Invalid Short Key',
        provider: 'anthropic',
        apiKey: 'sk-ant-short', // Too short
      };

      await request(app.getHttpServer())
        .post('/api/byok/keys')
        .set('Authorization', `Bearer ${workspaceAToken}`)
        .send(invalidKeyDto)
        .expect(400); // Bad Request
    });

    it('should reject API key with invalid format', async () => {
      const invalidKeyDto = {
        keyName: 'Invalid Format Key',
        provider: 'anthropic',
        apiKey:
          'invalid-prefix-1234567890abcdefghijklmnopqrstuvwxyz1234567890',
      };

      await request(app.getHttpServer())
        .post('/api/byok/keys')
        .set('Authorization', `Bearer ${workspaceAToken}`)
        .send(invalidKeyDto)
        .expect(400); // Bad Request
    });

    it('should accept valid Anthropic API key format', async () => {
      const validKeyDto = {
        keyName: 'Valid Anthropic Key',
        provider: 'anthropic',
        apiKey: 'sk-ant-api03-valid-key-1234567890abcdefghijklmnopqrstuvwxyz',
      };

      await request(app.getHttpServer())
        .post('/api/byok/keys')
        .set('Authorization', `Bearer ${workspaceAToken}`)
        .send(validKeyDto)
        .expect(201);
    });

    it('should accept valid OpenAI API key format (new sk-proj-)', async () => {
      const validKeyDto = {
        keyName: 'Valid OpenAI Key',
        provider: 'openai',
        apiKey: 'sk-proj-valid-key-1234567890abcdefghijklmnopqrstuvwxyz',
      };

      await request(app.getHttpServer())
        .post('/api/byok/keys')
        .set('Authorization', `Bearer ${workspaceAToken}`)
        .send(validKeyDto)
        .expect(201);
    });
  });
});
