import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  EnableEnforcementDto,
  UpdateEnforcementDto,
  LoginEnforcementCheckDto,
} from './enforcement.dto';

describe('EnableEnforcementDto', () => {
  it('should accept valid grace period values within range (0-720)', async () => {
    const dto = plainToInstance(EnableEnforcementDto, { gracePeriodHours: 72 });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept gracePeriodHours = 0 (immediate enforcement)', async () => {
    const dto = plainToInstance(EnableEnforcementDto, { gracePeriodHours: 0 });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept gracePeriodHours = 720 (max)', async () => {
    const dto = plainToInstance(EnableEnforcementDto, { gracePeriodHours: 720 });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject grace period below minimum (< 0)', async () => {
    const dto = plainToInstance(EnableEnforcementDto, { gracePeriodHours: -1 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('gracePeriodHours');
  });

  it('should reject grace period above maximum (> 720)', async () => {
    const dto = plainToInstance(EnableEnforcementDto, { gracePeriodHours: 721 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('gracePeriodHours');
  });

  it('should accept valid email array in bypassEmails', async () => {
    const dto = plainToInstance(EnableEnforcementDto, {
      bypassEmails: ['admin@acme.com', 'support@acme.com'],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid emails in bypassEmails', async () => {
    const dto = plainToInstance(EnableEnforcementDto, {
      bypassEmails: ['not-an-email'],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject more than 50 bypass emails', async () => {
    const emails = Array.from({ length: 51 }, (_, i) => `user${i}@acme.com`);
    const dto = plainToInstance(EnableEnforcementDto, { bypassEmails: emails });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept empty body (all optional)', async () => {
    const dto = plainToInstance(EnableEnforcementDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept valid boolean ownerBypassEnabled', async () => {
    const dto = plainToInstance(EnableEnforcementDto, { ownerBypassEnabled: false });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept valid enforcementMessage within 500 chars', async () => {
    const dto = plainToInstance(EnableEnforcementDto, {
      enforcementMessage: 'Please use SSO to sign in.',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject enforcementMessage exceeding 500 chars', async () => {
    const longMessage = 'x'.repeat(501);
    const dto = plainToInstance(EnableEnforcementDto, {
      enforcementMessage: longMessage,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateEnforcementDto', () => {
  it('should accept partial updates', async () => {
    const dto = plainToInstance(UpdateEnforcementDto, {
      ownerBypassEnabled: false,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept empty body (all optional)', async () => {
    const dto = plainToInstance(UpdateEnforcementDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate bypass email format', async () => {
    const dto = plainToInstance(UpdateEnforcementDto, {
      bypassEmails: ['not-email'],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject more than 50 bypass emails', async () => {
    const emails = Array.from({ length: 51 }, (_, i) => `user${i}@acme.com`);
    const dto = plainToInstance(UpdateEnforcementDto, { bypassEmails: emails });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('LoginEnforcementCheckDto', () => {
  it('should require valid email', async () => {
    const dto = plainToInstance(LoginEnforcementCheckDto, { email: 'user@acme.com' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid email', async () => {
    const dto = plainToInstance(LoginEnforcementCheckDto, { email: 'not-email' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing email', async () => {
    const dto = plainToInstance(LoginEnforcementCheckDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should validate optional UUID for workspaceId', async () => {
    const dto = plainToInstance(LoginEnforcementCheckDto, {
      email: 'user@acme.com',
      workspaceId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid UUID for workspaceId', async () => {
    const dto = plainToInstance(LoginEnforcementCheckDto, {
      email: 'user@acme.com',
      workspaceId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept when workspaceId is omitted', async () => {
    const dto = plainToInstance(LoginEnforcementCheckDto, {
      email: 'user@acme.com',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
