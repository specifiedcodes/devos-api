/**
 * RolePermission Entity Tests
 *
 * Story 20-2: Permission Matrix
 * Target: 10+ tests covering entity validation, ResourceType enum, RESOURCE_PERMISSIONS, BASE_ROLE_DEFAULTS
 */
import { validate } from 'class-validator';
import {
  RolePermission,
  ResourceType,
  RESOURCE_PERMISSIONS,
  BASE_ROLE_DEFAULTS,
} from '../../../database/entities/role-permission.entity';

describe('RolePermission Entity', () => {
  it('should create a valid RolePermission instance', async () => {
    const perm = new RolePermission();
    perm.id = '11111111-1111-1111-1111-111111111111';
    perm.roleId = 'a2222222-2222-4222-8222-222222222222';
    perm.resourceType = ResourceType.PROJECTS;
    perm.permission = 'create';
    perm.granted = true;
    perm.createdAt = new Date();
    perm.updatedAt = new Date();

    const errors = await validate(perm);
    expect(errors).toHaveLength(0);
  });

  it('should fail validation without roleId', async () => {
    const perm = new RolePermission();
    perm.resourceType = ResourceType.PROJECTS;
    perm.permission = 'create';
    perm.granted = true;

    const errors = await validate(perm);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail validation without resourceType', async () => {
    const perm = new RolePermission();
    perm.roleId = 'a2222222-2222-4222-8222-222222222222';
    perm.permission = 'create';
    perm.granted = true;

    const errors = await validate(perm);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail validation without permission', async () => {
    const perm = new RolePermission();
    perm.roleId = 'a2222222-2222-4222-8222-222222222222';
    perm.resourceType = ResourceType.PROJECTS;
    perm.granted = true;

    const errors = await validate(perm);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('ResourceType enum', () => {
  it('should have all 8 resource types', () => {
    expect(Object.values(ResourceType)).toHaveLength(8);
  });

  it('should include all expected resource types', () => {
    expect(ResourceType.PROJECTS).toBe('projects');
    expect(ResourceType.AGENTS).toBe('agents');
    expect(ResourceType.STORIES).toBe('stories');
    expect(ResourceType.DEPLOYMENTS).toBe('deployments');
    expect(ResourceType.SECRETS).toBe('secrets');
    expect(ResourceType.INTEGRATIONS).toBe('integrations');
    expect(ResourceType.WORKSPACE).toBe('workspace');
    expect(ResourceType.COST_MANAGEMENT).toBe('cost_management');
  });
});

describe('RESOURCE_PERMISSIONS', () => {
  it('should have entries for all resource types', () => {
    for (const rt of Object.values(ResourceType)) {
      expect(RESOURCE_PERMISSIONS[rt]).toBeDefined();
      expect(RESOURCE_PERMISSIONS[rt].length).toBeGreaterThan(0);
    }
  });

  it('should have correct permissions for PROJECTS', () => {
    expect(RESOURCE_PERMISSIONS[ResourceType.PROJECTS]).toContain('create');
    expect(RESOURCE_PERMISSIONS[ResourceType.PROJECTS]).toContain('read');
    expect(RESOURCE_PERMISSIONS[ResourceType.PROJECTS]).toContain('update');
    expect(RESOURCE_PERMISSIONS[ResourceType.PROJECTS]).toContain('delete');
    expect(RESOURCE_PERMISSIONS[ResourceType.PROJECTS]).toContain('manage_settings');
  });

  it('should have correct permissions for SECRETS', () => {
    expect(RESOURCE_PERMISSIONS[ResourceType.SECRETS]).toContain('view_masked');
    expect(RESOURCE_PERMISSIONS[ResourceType.SECRETS]).toContain('view_plaintext');
  });

  it('should have correct permissions for WORKSPACE', () => {
    expect(RESOURCE_PERMISSIONS[ResourceType.WORKSPACE]).toContain('view_members');
    expect(RESOURCE_PERMISSIONS[ResourceType.WORKSPACE]).toContain('manage_billing');
    expect(RESOURCE_PERMISSIONS[ResourceType.WORKSPACE]).toContain('manage_roles');
  });
});

describe('BASE_ROLE_DEFAULTS', () => {
  it('should have entries for owner, admin, developer, viewer, none', () => {
    expect(BASE_ROLE_DEFAULTS.owner).toBeDefined();
    expect(BASE_ROLE_DEFAULTS.admin).toBeDefined();
    expect(BASE_ROLE_DEFAULTS.developer).toBeDefined();
    expect(BASE_ROLE_DEFAULTS.viewer).toBeDefined();
    expect(BASE_ROLE_DEFAULTS.none).toBeDefined();
  });

  it('should give owner full access to all resources', () => {
    for (const [resource, perms] of Object.entries(BASE_ROLE_DEFAULTS.owner)) {
      for (const [perm, granted] of Object.entries(perms)) {
        expect(granted).toBe(true);
      }
    }
  });

  it('should deny none all permissions', () => {
    for (const [resource, perms] of Object.entries(BASE_ROLE_DEFAULTS.none)) {
      for (const [perm, granted] of Object.entries(perms)) {
        expect(granted).toBe(false);
      }
    }
  });

  it('should not give admin view_plaintext for secrets', () => {
    expect(BASE_ROLE_DEFAULTS.admin.secrets.view_plaintext).toBe(false);
  });

  it('should not give admin manage_billing for workspace', () => {
    expect(BASE_ROLE_DEFAULTS.admin.workspace.manage_billing).toBe(false);
  });

  it('should allow developer to create projects but not delete', () => {
    expect(BASE_ROLE_DEFAULTS.developer.projects.create).toBe(true);
    expect(BASE_ROLE_DEFAULTS.developer.projects.delete).toBe(false);
  });

  it('should cover all resource types and permissions', () => {
    for (const role of Object.keys(BASE_ROLE_DEFAULTS)) {
      for (const rt of Object.values(ResourceType)) {
        expect(BASE_ROLE_DEFAULTS[role][rt]).toBeDefined();
        const permissions = RESOURCE_PERMISSIONS[rt];
        for (const perm of permissions) {
          expect(BASE_ROLE_DEFAULTS[role][rt][perm]).toBeDefined();
        }
      }
    }
  });
});
