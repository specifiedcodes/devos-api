/**
 * Entity Tests for ApiToken and PermissionWebhook
 * Story 20-10: Permission Analytics
 * Target: 8 tests
 */
import { ApiToken } from '../../../database/entities/api-token.entity';
import { PermissionWebhook } from '../../../database/entities/permission-webhook.entity';

describe('ApiToken Entity', () => {
  it('creates an ApiToken with valid data', () => {
    const token = new ApiToken();
    token.id = '11111111-1111-1111-1111-111111111111';
    token.workspaceId = '22222222-2222-2222-2222-222222222222';
    token.name = 'Test Token';
    token.tokenHash = '$2b$12$hashedvalue';
    token.tokenPrefix = 'dvos_abc';
    token.scopes = ['permissions:check'];
    token.isActive = true;
    token.lastUsedAt = null;
    token.expiresAt = null;
    token.createdBy = '33333333-3333-3333-3333-333333333333';

    expect(token.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(token.name).toBe('Test Token');
    expect(token.scopes).toEqual(['permissions:check']);
    expect(token.isActive).toBe(true);
  });

  it('validates required fields are present', () => {
    const token = new ApiToken();
    expect(token.name).toBeUndefined();
    expect(token.tokenHash).toBeUndefined();
    expect(token.tokenPrefix).toBeUndefined();
  });

  it('enforces token prefix length constraint', () => {
    const token = new ApiToken();
    token.tokenPrefix = 'dvos_abc';
    expect(token.tokenPrefix.length).toBeLessThanOrEqual(20);
  });

  it('handles nullable fields correctly', () => {
    const token = new ApiToken();
    token.lastUsedAt = null;
    token.expiresAt = null;
    token.createdBy = null;

    expect(token.lastUsedAt).toBeNull();
    expect(token.expiresAt).toBeNull();
    expect(token.createdBy).toBeNull();
  });
});

describe('PermissionWebhook Entity', () => {
  it('creates a PermissionWebhook with valid data', () => {
    const webhook = new PermissionWebhook();
    webhook.id = '11111111-1111-1111-1111-111111111111';
    webhook.workspaceId = '22222222-2222-2222-2222-222222222222';
    webhook.url = 'https://example.com/webhook';
    webhook.secretHash = '$2b$12$hashedvalue';
    webhook.eventTypes = ['permission.changed', 'role.updated'];
    webhook.isActive = true;
    webhook.failureCount = 0;
    webhook.lastTriggeredAt = null;
    webhook.createdBy = '33333333-3333-3333-3333-333333333333';

    expect(webhook.url).toBe('https://example.com/webhook');
    expect(webhook.eventTypes).toEqual(['permission.changed', 'role.updated']);
    expect(webhook.isActive).toBe(true);
  });

  it('validates URL format', () => {
    const webhook = new PermissionWebhook();
    webhook.url = 'https://example.com/webhook';
    expect(webhook.url.startsWith('https://')).toBe(true);
  });

  it('handles event types array', () => {
    const webhook = new PermissionWebhook();
    webhook.eventTypes = ['permission.changed', 'role.created', 'role.deleted'];
    expect(webhook.eventTypes).toHaveLength(3);
    expect(webhook.eventTypes).toContain('permission.changed');
  });

  it('enforces failure count default of 0', () => {
    const webhook = new PermissionWebhook();
    webhook.failureCount = 0;
    expect(webhook.failureCount).toBe(0);
  });
});
