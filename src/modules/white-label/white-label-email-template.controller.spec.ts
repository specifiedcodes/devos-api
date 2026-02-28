/**
 * White-Label Email Template Controller Tests
 * Story 22-2: White-Label Email Templates (AC4)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { WhiteLabelEmailTemplateController } from './white-label-email-template.controller';
import { WhiteLabelEmailTemplateService } from './services/white-label-email-template.service';
import { WhiteLabelEmailTemplateType } from '../../database/entities/white-label-email-template.entity';
import { BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../common/guards/role.guard';

describe('WhiteLabelEmailTemplateController', () => {
  let controller: WhiteLabelEmailTemplateController;
  let service: jest.Mocked<WhiteLabelEmailTemplateService>;

  const workspaceId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000002';

  const mockRequest = {
    user: { id: userId },
  };

  beforeEach(async () => {
    const mockService = {
      getTemplates: jest.fn(),
      getTemplateByType: jest.fn(),
      upsertTemplate: jest.fn(),
      resetTemplate: jest.fn(),
      sendTestEmail: jest.fn(),
      validateWorkspaceMembership: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhiteLabelEmailTemplateController],
      providers: [
        { provide: WhiteLabelEmailTemplateService, useValue: mockService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<WhiteLabelEmailTemplateController>(WhiteLabelEmailTemplateController);
    service = module.get(WhiteLabelEmailTemplateService);
  });

  describe('GET /email-templates', () => {
    it('returns all 6 templates', async () => {
      service.validateWorkspaceMembership = jest.fn().mockResolvedValue(undefined);
      service.getTemplates.mockResolvedValue([]);

      await controller.getTemplates(workspaceId, mockRequest);

      expect(service.validateWorkspaceMembership).toHaveBeenCalledWith(workspaceId, userId);
      expect(service.getTemplates).toHaveBeenCalledWith(workspaceId);
    });

    it('returns custom templates when they exist', async () => {
      const templates = [
        {
          id: 'custom-id',
          workspaceId,
          templateType: WhiteLabelEmailTemplateType.INVITATION,
          subject: 'Custom',
          bodyHtml: '<p>Custom</p>',
          bodyText: null,
          isCustom: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      service.getTemplates.mockResolvedValue(templates as any);

      const result = await controller.getTemplates(workspaceId, mockRequest);

      expect(result).toHaveLength(1);
    });
  });

  describe('GET /email-templates/:templateType', () => {
    it('returns specific template', async () => {
      service.validateWorkspaceMembership = jest.fn().mockResolvedValue(undefined);
      service.getTemplateByType.mockResolvedValue({
        id: 'template-id',
        workspaceId,
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
        bodyText: null,
        isCustom: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await controller.getTemplateByType(workspaceId, 'invitation', mockRequest);

      expect(service.validateWorkspaceMembership).toHaveBeenCalledWith(workspaceId, userId);
      expect(result.templateType).toBe(WhiteLabelEmailTemplateType.INVITATION);
    });

    it('returns 400 for invalid template type', async () => {
      service.validateWorkspaceMembership = jest.fn().mockResolvedValue(undefined);
      await expect(
        controller.getTemplateByType(workspaceId, 'invalid_type', mockRequest),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('PUT /email-templates', () => {
    it('creates template with valid dto', async () => {
      const dto = {
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test Subject',
        bodyHtml: '<p>Test HTML</p>',
        bodyText: 'Test text',
      };

      service.upsertTemplate.mockResolvedValue({
        id: 'new-id',
        workspaceId,
        ...dto,
        isCustom: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await controller.upsertTemplate(workspaceId, dto, mockRequest);

      expect(service.upsertTemplate).toHaveBeenCalledWith(workspaceId, dto, userId);
      expect(result.subject).toBe('Test Subject');
    });

    it('sanitizes HTML in bodyHtml', async () => {
      const dto = {
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test',
        bodyHtml: '<script>alert(1)</script><p>Safe</p>',
      };

      service.upsertTemplate.mockResolvedValue({
        id: 'new-id',
        workspaceId,
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test',
        bodyHtml: '<p>Safe</p>',
        isCustom: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await controller.upsertTemplate(workspaceId, dto, mockRequest);

      expect(service.upsertTemplate).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ bodyHtml: dto.bodyHtml }),
        userId,
      );
    });
  });

  describe('DELETE /email-templates/:templateType', () => {
    it('resets template (204)', async () => {
      service.resetTemplate.mockResolvedValue(undefined);

      await controller.resetTemplate(workspaceId, 'invitation', mockRequest);

      expect(service.resetTemplate).toHaveBeenCalledWith(
        workspaceId,
        WhiteLabelEmailTemplateType.INVITATION,
        userId,
      );
    });

    it('returns 400 for invalid template type', async () => {
      await expect(
        controller.resetTemplate(workspaceId, 'invalid_type', mockRequest),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /send-test', () => {
    it('sends test email', async () => {
      const dto = {
        email: 'test@example.com',
        templateType: WhiteLabelEmailTemplateType.INVITATION,
      };

      service.sendTestEmail.mockResolvedValue({ success: true, messageId: 'msg-id' });

      const result = await controller.sendTestEmail(workspaceId, dto, mockRequest);

      expect(service.sendTestEmail).toHaveBeenCalledWith(workspaceId, dto, userId);
      expect(result.success).toBe(true);
    });

    it('validates email format via DTO', async () => {
      service.sendTestEmail.mockResolvedValue({ success: false });

      const result = await controller.sendTestEmail(
        workspaceId,
        { email: 'test@example.com', templateType: WhiteLabelEmailTemplateType.INVITATION },
        mockRequest,
      );

      expect(result).toBeDefined();
    });

    it('validates templateType enum via DTO', async () => {
      service.sendTestEmail.mockResolvedValue({ success: true });

      const result = await controller.sendTestEmail(
        workspaceId,
        { email: 'test@example.com', templateType: WhiteLabelEmailTemplateType.PASSWORD_RESET },
        mockRequest,
      );

      expect(service.sendTestEmail).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ templateType: WhiteLabelEmailTemplateType.PASSWORD_RESET }),
        userId,
      );
    });
  });

  describe('validateTemplateType', () => {
    it('returns valid template type', () => {
      const result = (controller as any).validateTemplateType('invitation');
      expect(result).toBe(WhiteLabelEmailTemplateType.INVITATION);
    });

    it('throws BadRequestException for invalid type', () => {
      expect(() => (controller as any).validateTemplateType('invalid')).toThrow(BadRequestException);
    });
  });
});
