import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSamlConfigDto } from './create-saml-config.dto';

describe('CreateSamlConfigDto', () => {
  function createDto(overrides: Partial<CreateSamlConfigDto> = {}): CreateSamlConfigDto {
    return plainToInstance(CreateSamlConfigDto, {
      providerName: 'Okta',
      entityId: 'https://idp.example.com/entity',
      ssoUrl: 'https://idp.example.com/sso',
      certificate: '-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----',
      ...overrides,
    });
  }

  it('should validate required fields', async () => {
    const dto = createDto();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject missing providerName', async () => {
    const dto = plainToInstance(CreateSamlConfigDto, {
      entityId: 'https://idp.example.com',
      ssoUrl: 'https://idp.example.com/sso',
      certificate: 'test',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'providerName')).toBe(true);
  });

  it('should reject missing entityId', async () => {
    const dto = plainToInstance(CreateSamlConfigDto, {
      providerName: 'Okta',
      ssoUrl: 'https://idp.example.com/sso',
      certificate: 'test',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'entityId')).toBe(true);
  });

  it('should reject missing ssoUrl', async () => {
    const dto = plainToInstance(CreateSamlConfigDto, {
      providerName: 'Okta',
      entityId: 'https://idp.example.com',
      certificate: 'test',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'ssoUrl')).toBe(true);
  });

  it('should reject missing certificate', async () => {
    const dto = plainToInstance(CreateSamlConfigDto, {
      providerName: 'Okta',
      entityId: 'https://idp.example.com',
      ssoUrl: 'https://idp.example.com/sso',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'certificate')).toBe(true);
  });

  it('should reject invalid ssoUrl (non-HTTPS)', async () => {
    const dto = createDto({ ssoUrl: 'http://insecure.example.com/sso' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'ssoUrl')).toBe(true);
  });

  it('should accept valid providerName values', async () => {
    const validProviders = ['Okta', 'Azure AD', 'OneLogin', 'Google Workspace', 'Custom'];
    for (const provider of validProviders) {
      const dto = createDto({ providerName: provider });
      const errors = await validate(dto);
      const providerErrors = errors.filter((e) => e.property === 'providerName');
      expect(providerErrors).toHaveLength(0);
    }
  });

  it('should reject invalid providerName values', async () => {
    const dto = createDto({ providerName: 'InvalidProvider' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'providerName')).toBe(true);
  });

  it('should allow partial updates with optional fields', async () => {
    const dto = createDto({
      displayName: 'My IdP',
      attributeMapping: { email: 'user.email' },
      nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      wantAssertionsSigned: false,
      wantResponseSigned: true,
      metadataUrl: 'https://idp.example.com/metadata',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept valid attributeMapping as object', async () => {
    const dto = createDto({
      attributeMapping: { email: 'user.email', firstName: 'user.name' },
    });
    const errors = await validate(dto);
    const mappingErrors = errors.filter((e) => e.property === 'attributeMapping');
    expect(mappingErrors).toHaveLength(0);
  });

  it('should accept boolean values for wantAssertionsSigned', async () => {
    const dtoTrue = createDto({ wantAssertionsSigned: true });
    const dtoFalse = createDto({ wantAssertionsSigned: false });
    const errorsTrue = await validate(dtoTrue);
    const errorsFalse = await validate(dtoFalse);
    expect(errorsTrue.filter((e) => e.property === 'wantAssertionsSigned')).toHaveLength(0);
    expect(errorsFalse.filter((e) => e.property === 'wantAssertionsSigned')).toHaveLength(0);
  });

  it('should reject invalid metadataUrl (non-HTTPS)', async () => {
    const dto = createDto({ metadataUrl: 'http://insecure.example.com/metadata' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'metadataUrl')).toBe(true);
  });
});
