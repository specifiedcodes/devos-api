/**
 * JiraWebhookController
 * Story 21.6: Jira Two-Way Sync (AC5)
 *
 * Controller handling incoming Jira webhooks for real-time sync updates,
 * with async processing via BullMQ.
 */

import {
  Controller,
  Post,
  Headers,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Request } from 'express';
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';
import { JiraSyncItem } from '../../../../database/entities/jira-sync-item.entity';
import { JiraWebhookPayload } from '../dto/jira-integration.dto';

@ApiTags('Jira Webhooks')
@Controller('api/integrations/jira/webhooks')
export class JiraWebhookController {
  private readonly logger = new Logger(JiraWebhookController.name);

  constructor(
    @InjectRepository(JiraIntegration)
    private readonly integrationRepo: Repository<JiraIntegration>,
    @InjectRepository(JiraSyncItem)
    private readonly syncItemRepo: Repository<JiraSyncItem>,
    @InjectQueue('jira-sync')
    private readonly syncQueue: Queue,
  ) {}

  /**
   * POST /api/integrations/jira/webhooks
   * Receives webhook events from Jira.
   * No auth guard (public endpoint).
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Jira webhook events' })
  async handleWebhook(
    @Headers('x-atlassian-webhook-identifier') webhookIdentifier: string,
    @Body() body: JiraWebhookPayload,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ success: boolean }> {
    // Find integration by matching project key from issue key or cloud_id
    const integration = await this.findIntegrationForWebhook(body);
    if (!integration) {
      // Silent ignore - don't leak info about which integrations we support
      this.logger.log('No integration found for webhook');
      return { success: true };
    }

    // Process the webhook asynchronously
    this.logger.log(`Received Jira webhook: event=${body.webhookEvent}`);

    const webhookEvent = body.webhookEvent;

    if (webhookEvent === 'jira:issue_updated' || webhookEvent === 'jira:issue_created') {
      const issueId = body.issue?.id;
      const issueKey = body.issue?.key;

      if (!issueId || !issueKey) {
        return { success: true };
      }

      // For issue_created, only queue if bidirectional
      if (webhookEvent === 'jira:issue_created' && integration.syncDirection === 'devos_to_jira') {
        this.logger.log('Skipping Jira issue create webhook: sync direction is devos_to_jira');
        return { success: true };
      }

      await this.syncQueue.add('sync-from-jira', {
        type: 'jira_to_devos',
        integrationId: integration.id,
        workspaceId: integration.workspaceId,
        jiraIssueId: issueId,
        webhookEvent: {
          webhookEvent,
          changelog: body.changelog ? {
            items: body.changelog.items.map((item) => ({
              field: item.field,
              fromString: item.fromString,
              toString: item.toString,
            })),
          } : undefined,
          issue: body.issue,
        },
      });
    } else if (webhookEvent === 'jira:issue_deleted') {
      // Unlink sync item
      const issueId = body.issue?.id;
      if (issueId) {
        const syncItem = await this.syncItemRepo.findOne({
          where: { jiraIntegrationId: integration.id, jiraIssueId: issueId },
        });
        if (syncItem) {
          await this.syncItemRepo.remove(syncItem);
          this.logger.log(`Unlinked sync item for deleted Jira issue ${issueId}`);
        }
      }
    }
    // comment_created, comment_updated - logged but not erroring

    return { success: true };
  }

  /**
   * Find the integration that matches a webhook payload.
   * Matches by extracting project key from issue key in the payload.
   */
  private async findIntegrationForWebhook(
    body: JiraWebhookPayload,
  ): Promise<JiraIntegration | null> {
    if (body.issue?.key) {
      // Extract project key from issue key (e.g., "PROJ-123" -> "PROJ")
      const projectKey = body.issue.key.split('-')[0];
      const integration = await this.integrationRepo.findOne({
        where: { jiraProjectKey: projectKey, isActive: true },
      });
      if (integration) return integration;
    }

    // Fallback: try first active integration
    const integrations = await this.integrationRepo.find({
      where: { isActive: true },
    });
    return integrations[0] || null;
  }
}
