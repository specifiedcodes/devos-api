import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BYOKModule } from '../byok.module';
import { BYOKKey, KeyProvider } from '../../../database/entities/byok-key.entity';
import { EncryptionModule } from '../../../shared/encryption/encryption.module';

describe('BYOK Workspace Isolation (Integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.TEST_DB_HOST || 'localhost',
          port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
          username: process.env.TEST_DB_USER || 'devos_test',
          password: process.env.TEST_DB_PASSWORD || 'test_password',
          database: process.env.TEST_DB_NAME || 'devos_test_db',
          entities: [BYOKKey],
          synchronize: true, // OK for tests
        }),
        EncryptionModule,
        BYOKModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should prevent cross-workspace data access', async () => {
    // Setup: Create keys for two different workspaces
    const workspace1Id = 'ws-test-001';
    const workspace2Id = 'ws-test-002';
    const user1Id = 'user-001';
    const user2Id = 'user-002';

    const response1 = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace1Id}/byok-keys`)
      .send({
        keyName: 'Workspace 1 Key',
        provider: KeyProvider.ANTHROPIC,
        apiKey: 'sk-ant-api03-test-key-workspace1-12345',
      })
      .set('x-user-id', user1Id)
      .set('x-workspace-id', workspace1Id);

    expect(response1.status).toBe(201);
    const key1Id = response1.body.id;

    const response2 = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace2Id}/byok-keys`)
      .send({
        keyName: 'Workspace 2 Key',
        provider: KeyProvider.ANTHROPIC,
        apiKey: 'sk-ant-api03-test-key-workspace2-67890',
      })
      .set('x-user-id', user2Id)
      .set('x-workspace-id', workspace2Id);

    expect(response2.status).toBe(201);

    // Test: Workspace 2 user tries to access Workspace 1's key
    const attackResponse = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspace1Id}/byok-keys/${key1Id}`)
      .set('x-user-id', user2Id)
      .set('x-workspace-id', workspace2Id);

    // Should be rejected with 403 Forbidden
    expect(attackResponse.status).toBe(403);
  });

  it('should isolate API keys by workspace', async () => {
    const workspace1Id = 'ws-test-003';
    const workspace2Id = 'ws-test-004';
    const userId = 'user-003';

    // Create keys in both workspaces
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace1Id}/byok-keys`)
      .send({
        keyName: 'WS1 Key',
        provider: KeyProvider.ANTHROPIC,
        apiKey: 'sk-ant-api03-ws1-test-12345',
      })
      .set('x-user-id', userId)
      .set('x-workspace-id', workspace1Id);

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspace2Id}/byok-keys`)
      .send({
        keyName: 'WS2 Key',
        provider: KeyProvider.OPENAI,
        apiKey: 'sk-test-openai-ws2-67890',
      })
      .set('x-user-id', userId)
      .set('x-workspace-id', workspace2Id);

    // List keys for workspace 1
    const ws1Keys = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspace1Id}/byok-keys`)
      .set('x-user-id', userId)
      .set('x-workspace-id', workspace1Id);

    expect(ws1Keys.status).toBe(200);
    expect(ws1Keys.body.length).toBe(1);
    expect(ws1Keys.body[0].keyName).toBe('WS1 Key');

    // List keys for workspace 2
    const ws2Keys = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspace2Id}/byok-keys`)
      .set('x-user-id', userId)
      .set('x-workspace-id', workspace2Id);

    expect(ws2Keys.status).toBe(200);
    expect(ws2Keys.body.length).toBe(1);
    expect(ws2Keys.body[0].keyName).toBe('WS2 Key');
  });
});
