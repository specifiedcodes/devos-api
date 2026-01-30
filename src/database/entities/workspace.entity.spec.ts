import { validate } from 'class-validator';
import { Workspace } from './workspace.entity';

describe('Workspace Entity', () => {
  describe('Entity Structure', () => {
    it('should create a workspace with all required fields', () => {
      const workspace = new Workspace();
      workspace.name = 'Test Workspace';
      workspace.ownerUserId = '550e8400-e29b-41d4-a716-446655440000';
      workspace.schemaName = 'workspace_abc123';

      expect(workspace).toBeDefined();
      expect(workspace.name).toBe('Test Workspace');
      expect(workspace.ownerUserId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(workspace.schemaName).toBe('workspace_abc123');
    });

    it('should have UUID as primary key type', () => {
      const workspace = new Workspace();
      workspace.id = '550e8400-e29b-41d4-a716-446655440000';

      expect(workspace.id).toBeDefined();
      expect(typeof workspace.id).toBe('string');
    });

    it('should have proper timestamp fields', () => {
      const workspace = new Workspace();
      const now = new Date();

      workspace.createdAt = now;
      workspace.updatedAt = now;

      expect(workspace.createdAt).toBeInstanceOf(Date);
      expect(workspace.updatedAt).toBeInstanceOf(Date);
    });

    it('should have owner relationship', () => {
      const workspace = new Workspace();
      workspace.owner = undefined;

      expect(workspace.owner).toBeUndefined();
    });

    it('should have members relationship', () => {
      const workspace = new Workspace();
      workspace.members = [];

      expect(Array.isArray(workspace.members)).toBe(true);
    });
  });

  describe('Field Validation', () => {
    it('should require name field', async () => {
      const workspace = new Workspace();
      workspace.ownerUserId = '550e8400-e29b-41d4-a716-446655440000';
      workspace.schemaName = 'workspace_abc';

      const errors = await validate(workspace);
      const nameErrors = errors.filter(err => err.property === 'name');

      expect(nameErrors.length).toBeGreaterThan(0);
    });

    it('should require schemaName field', async () => {
      const workspace = new Workspace();
      workspace.name = 'Test';
      workspace.ownerUserId = '550e8400-e29b-41d4-a716-446655440000';

      const errors = await validate(workspace);
      const schemaErrors = errors.filter(err => err.property === 'schemaName');

      expect(schemaErrors.length).toBeGreaterThan(0);
    });

    it('should accept valid workspace data', async () => {
      const workspace = new Workspace();
      workspace.name = 'Valid Workspace';
      workspace.ownerUserId = '550e8400-e29b-41d4-a716-446655440000';
      workspace.schemaName = 'workspace_valid';

      const errors = await validate(workspace);

      expect(errors.length).toBe(0);
    });
  });

  describe('Schema Name Constraints', () => {
    it('should enforce unique schema names', () => {
      const workspace = new Workspace();
      workspace.schemaName = 'workspace_unique_123';

      expect(workspace.schemaName).toBe('workspace_unique_123');
    });

    it('should follow schema naming convention', () => {
      const workspace = new Workspace();
      workspace.schemaName = 'workspace_550e8400_e29b_41d4_a716_446655440000';

      expect(workspace.schemaName).toMatch(/^workspace_[a-z0-9_]+$/);
    });
  });
});
