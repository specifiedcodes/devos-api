import {
  UpdateScimConfigDto,
  CreateScimTokenDto,
  ScimPatchRequest,
  ScimCreateUserRequest,
  ScimUserResource,
  ScimGroupResource,
  ScimListResponse,
  ScimErrorResponse,
} from './scim.dto';

describe('SCIM DTOs', () => {
  describe('UpdateScimConfigDto', () => {
    it('should allow all fields to be optional', () => {
      const dto = new UpdateScimConfigDto();
      expect(dto.enabled).toBeUndefined();
      expect(dto.defaultRole).toBeUndefined();
      expect(dto.syncGroups).toBeUndefined();
      expect(dto.autoDeactivate).toBeUndefined();
      expect(dto.autoReactivate).toBeUndefined();
    });

    it('should accept valid values', () => {
      const dto = new UpdateScimConfigDto();
      dto.enabled = true;
      dto.defaultRole = 'developer';
      dto.syncGroups = true;
      dto.autoDeactivate = true;
      dto.autoReactivate = false;

      expect(dto.enabled).toBe(true);
      expect(dto.defaultRole).toBe('developer');
    });
  });

  describe('CreateScimTokenDto', () => {
    it('should allow all fields to be optional', () => {
      const dto = new CreateScimTokenDto();
      expect(dto.label).toBeUndefined();
      expect(dto.expiresAt).toBeUndefined();
    });

    it('should accept label as string', () => {
      const dto = new CreateScimTokenDto();
      dto.label = 'My SCIM Token';
      expect(dto.label).toBe('My SCIM Token');
    });

    it('should accept expiresAt as string or null', () => {
      const dto = new CreateScimTokenDto();
      dto.expiresAt = '2025-12-31T00:00:00Z';
      expect(dto.expiresAt).toBe('2025-12-31T00:00:00Z');

      dto.expiresAt = null;
      expect(dto.expiresAt).toBeNull();
    });
  });

  describe('ScimPatchRequest', () => {
    it('should accept Operations array with valid op values', () => {
      const dto = new ScimPatchRequest();
      dto.schemas = ['urn:ietf:params:scim:api:messages:2.0:PatchOp'];
      dto.Operations = [
        { op: 'add', path: 'displayName', value: 'John' },
        { op: 'remove', path: 'title' },
        { op: 'replace', path: 'active', value: false },
      ];

      expect(dto.Operations).toHaveLength(3);
      expect(dto.Operations[0].op).toBe('add');
      expect(dto.Operations[1].op).toBe('remove');
      expect(dto.Operations[2].op).toBe('replace');
    });
  });

  describe('ScimCreateUserRequest', () => {
    it('should have userName as required field', () => {
      const dto = new ScimCreateUserRequest();
      dto.userName = 'john@test.com';
      dto.schemas = ['urn:ietf:params:scim:schemas:core:2.0:User'];
      dto.active = true;

      expect(dto.userName).toBe('john@test.com');
    });

    it('should have optional name, displayName, emails', () => {
      const dto = new ScimCreateUserRequest();
      dto.schemas = [];
      dto.userName = 'john@test.com';
      dto.active = true;

      expect(dto.name).toBeUndefined();
      expect(dto.displayName).toBeUndefined();
      expect(dto.emails).toBeUndefined();
    });
  });

  describe('ScimUserResource', () => {
    it('should have all required SCIM user fields', () => {
      const resource = new ScimUserResource();
      resource.schemas = ['urn:ietf:params:scim:schemas:core:2.0:User'];
      resource.id = 'user-1';
      resource.userName = 'john@test.com';
      resource.active = true;
      resource.emails = [{ value: 'john@test.com', primary: true }];
      resource.meta = { resourceType: 'User', created: '2024-01-01', lastModified: '2024-01-01', location: '/scim/v2/Users/user-1' };

      expect(resource.schemas[0]).toContain('User');
      expect(resource.meta.resourceType).toBe('User');
    });
  });

  describe('ScimGroupResource', () => {
    it('should have all required SCIM group fields', () => {
      const resource = new ScimGroupResource();
      resource.schemas = ['urn:ietf:params:scim:schemas:core:2.0:Group'];
      resource.id = 'group-1';
      resource.displayName = 'Engineering';
      resource.members = [{ value: 'user-1', display: 'john@test.com' }];
      resource.meta = { resourceType: 'Group', created: '2024-01-01', lastModified: '2024-01-01', location: '/scim/v2/Groups/group-1' };

      expect(resource.schemas[0]).toContain('Group');
      expect(resource.meta.resourceType).toBe('Group');
    });
  });

  describe('ScimListResponse', () => {
    it('should have SCIM ListResponse fields', () => {
      const response = new ScimListResponse();
      response.schemas = ['urn:ietf:params:scim:api:messages:2.0:ListResponse'];
      response.totalResults = 10;
      response.startIndex = 1;
      response.itemsPerPage = 10;
      response.Resources = [];

      expect(response.schemas[0]).toContain('ListResponse');
      expect(response.totalResults).toBe(10);
      expect(response.startIndex).toBe(1);
    });
  });

  describe('ScimErrorResponse', () => {
    it('should have SCIM Error fields', () => {
      const error = new ScimErrorResponse();
      error.schemas = ['urn:ietf:params:scim:api:messages:2.0:Error'];
      error.status = '404';
      error.detail = 'Resource not found';
      error.scimType = 'noTarget';

      expect(error.schemas[0]).toContain('Error');
      expect(error.status).toBe('404');
    });
  });
});
