/**
 * White-Label Email Template Service
 * Story 22-2: White-Label Email Templates (AC3)
 *
 * Core service for managing white-label email templates with HTML sanitization,
 * variable interpolation, and test email sending.
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  WhiteLabelEmailTemplate,
  WhiteLabelEmailTemplateType,
} from '../../../database/entities/white-label-email-template.entity';
import { WhiteLabelConfig } from '../../../database/entities/white-label-config.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { RedisService } from '../../redis/redis.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { EmailNotificationService } from '../../email/services/email-notification.service';
import { EmailTemplateService } from '../../email/services/email-template.service';
import { UpdateEmailTemplateDto } from '../dto/update-email-template.dto';
import { EmailTemplateResponseDto } from '../dto/email-template-response.dto';
import { SendTestEmailDto } from '../dto/send-test-email.dto';
import { getDefaultTemplate } from '../constants/default-email-templates';

const CACHE_PREFIX_ALL = 'wl:email-templates:';
const CACHE_PREFIX_SINGLE = 'wl:email-template:';
const CACHE_TTL_SECONDS = 300;

const ALL_TEMPLATE_TYPES = Object.values(WhiteLabelEmailTemplateType);

const ALLOWED_VARIABLES = [
  'app_name',
  'logo_url',
  'primary_color',
  'user_name',
  'user_email',
  'workspace_name',
  'action_url',
  'project_name',
  'agent_name',
  'current_spend',
  'limit',
  'percentage',
  'environment',
  'error_message',
  'date',
  'year',
  'unsubscribe_url',
  'role',
  'status',
  'alert_class',
  'is_over_limit',
  'stories_completed',
  'agent_hours',
  'total_cost',
];

@Injectable()
export class WhiteLabelEmailTemplateService {
  private readonly logger = new Logger(WhiteLabelEmailTemplateService.name);

  constructor(
    @InjectRepository(WhiteLabelEmailTemplate)
    private readonly templateRepo: Repository<WhiteLabelEmailTemplate>,
    @InjectRepository(WhiteLabelConfig)
    private readonly whiteLabelConfigRepo: Repository<WhiteLabelConfig>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly emailNotificationService: EmailNotificationService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly emailTemplateService: EmailTemplateService,
  ) {}

  async getTemplates(workspaceId: string): Promise<EmailTemplateResponseDto[]> {
    const customTemplates = await this.templateRepo.find({
      where: { workspaceId },
    });

    const customMap = new Map(
      customTemplates.map((t) => [t.templateType, t]),
    );

    const results: EmailTemplateResponseDto[] = [];

    for (const templateType of ALL_TEMPLATE_TYPES) {
      const custom = customMap.get(templateType);
      if (custom) {
        results.push(EmailTemplateResponseDto.fromEntity(custom));
      } else {
        const defaultTmpl = getDefaultTemplate(templateType);
        results.push(
          EmailTemplateResponseDto.fromDefaultTemplate(
            workspaceId,
            templateType,
            defaultTmpl.subject,
            defaultTmpl.bodyHtml,
            defaultTmpl.bodyText,
          ),
        );
      }
    }

    return results;
  }

  async getTemplateByType(
    workspaceId: string,
    templateType: WhiteLabelEmailTemplateType,
  ): Promise<EmailTemplateResponseDto> {
    const cacheKey = `${CACHE_PREFIX_SINGLE}${workspaceId}:${templateType}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Fall through to DB
      }
    }

    const custom = await this.templateRepo.findOne({
      where: { workspaceId, templateType },
    });

    let result: EmailTemplateResponseDto;
    if (custom) {
      result = EmailTemplateResponseDto.fromEntity(custom);
    } else {
      const defaultTmpl = getDefaultTemplate(templateType);
      result = EmailTemplateResponseDto.fromDefaultTemplate(
        workspaceId,
        templateType,
        defaultTmpl.subject,
        defaultTmpl.bodyHtml,
        defaultTmpl.bodyText,
      );
    }

    await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
    return result;
  }

  async upsertTemplate(
    workspaceId: string,
    dto: UpdateEmailTemplateDto,
    actorId: string,
  ): Promise<WhiteLabelEmailTemplate> {
    await this.validateAccess(workspaceId, actorId);

    const sanitizedHtml = this.sanitizeHtml(dto.bodyHtml);
    const sanitizedSubject = this.sanitizeSubject(dto.subject);

    let template = await this.templateRepo.findOne({
      where: { workspaceId, templateType: dto.templateType },
    });

    if (template) {
      template.subject = sanitizedSubject;
      template.bodyHtml = sanitizedHtml;
      template.bodyText = dto.bodyText ?? null;
      template.isCustom = true;
    } else {
      template = this.templateRepo.create({
        workspaceId,
        templateType: dto.templateType,
        subject: sanitizedSubject,
        bodyHtml: sanitizedHtml,
        bodyText: dto.bodyText ?? null,
        isCustom: true,
        createdBy: actorId,
      });
    }

    template = await this.templateRepo.save(template);
    await this.invalidateCache(workspaceId);

    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'white_label_email_template',
        template.id,
        { action: 'white_label.email_template.upserted', templateType: dto.templateType },
      )
      .catch((err) => {
        this.logger.warn(`Failed to log audit event: ${err.message}`);
      });

    return template;
  }

  async resetTemplate(
    workspaceId: string,
    templateType: WhiteLabelEmailTemplateType,
    actorId: string,
  ): Promise<void> {
    await this.validateAccess(workspaceId, actorId);

    const template = await this.templateRepo.findOne({
      where: { workspaceId, templateType },
    });

    if (!template) {
      throw new NotFoundException(`No custom template found for type ${templateType}`);
    }

    await this.templateRepo.remove(template);
    await this.invalidateCache(workspaceId);

    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.DELETE,
        'white_label_email_template',
        template.id,
        { action: 'white_label.email_template.reset', templateType },
      )
      .catch((err) => {
        this.logger.warn(`Failed to log audit event: ${err.message}`);
      });
  }

  async sendTestEmail(
    workspaceId: string,
    dto: SendTestEmailDto,
    actorId: string,
  ): Promise<{ success: boolean; messageId?: string }> {
    await this.validateAccess(workspaceId, actorId);

    const { subject, html, text } = await this.renderTemplate(
      workspaceId,
      dto.templateType,
      this.getSampleData(dto.templateType),
    );

    try {
      const result = await this.emailNotificationService.sendTransactional(
        dto.email,
        'test-email' as any,
        {
          ...this.getSampleData(dto.templateType),
          customSubject: subject,
          customHtml: html,
          customText: text,
        },
      );

      this.auditService
        .log(
          workspaceId,
          actorId,
          AuditAction.CREATE,
          'white_label_email_template',
          'test-email',
          { action: 'white_label.email_template.test_sent', templateType: dto.templateType, email: dto.email },
        )
        .catch((err) => {
          this.logger.warn(`Failed to log audit event: ${err.message}`);
        });

      return { success: result.sent, messageId: result.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send test email: ${error.message}`);
      return { success: false };
    }
  }

  async renderTemplate(
    workspaceId: string,
    templateType: WhiteLabelEmailTemplateType,
    variables: Record<string, any>,
  ): Promise<{ subject: string; html: string; text: string }> {
    const whiteLabelContext = await this.buildWhiteLabelContext(workspaceId);
    const mergedVariables = { ...whiteLabelContext, ...variables };

    const customTemplate = await this.templateRepo.findOne({
      where: { workspaceId, templateType },
    });

    let subject: string;
    let bodyHtml: string;
    let bodyText: string;

    if (customTemplate) {
      subject = customTemplate.subject;
      bodyHtml = customTemplate.bodyHtml;
      bodyText = customTemplate.bodyText ?? '';
    } else {
      const defaultTmpl = getDefaultTemplate(templateType);
      subject = defaultTmpl.subject;
      bodyHtml = defaultTmpl.bodyHtml;
      bodyText = defaultTmpl.bodyText;
    }

    return {
      subject: this.interpolateVariables(subject, mergedVariables),
      html: this.interpolateVariables(bodyHtml, mergedVariables),
      text: this.interpolateVariables(bodyText, mergedVariables),
    };
  }

  private sanitizeHtml(html: string): string {
    let sanitized = html;

    sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '');
    sanitized = sanitized.replace(/javascript\s*:/gi, '');
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
    sanitized = sanitized.replace(/<object[\s\S]*?<\/object>/gi, '');
    sanitized = sanitized.replace(/<embed[\s\S]*?>/gi, '');
    sanitized = sanitized.replace(/url\s*\(\s*data\s*:(?!image\/)/gi, 'url(blocked:');
    sanitized = sanitized.replace(/expression\s*\(/gi, '');
    sanitized = sanitized.replace(/-moz-binding\s*:/gi, '');

    if (sanitized !== html) {
      this.logger.log('HTML sanitization applied - content was modified');
    }

    return sanitized;
  }

  private sanitizeSubject(subject: string): string {
    return subject.replace(/[\r\n]/g, ' ').trim();
  }

  private interpolateVariables(
    content: string,
    variables: Record<string, any>,
  ): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      if (ALLOWED_VARIABLES.includes(varName)) {
        const value = variables[varName];
        if (value !== undefined && value !== null) {
          return this.escapeHtml(String(value));
        }
      }
      return match;
    });
  }

  private escapeHtml(str: string): string {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private async validateAccess(workspaceId: string, actorId: string): Promise<void> {
    await this.validateWorkspaceMembership(workspaceId, actorId);

    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId: actorId },
    });

    if (!member || (member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN)) {
      throw new ForbiddenException('Only workspace owners and admins can manage email templates');
    }
  }

  async validateWorkspaceMembership(workspaceId: string, userId: string): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId },
    });

    if (!member) {
      throw new ForbiddenException('Not a member of this workspace');
    }
  }

  private async buildWhiteLabelContext(workspaceId: string): Promise<Record<string, any>> {
    const config = await this.whiteLabelConfigRepo.findOne({
      where: { workspaceId },
    });

    const baseUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');

    return {
      app_name: config?.appName ?? 'DevOS',
      logo_url: config?.logoUrl ?? `${baseUrl}/logo.png`,
      primary_color: config?.primaryColor ?? '#6366F1',
      date: new Date().toLocaleDateString(),
      year: new Date().getFullYear().toString(),
      unsubscribe_url: `${baseUrl}/settings/email-preferences`,
    };
  }

  private getSampleData(templateType: WhiteLabelEmailTemplateType): Record<string, any> {
    const baseData = {
      user_name: 'John Doe',
      user_email: 'john@example.com',
      workspace_name: 'Acme Workspace',
      action_url: 'https://example.com/action',
      date: new Date().toLocaleDateString(),
      year: new Date().getFullYear().toString(),
      unsubscribe_url: '#',
    };

    switch (templateType) {
      case WhiteLabelEmailTemplateType.INVITATION:
        return { ...baseData, role: 'Developer' };
      case WhiteLabelEmailTemplateType.DEPLOYMENT:
        return {
          ...baseData,
          project_name: 'Mobile App',
          environment: 'staging',
          status: 'succeeded',
          alert_class: 'success',
          error_message: '',
        };
      case WhiteLabelEmailTemplateType.COST_ALERT:
        return {
          ...baseData,
          current_spend: '45.67',
          limit: '100.00',
          percentage: '45',
          alert_class: 'warning',
          is_over_limit: false,
        };
      case WhiteLabelEmailTemplateType.WEEKLY_DIGEST:
        return {
          ...baseData,
          stories_completed: 12,
          agent_hours: 24.5,
          total_cost: '15.30',
        };
      default:
        return baseData;
    }
  }

  private async invalidateCache(workspaceId: string): Promise<void> {
    await this.redisService.del(`${CACHE_PREFIX_ALL}${workspaceId}`);
    for (const type of ALL_TEMPLATE_TYPES) {
      await this.redisService.del(`${CACHE_PREFIX_SINGLE}${workspaceId}:${type}`);
    }
  }
}
