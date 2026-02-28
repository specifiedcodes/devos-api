/**
 * Email Template DTO Tests
 * Story 22-2: White-Label Email Templates (AC2)
 */

import { validate } from 'class-validator';
import { UpdateEmailTemplateDto } from '../dto/update-email-template.dto';
import { SendTestEmailDto } from '../dto/send-test-email.dto';
import { EmailTemplateResponseDto } from '../dto/email-template-response.dto';
import { WhiteLabelEmailTemplateType, WhiteLabelEmailTemplate } from '../../../database/entities/white-label-email-template.entity';

describe('UpdateEmailTemplateDto', () => {
  const validDto = () => {
    const dto = new UpdateEmailTemplateDto();
    dto.templateType = WhiteLabelEmailTemplateType.INVITATION;
    dto.subject = 'Test Subject';
    dto.bodyHtml = '<p>Test body content here</p>';
    return dto;
  };

  it('validates templateType enum', async () => {
    const dto = validDto();
    dto.templateType = 'invalid_type' as any;

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'templateType')).toBe(true);
  });

  it('accepts valid templateType values', async () => {
    for (const type of Object.values(WhiteLabelEmailTemplateType)) {
      const dto = validDto();
      dto.templateType = type;
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'templateType')).toBe(false);
    }
  });

  it('validates subject length', async () => {
    const dto = validDto();
    dto.subject = '';

    let errors = await validate(dto);
    expect(errors.some((e) => e.property === 'subject')).toBe(true);

    dto.subject = 'a'.repeat(256);
    errors = await validate(dto);
    expect(errors.some((e) => e.property === 'subject')).toBe(true);
  });

  it('rejects subject with HTML special characters', async () => {
    const dto = validDto();
    dto.subject = '<script>alert(1)</script>';

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'subject')).toBe(true);
  });

  it('rejects subject with line breaks', async () => {
    const dto = validDto();
    dto.subject = 'Line 1\nLine 2';

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'subject')).toBe(true);
  });

  it('rejects subject with carriage returns', async () => {
    const dto = validDto();
    dto.subject = 'Line 1\rLine 2';

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'subject')).toBe(true);
  });

  it('validates bodyHtml min/max length', async () => {
    const dto = validDto();
    dto.bodyHtml = 'short';

    let errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bodyHtml')).toBe(true);

    dto.bodyHtml = 'a'.repeat(100001);
    errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bodyHtml')).toBe(true);
  });

  it('accepts valid bodyHtml', async () => {
    const dto = validDto();
    dto.bodyHtml = '<p>' + 'a'.repeat(100) + '</p>';

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bodyHtml')).toBe(false);
  });

  it('validates optional bodyText max length', async () => {
    const dto = validDto();
    dto.bodyText = 'a'.repeat(50001);

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bodyText')).toBe(true);
  });

  it('accepts optional bodyText', async () => {
    const dto = validDto();
    dto.bodyText = 'Plain text content';

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bodyText')).toBe(false);
  });

  it('accepts dto without bodyText', async () => {
    const dto = validDto();
    delete dto.bodyText;

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bodyText')).toBe(false);
  });
});

describe('SendTestEmailDto', () => {
  const validDto = () => {
    const dto = new SendTestEmailDto();
    dto.email = 'test@example.com';
    dto.templateType = WhiteLabelEmailTemplateType.INVITATION;
    return dto;
  };

  it('validates email format', async () => {
    const dto = validDto();
    dto.email = 'invalid-email';

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects invalid email', async () => {
    const dto = validDto();
    dto.email = 'not-an-email@';

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('accepts valid email', async () => {
    const dto = validDto();
    dto.email = 'user+test@example.com';

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(false);
  });

  it('validates templateType enum', async () => {
    const dto = validDto();
    dto.templateType = 'invalid' as any;

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'templateType')).toBe(true);
  });

  it('accepts valid templateType', async () => {
    const dto = validDto();
    dto.templateType = WhiteLabelEmailTemplateType.PASSWORD_RESET;

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'templateType')).toBe(false);
  });
});

describe('EmailTemplateResponseDto', () => {
  it('fromEntity maps all fields correctly', () => {
    const entity: Partial<WhiteLabelEmailTemplate> = {
      id: 'test-id',
      workspaceId: 'workspace-id',
      templateType: WhiteLabelEmailTemplateType.INVITATION,
      subject: 'Test Subject',
      bodyHtml: '<p>Test</p>',
      bodyText: 'Test text',
      isCustom: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    };

    const dto = EmailTemplateResponseDto.fromEntity(entity as WhiteLabelEmailTemplate);

    expect(dto.id).toBe('test-id');
    expect(dto.workspaceId).toBe('workspace-id');
    expect(dto.templateType).toBe(WhiteLabelEmailTemplateType.INVITATION);
    expect(dto.subject).toBe('Test Subject');
    expect(dto.bodyHtml).toBe('<p>Test</p>');
    expect(dto.bodyText).toBe('Test text');
    expect(dto.isCustom).toBe(true);
    expect(dto.createdAt).toEqual(entity.createdAt);
    expect(dto.updatedAt).toEqual(entity.updatedAt);
  });

  it('fromEntity handles null bodyText', () => {
    const entity: Partial<WhiteLabelEmailTemplate> = {
      id: 'test-id',
      workspaceId: 'workspace-id',
      templateType: WhiteLabelEmailTemplateType.INVITATION,
      subject: 'Test',
      bodyHtml: '<p>Test</p>',
      bodyText: null,
      isCustom: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dto = EmailTemplateResponseDto.fromEntity(entity as WhiteLabelEmailTemplate);

    expect(dto.bodyText).toBeNull();
  });

  it('fromDefaultTemplate creates default template dto', () => {
    const dto = EmailTemplateResponseDto.fromDefaultTemplate(
      'workspace-id',
      WhiteLabelEmailTemplateType.INVITATION,
      'Default Subject',
      '<p>Default HTML</p>',
      'Default text',
    );

    expect(dto.id).toBe('default-invitation');
    expect(dto.workspaceId).toBe('workspace-id');
    expect(dto.templateType).toBe(WhiteLabelEmailTemplateType.INVITATION);
    expect(dto.subject).toBe('Default Subject');
    expect(dto.bodyHtml).toBe('<p>Default HTML</p>');
    expect(dto.bodyText).toBe('Default text');
    expect(dto.isCustom).toBe(false);
  });
});
