/**
 * White-Label Email Template Service Tests
 * Story 22-2: White-Label Email Templates (AC3)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { WhiteLabelEmailTemplateService } from './white-label-email-template.service';
import {
  WhiteLabelEmailTemplate,
  WhiteLabelEmailTemplateType,
} from '../../../database/entities/white-label-email-template.entity';
import { WhiteLabelConfig } from '../../../database/entities/white-label-config.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { EmailNotificationService } from '../../email/services/email-notification.service';
import { EmailTemplateService } from '../../email/services/email-template.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('WhiteLabelEmailTemplateService', () => {
  let service: WhiteLabelEmailTemplateService;
  let templateRepo: jest.Mocked<Repository<WhiteLabelEmailTemplate>>;
  let whiteLabelConfigRepo: jest.Mocked<Repository<WhiteLabelConfig>>;
  let memberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let redisService: jest.Mocked<RedisService>;

  const workspaceId = '00000000-0000-0000-0000-000000000001';
  const actorId = '00000000-0000-0000-0000-000000000002';

  beforeEach(async () => {
    const mockTemplateRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    const mockWhiteLabelConfigRepo = {
      findOne: jest.fn(),
    };

    const mockMemberRepo = {
      findOne: jest.fn(),
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const mockEmailNotificationService = {
      sendTransactional: jest.fn(),
    };

    const mockEmailTemplateService = {
      render: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('http://localhost:3000'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhiteLabelEmailTemplateService,
        { provide: getRepositoryToken(WhiteLabelEmailTemplate), useValue: mockTemplateRepo },
        { provide: getRepositoryToken(WhiteLabelConfig), useValue: mockWhiteLabelConfigRepo },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockMemberRepo },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: EmailNotificationService, useValue: mockEmailNotificationService },
        { provide: EmailTemplateService, useValue: mockEmailTemplateService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WhiteLabelEmailTemplateService>(WhiteLabelEmailTemplateService);
    templateRepo = module.get(getRepositoryToken(WhiteLabelEmailTemplate));
    whiteLabelConfigRepo = module.get(getRepositoryToken(WhiteLabelConfig));
    memberRepo = module.get(getRepositoryToken(WorkspaceMember));
    redisService = module.get(RedisService);
  });

  describe('getTemplates', () => {
    it('returns all 6 template types with defaults for missing', async () => {
      templateRepo.find.mockResolvedValue([]);

      const result = await service.getTemplates(workspaceId);

      expect(result).toHaveLength(6);
      expect(result.map((t) => t.templateType)).toEqual(
        expect.arrayContaining(Object.values(WhiteLabelEmailTemplateType)),
      );
      expect(result.every((t) => t.isCustom === false)).toBe(true);
    });

    it('returns custom templates when they exist', async () => {
      const customTemplate: Partial<WhiteLabelEmailTemplate> = {
        id: 'custom-id',
        workspaceId,
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Custom Subject',
        bodyHtml: '<p>Custom HTML</p>',
        bodyText: 'Custom text',
        isCustom: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      templateRepo.find.mockResolvedValue([customTemplate as WhiteLabelEmailTemplate]);

      const result = await service.getTemplates(workspaceId);

      const invitation = result.find((t) => t.templateType === WhiteLabelEmailTemplateType.INVITATION);
      expect(invitation?.isCustom).toBe(true);
      expect(invitation?.subject).toBe('Custom Subject');
    });
  });

  describe('getTemplateByType', () => {
    it('returns custom template when exists', async () => {
      const customTemplate: Partial<WhiteLabelEmailTemplate> = {
        id: 'custom-id',
        workspaceId,
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Custom Subject',
        bodyHtml: '<p>Custom HTML</p>',
        bodyText: 'Custom text',
        isCustom: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      templateRepo.findOne.mockResolvedValue(customTemplate as WhiteLabelEmailTemplate);
      redisService.get.mockResolvedValue(null);

      const result = await service.getTemplateByType(workspaceId, WhiteLabelEmailTemplateType.INVITATION);

      expect(result.isCustom).toBe(true);
      expect(result.subject).toBe('Custom Subject');
    });

    it('returns default template when not customized', async () => {
      templateRepo.findOne.mockResolvedValue(null);
      redisService.get.mockResolvedValue(null);

      const result = await service.getTemplateByType(workspaceId, WhiteLabelEmailTemplateType.INVITATION);

      expect(result.isCustom).toBe(false);
      expect(result.subject).toContain('{{app_name}}');
    });

    it('caches the template result', async () => {
      templateRepo.findOne.mockResolvedValue(null);
      redisService.get.mockResolvedValue(null);

      await service.getTemplateByType(workspaceId, WhiteLabelEmailTemplateType.INVITATION);

      expect(redisService.set).toHaveBeenCalled();
    });
  });

  describe('upsertTemplate', () => {
    it('creates new template when none exists', async () => {
      memberRepo.findOne.mockResolvedValue({
        workspaceId,
        userId: actorId,
        role: WorkspaceRole.OWNER,
      } as WorkspaceMember);

      templateRepo.findOne.mockResolvedValue(null);
      templateRepo.create.mockReturnValue({
        workspaceId,
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test Subject',
        bodyHtml: '<p>Test</p>',
        bodyText: null,
        isCustom: true,
        createdBy: actorId,
      } as WhiteLabelEmailTemplate);
      templateRepo.save.mockResolvedValue({
        id: 'new-id',
        workspaceId,
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test Subject',
        bodyHtml: '<p>Test</p>',
        bodyText: null,
        isCustom: true,
        createdBy: actorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as WhiteLabelEmailTemplate);

      const result = await service.upsertTemplate(workspaceId, {
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test Subject',
        bodyHtml: '<p>Test</p>',
      }, actorId);

      expect(templateRepo.create).toHaveBeenCalled();
      expect(templateRepo.save).toHaveBeenCalled();
    });

    it('updates existing template', async () => {
      const existingTemplate: Partial<WhiteLabelEmailTemplate> = {
        id: 'existing-id',
        workspaceId,
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Old Subject',
        bodyHtml: '<p>Old</p>',
        bodyText: null,
        isCustom: true,
      };

      memberRepo.findOne.mockResolvedValue({
        workspaceId,
        userId: actorId,
        role: WorkspaceRole.ADMIN,
      } as WorkspaceMember);

      templateRepo.findOne.mockResolvedValue(existingTemplate as WhiteLabelEmailTemplate);
      templateRepo.save.mockResolvedValue({
        ...existingTemplate,
        subject: 'New Subject',
        bodyHtml: '<p>New</p>',
      } as WhiteLabelEmailTemplate);

      const result = await service.upsertTemplate(workspaceId, {
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'New Subject',
        bodyHtml: '<p>New</p>',
      }, actorId);

      expect(templateRepo.save).toHaveBeenCalled();
    });

    it('sanitizes dangerous HTML', async () => {
      memberRepo.findOne.mockResolvedValue({
        workspaceId,
        userId: actorId,
        role: WorkspaceRole.OWNER,
      } as WorkspaceMember);

      templateRepo.findOne.mockResolvedValue(null);
      templateRepo.create.mockImplementation((data) => data as WhiteLabelEmailTemplate);
      templateRepo.save.mockImplementation((data) => Promise.resolve({
        ...data,
        id: 'new-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as WhiteLabelEmailTemplate));

      await service.upsertTemplate(workspaceId, {
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test',
        bodyHtml: '<script>alert("xss")</script><p onclick="evil">Safe</p>',
      }, actorId);

      const savedData = templateRepo.save.mock.calls[0][0];
      expect(savedData.bodyHtml).not.toContain('<script>');
      expect(savedData.bodyHtml).not.toContain('onclick');
    });

    it('invalidates cache after update', async () => {
      memberRepo.findOne.mockResolvedValue({
        workspaceId,
        userId: actorId,
        role: WorkspaceRole.OWNER,
      } as WorkspaceMember);

      templateRepo.findOne.mockResolvedValue(null);
      templateRepo.create.mockImplementation((data) => data as WhiteLabelEmailTemplate);
      templateRepo.save.mockResolvedValue({
        id: 'new-id',
        workspaceId,
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
        isCustom: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as WhiteLabelEmailTemplate);

      await service.upsertTemplate(workspaceId, {
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
      }, actorId);

      expect(redisService.del).toHaveBeenCalled();
    });

    it('rejects developer role', async () => {
      memberRepo.findOne.mockResolvedValue({
        workspaceId,
        userId: actorId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);

      await expect(service.upsertTemplate(workspaceId, {
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
      }, actorId)).rejects.toThrow(ForbiddenException);
    });

    it('allows owner role', async () => {
      memberRepo.findOne.mockResolvedValue({
        workspaceId,
        userId: actorId,
        role: WorkspaceRole.OWNER,
      } as WorkspaceMember);

      templateRepo.findOne.mockResolvedValue(null);
      templateRepo.create.mockImplementation((data) => data as WhiteLabelEmailTemplate);
      templateRepo.save.mockResolvedValue({} as WhiteLabelEmailTemplate);

      await expect(service.upsertTemplate(workspaceId, {
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
      }, actorId)).resolves.toBeDefined();
    });

    it('allows admin role', async () => {
      memberRepo.findOne.mockResolvedValue({
        workspaceId,
        userId: actorId,
        role: WorkspaceRole.ADMIN,
      } as WorkspaceMember);

      templateRepo.findOne.mockResolvedValue(null);
      templateRepo.create.mockImplementation((data) => data as WhiteLabelEmailTemplate);
      templateRepo.save.mockResolvedValue({} as WhiteLabelEmailTemplate);

      await expect(service.upsertTemplate(workspaceId, {
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
      }, actorId)).resolves.toBeDefined();
    });
  });

  describe('resetTemplate', () => {
    it('deletes custom template and returns to default', async () => {
      memberRepo.findOne.mockResolvedValue({
        workspaceId,
        userId: actorId,
        role: WorkspaceRole.OWNER,
      } as WorkspaceMember);

      const customTemplate: Partial<WhiteLabelEmailTemplate> = {
        id: 'custom-id',
        workspaceId,
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Custom',
        bodyHtml: '<p>Custom</p>',
        isCustom: true,
      };

      templateRepo.findOne.mockResolvedValue(customTemplate as WhiteLabelEmailTemplate);
      templateRepo.remove.mockResolvedValue(customTemplate as WhiteLabelEmailTemplate);

      await service.resetTemplate(workspaceId, WhiteLabelEmailTemplateType.INVITATION, actorId);

      expect(templateRepo.remove).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
    });

    it('throws NotFoundException when no custom template exists', async () => {
      memberRepo.findOne.mockResolvedValue({
        workspaceId,
        userId: actorId,
        role: WorkspaceRole.OWNER,
      } as WorkspaceMember);

      templateRepo.findOne.mockResolvedValue(null);

      await expect(
        service.resetTemplate(workspaceId, WhiteLabelEmailTemplateType.INVITATION, actorId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendTestEmail', () => {
    it('sends email with sample data', async () => {
      memberRepo.findOne.mockResolvedValue({
        workspaceId,
        userId: actorId,
        role: WorkspaceRole.OWNER,
      } as WorkspaceMember);

      templateRepo.findOne.mockResolvedValue(null);
      whiteLabelConfigRepo.findOne.mockResolvedValue(null);

      const mockSendTransactional = jest.fn().mockResolvedValue({
        sent: true,
        messageId: 'test-msg-id',
      });
      (service as any).emailNotificationService.sendTransactional = mockSendTransactional;

      const result = await service.sendTestEmail(workspaceId, {
        email: 'test@example.com',
        templateType: WhiteLabelEmailTemplateType.INVITATION,
      }, actorId);

      expect(result.success).toBe(true);
    });
  });

  describe('renderTemplate', () => {
    it('uses custom template when exists', async () => {
      const customTemplate: Partial<WhiteLabelEmailTemplate> = {
        id: 'custom-id',
        workspaceId,
        templateType: WhiteLabelEmailTemplateType.INVITATION,
        subject: 'Welcome to {{app_name}}',
        bodyHtml: '<p>Hello {{user_name}}</p>',
        bodyText: 'Hello {{user_name}}',
        isCustom: true,
      };

      templateRepo.findOne.mockResolvedValue(customTemplate as WhiteLabelEmailTemplate);
      whiteLabelConfigRepo.findOne.mockResolvedValue({
        appName: 'My App',
        primaryColor: '#FF0000',
        logoUrl: 'https://example.com/logo.png',
      } as WhiteLabelConfig);

      const result = await service.renderTemplate(
        workspaceId,
        WhiteLabelEmailTemplateType.INVITATION,
        { user_name: 'John' },
      );

      expect(result.subject).toContain('My App');
      expect(result.html).toContain('John');
    });

    it('falls back to default template', async () => {
      templateRepo.findOne.mockResolvedValue(null);
      whiteLabelConfigRepo.findOne.mockResolvedValue(null);

      const result = await service.renderTemplate(
        workspaceId,
        WhiteLabelEmailTemplateType.INVITATION,
        { user_name: 'John' },
      );

      expect(result.subject).toBeDefined();
      expect(result.html).toBeDefined();
      expect(result.text).toBeDefined();
    });

    it('interpolates all supported variables', async () => {
      templateRepo.findOne.mockResolvedValue(null);
      whiteLabelConfigRepo.findOne.mockResolvedValue({
        appName: 'Test App',
        primaryColor: '#123456',
        logoUrl: 'https://test.com/logo.png',
      } as WhiteLabelConfig);

      const result = await service.renderTemplate(
        workspaceId,
        WhiteLabelEmailTemplateType.INVITATION,
        {
          user_name: 'Jane',
          workspace_name: 'Test Workspace',
          action_url: 'https://test.com/invite',
          role: 'Admin',
        },
      );

      expect(result.html).toContain('Jane');
      expect(result.html).toContain('Test Workspace');
    });

    it('includes white-label branding', async () => {
      templateRepo.findOne.mockResolvedValue(null);
      whiteLabelConfigRepo.findOne.mockResolvedValue({
        appName: 'Branded App',
        primaryColor: '#ABCDEF',
        logoUrl: 'https://branded.com/logo.png',
      } as WhiteLabelConfig);

      const result = await service.renderTemplate(
        workspaceId,
        WhiteLabelEmailTemplateType.INVITATION,
        {},
      );

      expect(result.html).toContain('Branded App');
      expect(result.html).toContain('#ABCDEF');
    });
  });

  describe('sanitizeHtml', () => {
    it('strips script tags', () => {
      const input = '<p>Safe</p><script>alert("xss")</script>';
      const result = (service as any).sanitizeHtml(input);
      expect(result).not.toContain('<script>');
    });

    it('strips javascript: protocol', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const result = (service as any).sanitizeHtml(input);
      expect(result).not.toContain('javascript:');
    });

    it('strips event handlers', () => {
      const input = '<p onclick="evil()">Text</p>';
      const result = (service as any).sanitizeHtml(input);
      expect(result).not.toContain('onclick');
    });

    it('strips iframe tags', () => {
      const input = '<iframe src="evil.com"></iframe>';
      const result = (service as any).sanitizeHtml(input);
      expect(result).not.toContain('<iframe');
    });

    it('strips object and embed tags', () => {
      const input = '<object data="evil.swf"></object><embed src="evil.swf">';
      const result = (service as any).sanitizeHtml(input);
      expect(result).not.toContain('<object');
      expect(result).not.toContain('<embed');
    });

    it('preserves safe HTML elements', () => {
      const input = '<h1>Title</h1><p>Paragraph</p><a href="https://safe.com">Link</a>';
      const result = (service as any).sanitizeHtml(input);
      expect(result).toContain('<h1>');
      expect(result).toContain('<p>');
      expect(result).toContain('https://safe.com');
    });
  });

  describe('interpolateVariables', () => {
    it('replaces all occurrences', () => {
      const content = 'Hello {{user_name}}, welcome to {{app_name}}!';
      const result = (service as any).interpolateVariables(content, {
        user_name: 'Alice',
        app_name: 'DevOS',
      });
      expect(result).toBe('Hello Alice, welcome to DevOS!');
    });

    it('handles missing variables gracefully', () => {
      const content = 'Hello {{user_name}}, welcome to {{app_name}}!';
      const result = (service as any).interpolateVariables(content, {
        user_name: 'Alice',
      });
      expect(result).toBe('Hello Alice, welcome to {{app_name}}!');
    });

    it('escapes HTML in variable values', () => {
      const content = 'Hello {{user_name}}';
      const result = (service as any).interpolateVariables(content, {
        user_name: '<script>alert(1)</script>',
      });
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });
  });
});
