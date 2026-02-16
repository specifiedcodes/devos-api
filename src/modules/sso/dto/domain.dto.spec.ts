import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDomainDto, LinkDomainProviderDto, DomainResponseDto, DomainLookupResponseDto } from './domain.dto';

describe('RegisterDomainDto', () => {
  const createDto = (domain: string): RegisterDomainDto => {
    return plainToInstance(RegisterDomainDto, { domain });
  };

  it('should accept valid domain acme.com', async () => {
    const dto = createDto('acme.com');
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept subdomain sub.acme.com', async () => {
    const dto = createDto('sub.acme.com');
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept my-company.co.uk', async () => {
    const dto = createDto('my-company.co.uk');
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept deep subdomain deep.sub.acme.com', async () => {
    const dto = createDto('deep.sub.acme.com');
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject empty domain', async () => {
    const dto = createDto('');
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject too-short domain', async () => {
    const dto = createDto('ab');
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject uppercase domain', async () => {
    const dto = createDto('ACME.COM');
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject domain with spaces', async () => {
    const dto = createDto('acme .com');
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject domain with http:// prefix', async () => {
    const dto = createDto('http://acme.com');
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject domain without TLD', async () => {
    const dto = createDto('acme');
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject domain with special characters', async () => {
    const dto = createDto('acme@.com');
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should enforce max length constraint', async () => {
    const longDomain = 'a'.repeat(250) + '.com';
    const dto = createDto(longDomain);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('LinkDomainProviderDto', () => {
  const createDto = (data: Record<string, unknown>): LinkDomainProviderDto => {
    return plainToInstance(LinkDomainProviderDto, data);
  };

  it('should accept valid UUID for samlConfigId', async () => {
    const dto = createDto({ samlConfigId: '550e8400-e29b-41d4-a716-446655440000' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept valid UUID for oidcConfigId', async () => {
    const dto = createDto({ oidcConfigId: '550e8400-e29b-41d4-a716-446655440000' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject non-UUID value for samlConfigId', async () => {
    const dto = createDto({ samlConfigId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-UUID value for oidcConfigId', async () => {
    const dto = createDto({ oidcConfigId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should allow both fields to be optional', async () => {
    const dto = createDto({});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe('DomainResponseDto', () => {
  it('should have all expected fields', () => {
    const dto = new DomainResponseDto();
    const expectedFields = [
      'id', 'workspaceId', 'domain', 'verificationMethod', 'verificationToken',
      'status', 'verifiedAt', 'expiresAt', 'lastCheckAt', 'lastCheckError',
      'checkCount', 'samlConfigId', 'oidcConfigId', 'createdBy',
      'createdAt', 'updatedAt', 'dnsInstruction',
    ];
    // Check fields exist on prototype (class-based)
    for (const field of expectedFields) {
      expect(field in dto).toBe(true);
    }
  });
});

describe('DomainLookupResponseDto', () => {
  it('should have correct structure for found case', () => {
    const dto = new DomainLookupResponseDto();
    dto.found = true;
    dto.domain = 'acme.com';
    dto.providerType = 'saml';
    dto.providerId = 'config-123';
    dto.workspaceId = 'ws-123';

    expect(dto.found).toBe(true);
    expect(dto.providerType).toBe('saml');
  });

  it('should have correct structure for not-found case', () => {
    const dto = new DomainLookupResponseDto();
    dto.found = false;

    expect(dto.found).toBe(false);
    expect(dto.domain).toBeUndefined();
  });
});
