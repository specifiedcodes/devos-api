/**
 * Permission Matrix DTO Validation Tests
 *
 * Story 20-2: Permission Matrix
 * Target: 15+ tests covering all new DTOs
 */
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SetPermissionDto } from '../dto/set-permission.dto';
import { SetBulkPermissionsDto, ResourceBulkActionDto, ResetPermissionsDto } from '../dto/set-bulk-permissions.dto';
import { ResourceType } from '../../../database/entities/role-permission.entity';

describe('Permission Matrix DTO Validation', () => {
  describe('SetPermissionDto', () => {
    it('should pass with valid data', async () => {
      const dto = plainToInstance(SetPermissionDto, {
        resourceType: ResourceType.PROJECTS,
        permission: 'create',
        granted: true,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail without resourceType', async () => {
      const dto = plainToInstance(SetPermissionDto, {
        permission: 'create',
        granted: true,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid resourceType', async () => {
      const dto = plainToInstance(SetPermissionDto, {
        resourceType: 'invalid_type',
        permission: 'create',
        granted: true,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail without permission', async () => {
      const dto = plainToInstance(SetPermissionDto, {
        resourceType: ResourceType.PROJECTS,
        granted: true,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail without granted', async () => {
      const dto = plainToInstance(SetPermissionDto, {
        resourceType: ResourceType.PROJECTS,
        permission: 'create',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept all valid resource types', async () => {
      for (const rt of Object.values(ResourceType)) {
        const dto = plainToInstance(SetPermissionDto, {
          resourceType: rt,
          permission: 'test',
          granted: true,
        });
        const errors = await validate(dto);
        const resourceTypeErrors = errors.filter((e) => e.property === 'resourceType');
        expect(resourceTypeErrors).toHaveLength(0);
      }
    });

    it('should fail with permission longer than 50 chars', async () => {
      const dto = plainToInstance(SetPermissionDto, {
        resourceType: ResourceType.PROJECTS,
        permission: 'a'.repeat(51),
        granted: true,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('SetBulkPermissionsDto', () => {
    it('should pass with valid permissions array', async () => {
      const dto = plainToInstance(SetBulkPermissionsDto, {
        permissions: [
          { resourceType: ResourceType.PROJECTS, permission: 'create', granted: true },
          { resourceType: ResourceType.AGENTS, permission: 'view', granted: false },
        ],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail without permissions field', async () => {
      const dto = plainToInstance(SetBulkPermissionsDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should pass with empty permissions array', async () => {
      const dto = plainToInstance(SetBulkPermissionsDto, {
        permissions: [],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('ResourceBulkActionDto', () => {
    it('should pass with valid allow_all action', async () => {
      const dto = plainToInstance(ResourceBulkActionDto, {
        resourceType: ResourceType.PROJECTS,
        action: 'allow_all',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass with valid deny_all action', async () => {
      const dto = plainToInstance(ResourceBulkActionDto, {
        resourceType: ResourceType.AGENTS,
        action: 'deny_all',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail without resourceType', async () => {
      const dto = plainToInstance(ResourceBulkActionDto, {
        action: 'allow_all',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail without action', async () => {
      const dto = plainToInstance(ResourceBulkActionDto, {
        resourceType: ResourceType.PROJECTS,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ResetPermissionsDto', () => {
    it('should pass with valid resource type', async () => {
      const dto = plainToInstance(ResetPermissionsDto, {
        resourceType: ResourceType.PROJECTS,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass without resource type (optional)', async () => {
      const dto = plainToInstance(ResetPermissionsDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid resource type', async () => {
      const dto = plainToInstance(ResetPermissionsDto, {
        resourceType: 'invalid_type',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
