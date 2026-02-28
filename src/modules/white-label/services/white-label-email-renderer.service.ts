/**
 * White-Label Email Renderer Service
 * Story 22-2: White-Label Email Templates (AC5)
 *
 * Renders emails with white-label support, falling back to default templates
 * when no white-label configuration exists.
 */

import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhiteLabelEmailTemplateService } from './white-label-email-template.service';
import { WhiteLabelEmailTemplateType } from '../../../database/entities/white-label-email-template.entity';
import { WhiteLabelService } from '../white-label.service';
import { EmailTemplateService, EmailTemplate } from '../../email/services/email-template.service';
import { WhiteLabelConfig } from '../../../database/entities/white-label-config.entity';

@Injectable()
export class WhiteLabelEmailRendererService {
  constructor(
    @Inject(forwardRef(() => WhiteLabelEmailTemplateService))
    private readonly templateService: WhiteLabelEmailTemplateService,
    @Inject(forwardRef(() => WhiteLabelService))
    private readonly whiteLabelService: WhiteLabelService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly configService: ConfigService,
  ) {}

  async renderEmailForWorkspace(
    workspaceId: string,
    templateType: WhiteLabelEmailTemplateType,
    data: Record<string, any>,
  ): Promise<{ subject: string; html: string; text: string }> {
    const hasWhiteLabel = await this.hasWhiteLabelEmail(workspaceId);

    if (hasWhiteLabel) {
      return this.templateService.renderTemplate(workspaceId, templateType, data);
    }

    const defaultTemplate = this.mapToDefaultTemplate(templateType);
    if (defaultTemplate) {
      return this.emailTemplateService.render(defaultTemplate, data);
    }

    return this.templateService.renderTemplate(workspaceId, templateType, data);
  }

  private async hasWhiteLabelEmail(workspaceId: string): Promise<boolean> {
    const config = await this.whiteLabelService.getConfig(workspaceId);
    return config?.isActive === true;
  }

  private mapToDefaultTemplate(
    templateType: WhiteLabelEmailTemplateType,
  ): EmailTemplate | null {
    const mapping: Partial<Record<WhiteLabelEmailTemplateType, EmailTemplate>> = {
      [WhiteLabelEmailTemplateType.INVITATION]: EmailTemplate.WORKSPACE_INVITATION,
      [WhiteLabelEmailTemplateType.PASSWORD_RESET]: EmailTemplate.PASSWORD_RESET,
      [WhiteLabelEmailTemplateType.TWO_FA_SETUP]: EmailTemplate.TWO_FA_BACKUP_CODES,
      [WhiteLabelEmailTemplateType.COST_ALERT]: EmailTemplate.COST_ALERT,
      [WhiteLabelEmailTemplateType.WEEKLY_DIGEST]: EmailTemplate.WEEKLY_SUMMARY,
      [WhiteLabelEmailTemplateType.DEPLOYMENT]: EmailTemplate.DEPLOYMENT_SUCCESS,
    };

    return mapping[templateType] ?? null;
  }

  async buildWhiteLabelContext(workspaceId: string): Promise<Record<string, any>> {
    const config = await this.whiteLabelService.getConfig(workspaceId);
    const baseUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');

    if (!config) {
      return {
        app_name: 'DevOS',
        logo_url: `${baseUrl}/logo.png`,
        primary_color: '#6366F1',
        date: new Date().toLocaleDateString(),
        year: new Date().getFullYear().toString(),
        unsubscribe_url: `${baseUrl}/settings/email-preferences`,
      };
    }

    return {
      app_name: config.appName,
      logo_url: config.logoUrl ?? `${baseUrl}/logo.png`,
      primary_color: config.primaryColor,
      date: new Date().toLocaleDateString(),
      year: new Date().getFullYear().toString(),
      unsubscribe_url: `${baseUrl}/settings/email-preferences`,
    };
  }
}
