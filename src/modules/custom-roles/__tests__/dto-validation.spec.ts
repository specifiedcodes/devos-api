/**
 * DTO Validation Tests
 *
 * Story 20-1: Custom Role Definition
 * Target: 15+ tests covering validation rules for create, update, clone, reorder DTOs
 */
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCustomRoleDto } from '../dto/create-custom-role.dto';
import { UpdateCustomRoleDto } from '../dto/update-custom-role.dto';
import { CloneCustomRoleDto } from '../dto/clone-custom-role.dto';
import { ReorderRolesDto } from '../dto/reorder-roles.dto';
import { BaseRole } from '../../../database/entities/custom-role.entity';

describe('CreateCustomRoleDto', () => {
  it('should pass with valid data', async () => {
    const dto = plainToInstance(CreateCustomRoleDto, {
      name: 'qa-lead',
      displayName: 'QA Lead',
      description: 'Quality assurance team lead',
      color: '#6366f1',
      icon: 'shield',
      baseRole: BaseRole.DEVELOPER,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail with empty name', async () => {
    const dto = plainToInstance(CreateCustomRoleDto, {
      name: '',
      displayName: 'QA Lead',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with uppercase name', async () => {
    const dto = plainToInstance(CreateCustomRoleDto, {
      name: 'QA-Lead',
      displayName: 'QA Lead',
    });

    const errors = await validate(dto);
    const nameErrors = errors.find((e) => e.property === 'name');
    expect(nameErrors).toBeDefined();
  });

  it('should fail with spaces in name', async () => {
    const dto = plainToInstance(CreateCustomRoleDto, {
      name: 'qa lead',
      displayName: 'QA Lead',
    });

    const errors = await validate(dto);
    const nameErrors = errors.find((e) => e.property === 'name');
    expect(nameErrors).toBeDefined();
  });

  it('should fail with name shorter than 2 chars', async () => {
    const dto = plainToInstance(CreateCustomRoleDto, {
      name: 'a',
      displayName: 'QA Lead',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with invalid color hex', async () => {
    const dto = plainToInstance(CreateCustomRoleDto, {
      name: 'qa-lead',
      displayName: 'QA Lead',
      color: 'not-a-color',
    });

    const errors = await validate(dto);
    const colorErrors = errors.find((e) => e.property === 'color');
    expect(colorErrors).toBeDefined();
  });

  it('should pass with valid hex color', async () => {
    const dto = plainToInstance(CreateCustomRoleDto, {
      name: 'qa-lead',
      displayName: 'QA Lead',
      color: '#ff0000',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail with invalid baseRole enum', async () => {
    const dto = plainToInstance(CreateCustomRoleDto, {
      name: 'qa-lead',
      displayName: 'QA Lead',
      baseRole: 'superadmin',
    });

    const errors = await validate(dto);
    const baseRoleErrors = errors.find((e) => e.property === 'baseRole');
    expect(baseRoleErrors).toBeDefined();
  });

  it('should pass without optional fields', async () => {
    const dto = plainToInstance(CreateCustomRoleDto, {
      name: 'qa-lead',
      displayName: 'QA Lead',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should allow hyphens and underscores in name', async () => {
    const dto = plainToInstance(CreateCustomRoleDto, {
      name: 'qa_lead-v2',
      displayName: 'QA Lead v2',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe('UpdateCustomRoleDto', () => {
  it('should pass with partial update (only displayName)', async () => {
    const dto = plainToInstance(UpdateCustomRoleDto, {
      displayName: 'Updated Name',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass with isActive field', async () => {
    const dto = plainToInstance(UpdateCustomRoleDto, {
      isActive: false,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail with invalid isActive type', async () => {
    const dto = plainToInstance(UpdateCustomRoleDto, {
      isActive: 'not-a-boolean',
    });

    const errors = await validate(dto);
    const isActiveErrors = errors.find((e) => e.property === 'isActive');
    expect(isActiveErrors).toBeDefined();
  });
});

describe('CloneCustomRoleDto', () => {
  it('should pass with valid data', async () => {
    const dto = plainToInstance(CloneCustomRoleDto, {
      name: 'senior-qa-lead',
      displayName: 'Senior QA Lead',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail without required name', async () => {
    const dto = plainToInstance(CloneCustomRoleDto, {
      displayName: 'Senior QA Lead',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail without required displayName', async () => {
    const dto = plainToInstance(CloneCustomRoleDto, {
      name: 'senior-qa-lead',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('ReorderRolesDto', () => {
  it('should pass with valid UUID array', async () => {
    const dto = plainToInstance(ReorderRolesDto, {
      roleIds: [
        'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      ],
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail with empty array', async () => {
    const dto = plainToInstance(ReorderRolesDto, {
      roleIds: [],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with non-UUID values', async () => {
    const dto = plainToInstance(ReorderRolesDto, {
      roleIds: ['not-a-uuid'],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when roleIds is not an array', async () => {
    const dto = plainToInstance(ReorderRolesDto, {
      roleIds: 'not-array',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
