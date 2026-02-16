import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateOidcConfigDto } from './create-oidc-config.dto';
import { OidcProviderType } from '../../../database/entities/oidc-configuration.entity';

describe('CreateOidcConfigDto', () => {
  const validData = {
    providerType: 'google',
    clientId: 'client-123.apps.googleusercontent.com',
    clientSecret: 'super-secret-key',
    discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
  };

  it('should validate required fields (providerType, clientId, clientSecret, discoveryUrl)', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, validData);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject missing providerType', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      providerType: undefined,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'providerType')).toBe(true);
  });

  it('should reject missing clientId', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      clientId: '',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing clientSecret', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      clientSecret: '',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject invalid URLs (non-HTTPS discoveryUrl)', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      discoveryUrl: 'http://insecure.example.com/.well-known/openid-configuration',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'discoveryUrl')).toBe(true);
  });

  it('should accept valid providerType values', async () => {
    for (const type of ['google', 'microsoft', 'okta', 'auth0', 'custom']) {
      const dto = plainToInstance(CreateOidcConfigDto, { ...validData, providerType: type });
      const errors = await validate(dto);
      const providerErrors = errors.filter((e) => e.property === 'providerType');
      expect(providerErrors).toHaveLength(0);
    }
  });

  it('should reject invalid providerType values', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      providerType: 'invalid_provider',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'providerType')).toBe(true);
  });

  it('should validate scopes as string array', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      scopes: ['openid', 'email', 'profile'],
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'scopes')).toHaveLength(0);
  });

  it('should reject non-string scopes', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      scopes: [123, 456],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'scopes')).toBe(true);
  });

  it('should validate allowedDomains as string array', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      allowedDomains: ['acme.com', 'acme.io'],
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'allowedDomains')).toHaveLength(0);
  });

  it('should allow partial updates (all fields optional in update)', async () => {
    // CreateOidcConfigDto has required fields, but this test verifies optional fields
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      displayName: 'Acme Google',
      usePkce: false,
      tokenEndpointAuthMethod: 'client_secret_basic',
      attributeMapping: { email: 'email' },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid tokenEndpointAuthMethod', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      tokenEndpointAuthMethod: 'invalid_method',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'tokenEndpointAuthMethod')).toBe(true);
  });

  it('should accept valid tokenEndpointAuthMethod values', async () => {
    for (const method of ['client_secret_post', 'client_secret_basic']) {
      const dto = plainToInstance(CreateOidcConfigDto, {
        ...validData,
        tokenEndpointAuthMethod: method,
      });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'tokenEndpointAuthMethod')).toHaveLength(0);
    }
  });

  it('should enforce maxLength on displayName (255)', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      displayName: 'a'.repeat(256),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'displayName')).toBe(true);
  });

  it('should enforce maxLength on clientId (500)', async () => {
    const dto = plainToInstance(CreateOidcConfigDto, {
      ...validData,
      clientId: 'a'.repeat(501),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'clientId')).toBe(true);
  });
});
