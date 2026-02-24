/**
 * UpdateMemberRoleDto & BulkUpdateMemberRolesDto Validation Tests
 * Story 20-7: Role Management UI
 * Target: 10 tests
 */

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateMemberRoleDto, SystemRole } from '../dto/update-member-role.dto';
import { BulkUpdateMemberRolesDto } from '../dto/bulk-update-member-roles.dto';

// Use proper v4-format UUIDs for class-validator's @IsUUID() validation
// V4 UUIDs require: version nibble = 4 (13th char), variant bits = 8/9/a/b (17th char)
const VALID_UUID_1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const VALID_UUID_2 = 'b1ffcd00-ad1c-4ef9-bb7e-7ccaae491b22';

describe('UpdateMemberRoleDto', () => {
  it('should accept a valid system role', async () => {
    const dto = plainToInstance(UpdateMemberRoleDto, { role: SystemRole.ADMIN });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept a valid custom role UUID', async () => {
    const dto = plainToInstance(UpdateMemberRoleDto, {
      customRoleId: VALID_UUID_1,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject an invalid system role value', async () => {
    const dto = plainToInstance(UpdateMemberRoleDto, { role: 'superadmin' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const roleError = errors.find((e) => e.property === 'role');
    expect(roleError).toBeDefined();
  });

  it('should reject an invalid UUID for customRoleId', async () => {
    const dto = plainToInstance(UpdateMemberRoleDto, { customRoleId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const customRoleError = errors.find((e) => e.property === 'customRoleId');
    expect(customRoleError).toBeDefined();
  });

  it('should accept owner role', async () => {
    const dto = plainToInstance(UpdateMemberRoleDto, { role: SystemRole.OWNER });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe('BulkUpdateMemberRolesDto', () => {
  it('should accept valid memberIds with system role', async () => {
    const dto = plainToInstance(BulkUpdateMemberRolesDto, {
      memberIds: [VALID_UUID_1],
      role: SystemRole.DEVELOPER,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept valid memberIds with customRoleId', async () => {
    const dto = plainToInstance(BulkUpdateMemberRolesDto, {
      memberIds: [VALID_UUID_1],
      customRoleId: VALID_UUID_2,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject empty memberIds array', async () => {
    const dto = plainToInstance(BulkUpdateMemberRolesDto, {
      memberIds: [],
      role: SystemRole.VIEWER,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const memberIdsError = errors.find((e) => e.property === 'memberIds');
    expect(memberIdsError).toBeDefined();
  });

  it('should reject more than 50 memberIds', async () => {
    // Generate 51 valid v4-format UUIDs
    const ids = Array.from({ length: 51 }, (_, i) =>
      `a0eebc99-9c0b-4ef8-bb6d-${String(i).padStart(12, '0')}`,
    );
    const dto = plainToInstance(BulkUpdateMemberRolesDto, {
      memberIds: ids,
      role: SystemRole.VIEWER,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const memberIdsError = errors.find((e) => e.property === 'memberIds');
    expect(memberIdsError).toBeDefined();
  });

  it('should reject invalid UUIDs in memberIds', async () => {
    const dto = plainToInstance(BulkUpdateMemberRolesDto, {
      memberIds: ['not-a-uuid'],
      role: SystemRole.VIEWER,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
