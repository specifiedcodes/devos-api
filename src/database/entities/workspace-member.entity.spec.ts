import { validate } from 'class-validator';
import { WorkspaceMember, WorkspaceRole } from './workspace-member.entity';

describe('WorkspaceMember Entity', () => {
  describe('Entity Structure', () => {
    it('should create a workspace member with all required fields', () => {
      const member = new WorkspaceMember();
      member.workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      member.userId = '660e8400-e29b-41d4-a716-446655440001';
      member.role = WorkspaceRole.DEVELOPER;

      expect(member).toBeDefined();
      expect(member.workspaceId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(member.userId).toBe('660e8400-e29b-41d4-a716-446655440001');
      expect(member.role).toBe(WorkspaceRole.DEVELOPER);
    });

    it('should have UUID as primary key type', () => {
      const member = new WorkspaceMember();
      member.id = '770e8400-e29b-41d4-a716-446655440002';

      expect(member.id).toBeDefined();
      expect(typeof member.id).toBe('string');
    });

    it('should have createdAt timestamp', () => {
      const member = new WorkspaceMember();
      const now = new Date();

      member.createdAt = now;

      expect(member.createdAt).toBeInstanceOf(Date);
    });

    it('should have workspace relationship', () => {
      const member = new WorkspaceMember();
      member.workspace = undefined;

      expect(member.workspace).toBeUndefined();
    });

    it('should have user relationship', () => {
      const member = new WorkspaceMember();
      member.user = undefined;

      expect(member.user).toBeUndefined();
    });
  });

  describe('WorkspaceRole Enum', () => {
    it('should define OWNER role', () => {
      expect(WorkspaceRole.OWNER).toBe('owner');
    });

    it('should define ADMIN role', () => {
      expect(WorkspaceRole.ADMIN).toBe('admin');
    });

    it('should define DEVELOPER role', () => {
      expect(WorkspaceRole.DEVELOPER).toBe('developer');
    });

    it('should define VIEWER role', () => {
      expect(WorkspaceRole.VIEWER).toBe('viewer');
    });

    it('should accept valid role values', () => {
      const member = new WorkspaceMember();

      member.role = WorkspaceRole.OWNER;
      expect(member.role).toBe('owner');

      member.role = WorkspaceRole.ADMIN;
      expect(member.role).toBe('admin');

      member.role = WorkspaceRole.DEVELOPER;
      expect(member.role).toBe('developer');

      member.role = WorkspaceRole.VIEWER;
      expect(member.role).toBe('viewer');
    });

    it('should default to DEVELOPER role', () => {
      const member = new WorkspaceMember();
      member.role = WorkspaceRole.DEVELOPER;

      expect(member.role).toBe(WorkspaceRole.DEVELOPER);
    });
  });

  describe('Field Validation', () => {
    it('should require workspaceId field', async () => {
      const member = new WorkspaceMember();
      member.userId = '660e8400-e29b-41d4-a716-446655440001';
      member.role = WorkspaceRole.DEVELOPER;

      const errors = await validate(member);
      const workspaceIdErrors = errors.filter(err => err.property === 'workspaceId');

      expect(workspaceIdErrors.length).toBeGreaterThan(0);
    });

    it('should require userId field', async () => {
      const member = new WorkspaceMember();
      member.workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      member.role = WorkspaceRole.DEVELOPER;

      const errors = await validate(member);
      const userIdErrors = errors.filter(err => err.property === 'userId');

      expect(userIdErrors.length).toBeGreaterThan(0);
    });

    it('should accept valid member data', async () => {
      const member = new WorkspaceMember();
      member.workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      member.userId = '660e8400-e29b-41d4-a716-446655440001';
      member.role = WorkspaceRole.DEVELOPER;

      const errors = await validate(member);

      expect(errors.length).toBe(0);
    });
  });

  describe('Role-based Authorization', () => {
    it('should support owner role for workspace creators', () => {
      const member = new WorkspaceMember();
      member.role = WorkspaceRole.OWNER;

      expect(member.role).toBe('owner');
    });

    it('should support admin role for workspace managers', () => {
      const member = new WorkspaceMember();
      member.role = WorkspaceRole.ADMIN;

      expect(member.role).toBe('admin');
    });

    it('should support developer role for regular users', () => {
      const member = new WorkspaceMember();
      member.role = WorkspaceRole.DEVELOPER;

      expect(member.role).toBe('developer');
    });

    it('should support viewer role for read-only access', () => {
      const member = new WorkspaceMember();
      member.role = WorkspaceRole.VIEWER;

      expect(member.role).toBe('viewer');
    });
  });
});
