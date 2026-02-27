/**
 * OutgoingWebhookController
 * Story 21-8: Webhook Management (AC8)
 *
 * REST controller for webhook management endpoints.
 * All endpoints require workspace admin or owner role.
 */

import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, Req, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../../shared/guards/workspace-access.guard';
import { RoleGuard } from '../../../../common/guards/role.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { WorkspaceRole } from '../../../../database/entities/workspace-member.entity';
import { OutgoingWebhookService } from '../services/outgoing-webhook.service';
import {
  CreateWebhookDto, UpdateWebhookDto, WebhookResponseDto,
  WebhookCreatedResponseDto, DeliveryLogQueryDto,
  DeliveryLogResponseDto, TestWebhookDto,
} from '../dto/webhook.dto';

@ApiTags('Webhooks')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/webhooks')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class OutgoingWebhookController {
  constructor(
    private readonly outgoingWebhookService: OutgoingWebhookService,
  ) {}

  /**
   * GET /api/v1/workspaces/:workspaceId/webhooks
   * List all webhooks for the workspace.
   */
  @Get()
  @UseGuards(RoleGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  async listWebhooks(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<WebhookResponseDto[]> {
    return this.outgoingWebhookService.listWebhooks(workspaceId);
  }

  /**
   * POST /api/v1/workspaces/:workspaceId/webhooks
   * Create a new outgoing webhook.
   */
  @Post()
  @UseGuards(RoleGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  async createWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateWebhookDto,
    @Req() req: Request,
  ): Promise<WebhookCreatedResponseDto> {
    const userId = (req as any).user?.id;
    const { webhook, secret } = await this.outgoingWebhookService.createWebhook(
      workspaceId, dto, userId,
    );
    return { ...webhook, secret };
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/webhooks/:webhookId
   * Get a single webhook by ID.
   */
  @Get(':webhookId')
  @UseGuards(RoleGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  async getWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
  ): Promise<WebhookResponseDto> {
    return this.outgoingWebhookService.getWebhook(workspaceId, webhookId);
  }

  /**
   * PUT /api/v1/workspaces/:workspaceId/webhooks/:webhookId
   * Update webhook configuration.
   */
  @Put(':webhookId')
  @UseGuards(RoleGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  async updateWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Body() dto: UpdateWebhookDto,
  ): Promise<WebhookResponseDto> {
    return this.outgoingWebhookService.updateWebhook(workspaceId, webhookId, dto);
  }

  /**
   * DELETE /api/v1/workspaces/:workspaceId/webhooks/:webhookId
   * Delete a webhook and all its delivery logs.
   */
  @Delete(':webhookId')
  @HttpCode(204)
  @UseGuards(RoleGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  async deleteWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
  ): Promise<void> {
    return this.outgoingWebhookService.deleteWebhook(workspaceId, webhookId);
  }

  /**
   * POST /api/v1/workspaces/:workspaceId/webhooks/:webhookId/test
   * Send a test payload to a webhook.
   */
  @Post(':webhookId/test')
  @UseGuards(RoleGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  async testWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Body() dto: TestWebhookDto,
  ): Promise<DeliveryLogResponseDto> {
    return this.outgoingWebhookService.testWebhook(workspaceId, webhookId, dto);
  }

  /**
   * POST /api/v1/workspaces/:workspaceId/webhooks/:webhookId/rotate-secret
   * Rotate the HMAC signing secret for a webhook.
   */
  @Post(':webhookId/rotate-secret')
  @UseGuards(RoleGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  async rotateSecret(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
  ): Promise<{ secret: string }> {
    return this.outgoingWebhookService.rotateSecret(workspaceId, webhookId);
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/webhooks/:webhookId/deliveries
   * Get delivery logs for a webhook with pagination.
   */
  @Get(':webhookId/deliveries')
  @UseGuards(RoleGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  async getDeliveryLogs(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Query() query: DeliveryLogQueryDto,
  ): Promise<{ items: DeliveryLogResponseDto[]; total: number }> {
    return this.outgoingWebhookService.getDeliveryLogs(workspaceId, webhookId, query);
  }

  /**
   * POST /api/v1/workspaces/:workspaceId/webhooks/:webhookId/deliveries/:deliveryId/retry
   * Retry a specific failed delivery.
   */
  @Post(':webhookId/deliveries/:deliveryId/retry')
  @UseGuards(RoleGuard)
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  async retryDelivery(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ): Promise<DeliveryLogResponseDto> {
    return this.outgoingWebhookService.retryDelivery(workspaceId, webhookId, deliveryId);
  }
}
