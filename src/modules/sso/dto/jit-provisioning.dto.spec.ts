import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateJitProvisioningConfigDto, JitProvisioningConfigResponseDto } from './jit-provisioning.dto';

describe('UpdateJitProvisioningConfigDto', () => {
  it('should accept valid defaultRole values (admin, developer, viewer)', async () => {
    for (const role of ['admin', 'developer', 'viewer']) {
      const dto = plainToInstance(UpdateJitProvisioningConfigDto, { defaultRole: role });
      const errors = await validate(dto);
      const roleErrors = errors.filter((e) => e.property === 'defaultRole');
      expect(roleErrors).toHaveLength(0);
    }
  });

  it('should reject invalid defaultRole values (owner, super_admin)', async () => {
    for (const role of ['owner', 'super_admin']) {
      const dto = plainToInstance(UpdateJitProvisioningConfigDto, { defaultRole: role });
      const errors = await validate(dto);
      const roleErrors = errors.filter((e) => e.property === 'defaultRole');
      expect(roleErrors.length).toBeGreaterThan(0);
    }
  });

  it('should accept valid conflictResolution values', async () => {
    for (const cr of ['link_existing', 'reject', 'prompt_admin']) {
      const dto = plainToInstance(UpdateJitProvisioningConfigDto, { conflictResolution: cr });
      const errors = await validate(dto);
      const crErrors = errors.filter((e) => e.property === 'conflictResolution');
      expect(crErrors).toHaveLength(0);
    }
  });

  it('should reject invalid conflictResolution values', async () => {
    const dto = plainToInstance(UpdateJitProvisioningConfigDto, { conflictResolution: 'auto_merge' });
    const errors = await validate(dto);
    const crErrors = errors.filter((e) => e.property === 'conflictResolution');
    expect(crErrors.length).toBeGreaterThan(0);
  });

  it('should allow all fields to be optional (partial update)', async () => {
    const dto = plainToInstance(UpdateJitProvisioningConfigDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should validate jitEnabled is boolean', async () => {
    const dto = plainToInstance(UpdateJitProvisioningConfigDto, { jitEnabled: 'not_a_boolean' });
    const errors = await validate(dto);
    const boolErrors = errors.filter((e) => e.property === 'jitEnabled');
    expect(boolErrors.length).toBeGreaterThan(0);
  });

  it('should validate requireEmailDomains is array of strings or null', async () => {
    // Valid: array of strings
    const dto1 = plainToInstance(UpdateJitProvisioningConfigDto, { requireEmailDomains: ['acme.com'] });
    const errors1 = await validate(dto1);
    expect(errors1.filter((e) => e.property === 'requireEmailDomains')).toHaveLength(0);

    // Valid: null
    const dto2 = plainToInstance(UpdateJitProvisioningConfigDto, { requireEmailDomains: null });
    const errors2 = await validate(dto2);
    expect(errors2.filter((e) => e.property === 'requireEmailDomains')).toHaveLength(0);
  });

  it('should validate attributeMapping is object', async () => {
    const dto = plainToInstance(UpdateJitProvisioningConfigDto, {
      attributeMapping: { email: 'email', firstName: 'given_name' },
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'attributeMapping')).toHaveLength(0);
  });

  it('should validate groupRoleMapping is object', async () => {
    const dto = plainToInstance(UpdateJitProvisioningConfigDto, {
      groupRoleMapping: { 'Admins': 'admin' },
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'groupRoleMapping')).toHaveLength(0);
  });
});

describe('JitProvisioningConfigResponseDto', () => {
  it('should have all expected fields', () => {
    const dto = new JitProvisioningConfigResponseDto();
    dto.id = 'test-id';
    dto.workspaceId = 'ws-id';
    dto.jitEnabled = true;
    dto.defaultRole = 'developer';
    dto.autoUpdateProfile = true;
    dto.autoUpdateRoles = false;
    dto.welcomeEmail = true;
    dto.requireEmailDomains = null;
    dto.attributeMapping = { email: 'email' };
    dto.groupRoleMapping = {};
    dto.conflictResolution = 'link_existing';
    dto.createdAt = '2026-01-01T00:00:00Z';
    dto.updatedAt = '2026-01-01T00:00:00Z';

    expect(dto.id).toBe('test-id');
    expect(dto.workspaceId).toBe('ws-id');
    expect(dto.jitEnabled).toBe(true);
    expect(dto.defaultRole).toBe('developer');
    expect(dto.autoUpdateProfile).toBe(true);
    expect(dto.autoUpdateRoles).toBe(false);
    expect(dto.welcomeEmail).toBe(true);
    expect(dto.requireEmailDomains).toBeNull();
    expect(dto.attributeMapping).toEqual({ email: 'email' });
    expect(dto.groupRoleMapping).toEqual({});
    expect(dto.conflictResolution).toBe('link_existing');
    expect(dto.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(dto.updatedAt).toBe('2026-01-01T00:00:00Z');
  });
});
