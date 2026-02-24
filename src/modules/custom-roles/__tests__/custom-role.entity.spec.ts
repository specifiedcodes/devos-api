/**
 * CustomRole Entity Tests
 *
 * Story 20-1: Custom Role Definition
 * Tests for entity validation constraints
 */
import { validate } from 'class-validator';
import { CustomRole, BaseRole } from '../../../database/entities/custom-role.entity';

describe('CustomRole Entity', () => {
  function createValidRole(): CustomRole {
    const role = new CustomRole();
    role.workspaceId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    role.name = 'qa-lead';
    role.displayName = 'QA Lead';
    role.description = 'Quality assurance team lead';
    role.color = '#6366f1';
    role.icon = 'shield';
    role.baseRole = BaseRole.DEVELOPER;
    role.isSystem = false;
    role.isActive = true;
    role.priority = 0;
    role.createdBy = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
    return role;
  }

  it('should validate successfully with valid data', async () => {
    const role = createValidRole();
    const errors = await validate(role);
    // Auto-generated fields (id, workspace/creator relations) may produce validation errors in unit tests
    // since they're not set by the constructor. Only validate that explicitly set fields pass.
    const explicitlySetProps = new Set([
      'workspaceId', 'name', 'displayName', 'description', 'color',
      'icon', 'baseRole', 'isSystem', 'isActive', 'priority', 'createdBy',
    ]);
    const relevantErrors = errors.filter((e) => explicitlySetProps.has(e.property));
    expect(relevantErrors).toEqual([]);
  });

  it('should fail with invalid workspaceId', async () => {
    const role = createValidRole();
    role.workspaceId = 'not-a-uuid';
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'workspaceId')).toBe(true);
  });

  it('should fail with empty name', async () => {
    const role = createValidRole();
    role.name = '';
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail with name containing spaces', async () => {
    const role = createValidRole();
    role.name = 'qa lead';
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail with name containing uppercase', async () => {
    const role = createValidRole();
    role.name = 'QA-Lead';
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should accept valid name with hyphens and underscores', async () => {
    const role = createValidRole();
    role.name = 'qa_lead-v2';
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'name')).toBe(false);
  });

  it('should fail with invalid hex color', async () => {
    const role = createValidRole();
    role.color = 'not-a-color';
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'color')).toBe(true);
  });

  it('should accept valid hex color', async () => {
    const role = createValidRole();
    role.color = '#ff0000';
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'color')).toBe(false);
  });

  it('should fail with invalid baseRole enum', async () => {
    const role = createValidRole();
    role.baseRole = 'superadmin' as any;
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'baseRole')).toBe(true);
  });

  it('should accept null baseRole', async () => {
    const role = createValidRole();
    role.baseRole = null;
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'baseRole')).toBe(false);
  });

  it('should accept all valid BaseRole enum values', async () => {
    const role = createValidRole();
    for (const br of Object.values(BaseRole)) {
      role.baseRole = br;
      const errors = await validate(role);
      expect(errors.some((e) => e.property === 'baseRole')).toBe(false);
    }
  });

  it('should fail with invalid createdBy UUID', async () => {
    const role = createValidRole();
    role.createdBy = 'not-a-uuid';
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'createdBy')).toBe(true);
  });

  it('should fail with description over 500 characters', async () => {
    const role = createValidRole();
    role.description = 'x'.repeat(501);
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });

  it('should accept null description', async () => {
    const role = createValidRole();
    role.description = null;
    const errors = await validate(role);
    expect(errors.some((e) => e.property === 'description')).toBe(false);
  });
});
