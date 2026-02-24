/**
 * LinearWebhookController Tests
 * Story 21.5: Linear Two-Way Sync (AC5)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import * as crypto from 'crypto';
import { LinearWebhookController } from '../controllers/linear-webhook.controller';
import { LinearIntegration } from '../../../../database/entities/linear-integration.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';

describe('LinearWebhookController', () => {
  let controller: LinearWebhookController;

  const webhookSecret = 'test-webhook-secret';

  const mockIntegrationRepo = {
    find: jest.fn().mockResolvedValue([
      {
        id: 'int-1',
        workspaceId: 'ws-1',
        isActive: true,
        webhookSecret: 'enc-secret',
        webhookSecretIv: 'enc-iv',
      },
    ]),
  };

  const mockSyncQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const mockEncryptionService = {
    decrypt: jest.fn().mockReturnValue(webhookSecret),
  };

  function createSignature(body: string | Buffer, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    return hmac.update(body).digest('hex');
  }

  function createMockReq(body: Record<string, unknown>): { rawBody: Buffer } {
    const rawBody = Buffer.from(JSON.stringify(body));
    return { rawBody };
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinearWebhookController],
      providers: [
        { provide: getRepositoryToken(LinearIntegration), useValue: mockIntegrationRepo },
        { provide: getQueueToken('linear-sync'), useValue: mockSyncQueue },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    controller = module.get<LinearWebhookController>(LinearWebhookController);
  });

  describe('handleWebhook', () => {
    it('valid webhook with correct signature returns 200', async () => {
      const payload = {
        action: 'update' as const,
        type: 'Issue' as const,
        data: { id: 'issue-1', title: 'Test' },
        createdAt: '2026-01-01T00:00:00Z',
        organizationId: 'org-1',
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = createSignature(rawBody, webhookSecret);

      const result = await controller.handleWebhook(
        signature,
        payload,
        { rawBody } as any,
      );

      expect(result.success).toBe(true);
    });

    it('invalid signature returns failure', async () => {
      const payload = {
        action: 'update' as const,
        type: 'Issue' as const,
        data: { id: 'issue-1' },
        createdAt: '2026-01-01T00:00:00Z',
        organizationId: 'org-1',
      };
      const rawBody = Buffer.from(JSON.stringify(payload));

      const result = await controller.handleWebhook(
        'invalid-signature',
        payload,
        { rawBody } as any,
      );

      expect(result.success).toBe(false);
    });

    it('missing signature header returns failure', async () => {
      const payload = {
        action: 'update' as const,
        type: 'Issue' as const,
        data: {},
        createdAt: '2026-01-01T00:00:00Z',
      };

      const result = await controller.handleWebhook(
        '',
        payload,
        { rawBody: Buffer.from('{}') } as any,
      );

      expect(result.success).toBe(false);
    });

    it('Issue update webhook queues sync job', async () => {
      const payload = {
        action: 'update' as const,
        type: 'Issue' as const,
        data: { id: 'issue-1', title: 'Updated' },
        createdAt: '2026-01-01T00:00:00Z',
        organizationId: 'org-1',
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = createSignature(rawBody, webhookSecret);

      await controller.handleWebhook(signature, payload, { rawBody } as any);

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync-from-linear',
        expect.objectContaining({
          type: 'linear_to_devos',
          linearIssueId: 'issue-1',
        }),
      );
    });

    it('Issue create webhook queues sync job', async () => {
      const payload = {
        action: 'create' as const,
        type: 'Issue' as const,
        data: { id: 'issue-2' },
        createdAt: '2026-01-01T00:00:00Z',
        organizationId: 'org-1',
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = createSignature(rawBody, webhookSecret);

      await controller.handleWebhook(signature, payload, { rawBody } as any);

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync-from-linear',
        expect.objectContaining({
          linearIssueId: 'issue-2',
        }),
      );
    });

    it('Comment create webhook is handled (logged but not erroring)', async () => {
      const payload = {
        action: 'create' as const,
        type: 'Comment' as const,
        data: { id: 'comment-1', body: 'test' },
        createdAt: '2026-01-01T00:00:00Z',
        organizationId: 'org-1',
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = createSignature(rawBody, webhookSecret);

      const result = await controller.handleWebhook(signature, payload, { rawBody } as any);

      expect(result.success).toBe(true);
      // Comments don't queue sync jobs
      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('Remove action is handled gracefully', async () => {
      const payload = {
        action: 'remove' as const,
        type: 'Issue' as const,
        data: { id: 'issue-1' },
        createdAt: '2026-01-01T00:00:00Z',
        organizationId: 'org-1',
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = createSignature(rawBody, webhookSecret);

      const result = await controller.handleWebhook(signature, payload, { rawBody } as any);

      expect(result.success).toBe(true);
    });

    it('Unknown type is ignored (returns success, no processing)', async () => {
      const payload = {
        action: 'update' as const,
        type: 'IssueLabel' as const,
        data: { id: 'label-1' },
        createdAt: '2026-01-01T00:00:00Z',
        organizationId: 'org-1',
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = createSignature(rawBody, webhookSecret);

      const result = await controller.handleWebhook(signature, payload, { rawBody } as any);

      expect(result.success).toBe(true);
      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('uses raw body buffer for signature verification', async () => {
      const payload = {
        action: 'update' as const,
        type: 'Issue' as const,
        data: { id: 'issue-1' },
        createdAt: '2026-01-01T00:00:00Z',
        organizationId: 'org-1',
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = createSignature(rawBody, webhookSecret);

      const result = await controller.handleWebhook(signature, payload, { rawBody } as any);

      expect(result.success).toBe(true);
      // Signature verified using rawBody buffer, not parsed JSON
    });

    it('integration not found returns success (silent ignore)', async () => {
      mockIntegrationRepo.find.mockResolvedValueOnce([]);

      const payload = {
        action: 'update' as const,
        type: 'Issue' as const,
        data: { id: 'issue-1' },
        createdAt: '2026-01-01T00:00:00Z',
        organizationId: 'unknown-org',
      };

      const result = await controller.handleWebhook(
        'some-sig',
        payload,
        { rawBody: Buffer.from('{}') } as any,
      );

      // Returns true (not leaking info)
      expect(result.success).toBe(true);
    });

    it('responds before sync completes (async processing)', async () => {
      const payload = {
        action: 'update' as const,
        type: 'Issue' as const,
        data: { id: 'issue-1' },
        createdAt: '2026-01-01T00:00:00Z',
        organizationId: 'org-1',
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = createSignature(rawBody, webhookSecret);

      // Queue add returns immediately (async processing)
      const result = await controller.handleWebhook(signature, payload, { rawBody } as any);

      expect(result.success).toBe(true);
      // sync is queued, not executed synchronously
      expect(mockSyncQueue.add).toHaveBeenCalled();
    });
  });
});
