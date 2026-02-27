/**
 * WebhookModule Tests
 * Story 21-8: Webhook Management (AC9)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { OutgoingWebhookService } from '../services/outgoing-webhook.service';
import { OutgoingWebhookController } from '../controllers/outgoing-webhook.controller';
import { WebhookDeliveryProcessor } from '../processors/webhook-delivery.processor';
import { OutgoingWebhook } from '../../../../database/entities/outgoing-webhook.entity';
import { WebhookDeliveryLog } from '../../../../database/entities/webhook-delivery-log.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../../shared/guards/workspace-access.guard';
import { RoleGuard } from '../../../../common/guards/role.guard';

describe('WebhookModule', () => {
  let module: TestingModule;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    }),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        OutgoingWebhookService,
        OutgoingWebhookController,
        WebhookDeliveryProcessor,
        { provide: getRepositoryToken(OutgoingWebhook), useValue: mockRepo },
        { provide: getRepositoryToken(WebhookDeliveryLog), useValue: mockRepo },
        { provide: getQueueToken('webhook-delivery'), useValue: mockQueue },
        { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
        { provide: RedisService, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: () => true })
      .compile();
  });

  it('should create OutgoingWebhookService', () => {
    const service = module.get<OutgoingWebhookService>(OutgoingWebhookService);
    expect(service).toBeDefined();
  });

  it('should create OutgoingWebhookController', () => {
    const controller = module.get<OutgoingWebhookController>(OutgoingWebhookController);
    expect(controller).toBeDefined();
  });

  it('should create WebhookDeliveryProcessor', () => {
    const processor = module.get<WebhookDeliveryProcessor>(WebhookDeliveryProcessor);
    expect(processor).toBeDefined();
  });
});
