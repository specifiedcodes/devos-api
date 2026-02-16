import { SCIM_CONSTANTS } from './scim.constants';

describe('SCIM Constants', () => {
  describe('Schema URIs', () => {
    it('should have valid RFC 7643 User schema URI', () => {
      expect(SCIM_CONSTANTS.SCHEMAS.USER).toBe('urn:ietf:params:scim:schemas:core:2.0:User');
    });

    it('should have valid RFC 7643 Group schema URI', () => {
      expect(SCIM_CONSTANTS.SCHEMAS.GROUP).toBe('urn:ietf:params:scim:schemas:core:2.0:Group');
    });

    it('should have valid ListResponse schema URI', () => {
      expect(SCIM_CONSTANTS.SCHEMAS.LIST_RESPONSE).toBe('urn:ietf:params:scim:api:messages:2.0:ListResponse');
    });

    it('should have valid PatchOp schema URI', () => {
      expect(SCIM_CONSTANTS.SCHEMAS.PATCH_OP).toBe('urn:ietf:params:scim:api:messages:2.0:PatchOp');
    });

    it('should have valid Error schema URI', () => {
      expect(SCIM_CONSTANTS.SCHEMAS.ERROR).toBe('urn:ietf:params:scim:api:messages:2.0:Error');
    });

    it('all schema URIs should start with urn:ietf:params:scim:', () => {
      for (const uri of Object.values(SCIM_CONSTANTS.SCHEMAS)) {
        expect(uri).toMatch(/^urn:ietf:params:scim:/);
      }
    });
  });

  describe('Token configuration', () => {
    it('should have token prefix of devos_sc (8 chars)', () => {
      expect(SCIM_CONSTANTS.TOKEN_PREFIX).toBe('devos_sc');
      expect(SCIM_CONSTANTS.TOKEN_PREFIX.length).toBe(8);
    });

    it('should use 32 bytes for token generation', () => {
      expect(SCIM_CONSTANTS.TOKEN_BYTES).toBe(32);
    });

    it('should use sha256 for token hashing', () => {
      expect(SCIM_CONSTANTS.TOKEN_HASH_ALGORITHM).toBe('sha256');
    });
  });

  describe('Rate limiting', () => {
    it('should have rate limit of 100 requests per 60 seconds', () => {
      expect(SCIM_CONSTANTS.RATE_LIMIT_MAX_REQUESTS).toBe(100);
      expect(SCIM_CONSTANTS.RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    });
  });

  describe('Pagination', () => {
    it('should have default page size of 100', () => {
      expect(SCIM_CONSTANTS.DEFAULT_PAGE_SIZE).toBe(100);
    });

    it('should have max page size of 500', () => {
      expect(SCIM_CONSTANTS.MAX_PAGE_SIZE).toBe(500);
    });

    it('should have default start index of 1 (1-based)', () => {
      expect(SCIM_CONSTANTS.DEFAULT_START_INDEX).toBe(1);
    });
  });

  describe('Filter operators', () => {
    it('should include all SCIM spec filter operators', () => {
      expect(SCIM_CONSTANTS.FILTER_OPERATORS).toContain('eq');
      expect(SCIM_CONSTANTS.FILTER_OPERATORS).toContain('ne');
      expect(SCIM_CONSTANTS.FILTER_OPERATORS).toContain('co');
      expect(SCIM_CONSTANTS.FILTER_OPERATORS).toContain('sw');
      expect(SCIM_CONSTANTS.FILTER_OPERATORS).toContain('ew');
    });
  });

  describe('PATCH operations', () => {
    it('should include add, remove, replace', () => {
      expect(SCIM_CONSTANTS.PATCH_OPERATIONS).toContain('add');
      expect(SCIM_CONSTANTS.PATCH_OPERATIONS).toContain('remove');
      expect(SCIM_CONSTANTS.PATCH_OPERATIONS).toContain('replace');
    });
  });

  describe('Valid roles', () => {
    it('should contain admin, developer, viewer', () => {
      expect(SCIM_CONSTANTS.VALID_ROLES).toContain('admin');
      expect(SCIM_CONSTANTS.VALID_ROLES).toContain('developer');
      expect(SCIM_CONSTANTS.VALID_ROLES).toContain('viewer');
    });

    it('should NOT contain owner', () => {
      expect(SCIM_CONSTANTS.VALID_ROLES).not.toContain('owner');
    });
  });

  describe('Content type', () => {
    it('should be application/scim+json', () => {
      expect(SCIM_CONSTANTS.CONTENT_TYPE).toBe('application/scim+json');
    });
  });

  describe('Cache configuration', () => {
    it('should have 5-minute cache TTL', () => {
      expect(SCIM_CONSTANTS.CACHE_TTL_SECONDS).toBe(300);
    });
  });
});
