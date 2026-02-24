/**
 * Permission Decorator Tests
 *
 * Story 20-3: Permission Enforcement Middleware
 * Tests for the @Permission decorator that attaches metadata.
 */
import { PERMISSION_KEY, Permission } from '../permission.decorator';

describe('Permission Decorator', () => {
  it('should export PERMISSION_KEY constant', () => {
    expect(PERMISSION_KEY).toBe('required_permission');
  });

  it('should set metadata with resource and action', () => {
    const decorator = Permission('projects', 'create');
    const target = {};
    const key = 'testMethod';
    const descriptor = { value: jest.fn() };

    // Apply decorator to extract metadata
    decorator(target, key, descriptor);

    // NestJS SetMetadata stores in Reflect.getMetadata
    const metadata = Reflect.getMetadata(PERMISSION_KEY, descriptor.value);
    expect(metadata).toEqual({ resource: 'projects', action: 'create' });
  });

  it('should set metadata for different resource types', () => {
    const testCases = [
      { resource: 'agents', action: 'view' },
      { resource: 'stories', action: 'delete' },
      { resource: 'deployments', action: 'approve' },
      { resource: 'secrets', action: 'view_plaintext' },
      { resource: 'workspace', action: 'manage_settings' },
    ];

    testCases.forEach(({ resource, action }) => {
      const decorator = Permission(resource, action);
      const target = {};
      const key = 'method';
      const descriptor = { value: jest.fn() };

      decorator(target, key, descriptor);

      const metadata = Reflect.getMetadata(PERMISSION_KEY, descriptor.value);
      expect(metadata).toEqual({ resource, action });
    });
  });

  it('should handle empty strings', () => {
    const decorator = Permission('', '');
    const target = {};
    const key = 'method';
    const descriptor = { value: jest.fn() };

    decorator(target, key, descriptor);

    const metadata = Reflect.getMetadata(PERMISSION_KEY, descriptor.value);
    expect(metadata).toEqual({ resource: '', action: '' });
  });

  it('should handle underscored action names', () => {
    const decorator = Permission('cost_management', 'view_own_usage');
    const target = {};
    const key = 'method';
    const descriptor = { value: jest.fn() };

    decorator(target, key, descriptor);

    const metadata = Reflect.getMetadata(PERMISSION_KEY, descriptor.value);
    expect(metadata).toEqual({ resource: 'cost_management', action: 'view_own_usage' });
  });
});
