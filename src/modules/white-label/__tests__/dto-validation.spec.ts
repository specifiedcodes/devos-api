/**
 * White-Label DTO Validation Tests
 * Story 22-1: White-Label Configuration (AC2)
 *
 * Tests validation rules for UpdateWhiteLabelConfigDto, SetCustomDomainDto,
 * and WhiteLabelConfigResponseDto.
 */

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateWhiteLabelConfigDto } from '../dto/update-white-label-config.dto';
import { SetCustomDomainDto } from '../dto/set-custom-domain.dto';
import { WhiteLabelConfigResponseDto } from '../dto/white-label-config-response.dto';
import {
  WhiteLabelConfig,
  BackgroundMode,
  DomainStatus,
} from '../../../database/entities/white-label-config.entity';

describe('UpdateWhiteLabelConfigDto', () => {
  it('should validate appName length and special chars', async () => {
    const dto = plainToInstance(UpdateWhiteLabelConfigDto, {
      appName: '<script>alert("xss")</script>',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const appNameError = errors.find((e) => e.property === 'appName');
    expect(appNameError).toBeDefined();
  });

  it('should validate hex color format for primaryColor', async () => {
    const dto = plainToInstance(UpdateWhiteLabelConfigDto, {
      primaryColor: 'not-a-color',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should validate hex color format for secondaryColor', async () => {
    const dto = plainToInstance(UpdateWhiteLabelConfigDto, {
      secondaryColor: 'rgb(255,0,0)',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should validate backgroundMode enum', async () => {
    const dto = plainToInstance(UpdateWhiteLabelConfigDto, {
      backgroundMode: 'invalid-mode',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should validate fontFamily character restrictions', async () => {
    const dto = plainToInstance(UpdateWhiteLabelConfigDto, {
      fontFamily: 'Roboto; DROP TABLE',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should validate customCss max length', async () => {
    const dto = plainToInstance(UpdateWhiteLabelConfigDto, {
      customCss: 'a'.repeat(10001),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should allow partial updates (all fields optional)', async () => {
    const dto = plainToInstance(UpdateWhiteLabelConfigDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept valid hex colors', async () => {
    const dto = plainToInstance(UpdateWhiteLabelConfigDto, {
      primaryColor: '#FF5733',
      secondaryColor: '#00FF00',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept valid backgroundMode values', async () => {
    for (const mode of [BackgroundMode.LIGHT, BackgroundMode.DARK, BackgroundMode.SYSTEM]) {
      const dto = plainToInstance(UpdateWhiteLabelConfigDto, { backgroundMode: mode });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('should accept valid fontFamily with spaces and hyphens', async () => {
    const dto = plainToInstance(UpdateWhiteLabelConfigDto, {
      fontFamily: "Source Sans Pro, 'Helvetica Neue'",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('SetCustomDomainDto', () => {
  it('should validate valid domain formats', async () => {
    const validDomains = [
      'app.example.com',
      'my-app.domain.io',
      'sub.domain.example.co.uk',
      'a.com',
    ];

    for (const domain of validDomains) {
      const dto = plainToInstance(SetCustomDomainDto, { domain });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('should reject invalid domain formats', async () => {
    const invalidDomains = [
      'not a domain',
      'domain_with_underscores.com',
      'localhost',
      '-starts-with-dash.com',
    ];

    for (const domain of invalidDomains) {
      const dto = plainToInstance(SetCustomDomainDto, { domain });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it('should reject too short domains', async () => {
    const dto = plainToInstance(SetCustomDomainDto, { domain: 'a.b' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('WhiteLabelConfigResponseDto', () => {
  it('should map all fields correctly from entity', () => {
    const entity: WhiteLabelConfig = {
      id: '33333333-3333-3333-3333-333333333333',
      workspaceId: '11111111-1111-1111-1111-111111111111',
      appName: 'TestApp',
      logoUrl: 'logo-key',
      logoDarkUrl: null,
      faviconUrl: 'favicon-key',
      primaryColor: '#FF0000',
      secondaryColor: '#00FF00',
      backgroundMode: BackgroundMode.DARK,
      fontFamily: 'Roboto',
      customCss: '.test { color: red; }',
      customDomain: 'app.example.com',
      domainStatus: DomainStatus.VERIFIED,
      domainVerificationToken: 'secret-token',
      domainVerifiedAt: new Date('2026-01-15'),
      sslProvisioned: true,
      isActive: true,
      createdBy: '22222222-2222-2222-2222-222222222222',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-15'),
    } as WhiteLabelConfig;

    const dto = WhiteLabelConfigResponseDto.fromEntity(entity);

    expect(dto.id).toBe(entity.id);
    expect(dto.workspaceId).toBe(entity.workspaceId);
    expect(dto.appName).toBe('TestApp');
    expect(dto.logoUrl).toBe('logo-key');
    expect(dto.logoDarkUrl).toBeNull();
    expect(dto.faviconUrl).toBe('favicon-key');
    expect(dto.primaryColor).toBe('#FF0000');
    expect(dto.secondaryColor).toBe('#00FF00');
    expect(dto.backgroundMode).toBe(BackgroundMode.DARK);
    expect(dto.fontFamily).toBe('Roboto');
    expect(dto.customCss).toBe('.test { color: red; }');
    expect(dto.customDomain).toBe('app.example.com');
    expect(dto.domainStatus).toBe(DomainStatus.VERIFIED);
    expect(dto.domainVerifiedAt).toEqual(new Date('2026-01-15'));
    expect(dto.sslProvisioned).toBe(true);
    expect(dto.isActive).toBe(true);
    // Verify domainVerificationToken is NOT included in response
    expect((dto as any).domainVerificationToken).toBeUndefined();
  });
});
