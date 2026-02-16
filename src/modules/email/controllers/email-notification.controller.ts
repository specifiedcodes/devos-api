/**
 * EmailNotificationController
 * Story 16.6: Production Email Service (AC8)
 *
 * REST API endpoints for email configuration, bounce management,
 * and send log viewing.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  Logger,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailNotificationService } from '../services/email-notification.service';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { EmailConfiguration } from '../../../database/entities/email-configuration.entity';
import { EmailBounce } from '../../../database/entities/email-bounce.entity';
import { EmailSendLog } from '../../../database/entities/email-send-log.entity';
import {
  ConfigureEmailDto,
  UpdateEmailConfigDto,
  TestEmailDto,
  EmailConfigurationStatusDto,
  EmailBounceDto,
  EmailSendLogDto,
} from '../dto/email-notification.dto';

@Controller('api/integrations/email')
@ApiTags('integrations')
@ApiBearerAuth()
export class EmailNotificationController {
  private readonly logger = new Logger(EmailNotificationController.name);

  constructor(
    private readonly emailService: EmailNotificationService,
    private readonly encryptionService: EncryptionService,
    @InjectRepository(EmailConfiguration)
    private readonly emailConfigRepo: Repository<EmailConfiguration>,
    @InjectRepository(EmailBounce)
    private readonly emailBounceRepo: Repository<EmailBounce>,
    @InjectRepository(EmailSendLog)
    private readonly emailSendLogRepo: Repository<EmailSendLog>,
  ) {}

  /**
   * POST /api/integrations/email/configure?workspaceId=...
   * Configure email provider for a workspace.
   */
  @Post('configure')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Configure email provider for workspace' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 201, description: 'Email configured successfully' })
  @ApiResponse({ status: 400, description: 'Invalid provider' })
  @ApiResponse({ status: 409, description: 'Configuration already exists' })
  async configure(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() body: ConfigureEmailDto,
    @Request() req: any,
  ): Promise<EmailConfigurationStatusDto> {
    const userId = req.user.sub || req.user.userId || req.user.id;

    // Check for existing config
    const existing = await this.emailConfigRepo.findOne({ where: { workspaceId } });
    if (existing) {
      throw new ConflictException('Email configuration already exists for this workspace');
    }

    // Provider validation is handled by @IsIn decorator on ConfigureEmailDto

    // Encrypt sensitive fields
    let smtpPass: string | undefined;
    let smtpPassIv: string | undefined;
    let apiKey: string | undefined;
    let apiKeyIv: string | undefined;

    if (body.smtpPass) {
      smtpPass = this.encryptionService.encrypt(body.smtpPass);
      smtpPassIv = 'embedded';
    }
    if (body.apiKey) {
      apiKey = this.encryptionService.encrypt(body.apiKey);
      apiKeyIv = 'embedded';
    }

    const config = this.emailConfigRepo.create({
      workspaceId,
      provider: body.provider,
      smtpHost: body.smtpHost,
      smtpPort: body.smtpPort || 587,
      smtpUser: body.smtpUser,
      smtpPass,
      smtpPassIv,
      apiKey,
      apiKeyIv,
      fromAddress: body.fromAddress || 'noreply@devos.app',
      fromName: body.fromName || 'DevOS',
      replyTo: body.replyTo || 'support@devos.app',
      connectedBy: userId,
      status: 'active',
      rateLimitPerHour: 100,
      totalSent: 0,
      totalBounced: 0,
      totalComplaints: 0,
    });

    const saved = await this.emailConfigRepo.save(config);

    return this.toStatusDto(saved);
  }

  /**
   * GET /api/integrations/email/status?workspaceId=...
   * Get email configuration status for a workspace (no sensitive fields).
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get email configuration status' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Configuration status returned' })
  @ApiResponse({ status: 404, description: 'No configuration found' })
  async getStatus(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<EmailConfigurationStatusDto> {
    const config = await this.emailService.getConfiguration(workspaceId);
    if (!config) {
      throw new NotFoundException('No email configuration found for this workspace');
    }

    return this.toStatusDto(config);
  }

  /**
   * PUT /api/integrations/email/config?workspaceId=...
   * Update email configuration (partial update).
   */
  @Put('config')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update email configuration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Configuration updated' })
  async updateConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() body: UpdateEmailConfigDto,
  ): Promise<EmailConfigurationStatusDto> {
    const config = await this.emailConfigRepo.findOne({ where: { workspaceId } });
    if (!config) {
      throw new NotFoundException('No email configuration found for this workspace');
    }

    const updateData: Partial<EmailConfiguration> = {};
    if (body.fromAddress !== undefined) updateData.fromAddress = body.fromAddress;
    if (body.fromName !== undefined) updateData.fromName = body.fromName;
    if (body.replyTo !== undefined) updateData.replyTo = body.replyTo;
    if (body.rateLimitPerHour !== undefined) updateData.rateLimitPerHour = body.rateLimitPerHour;

    if (Object.keys(updateData).length > 0) {
      await this.emailConfigRepo.update({ workspaceId }, updateData);
    }

    // Invalidate cache
    await this.emailService.invalidateCache(workspaceId);

    const updated = await this.emailConfigRepo.findOne({ where: { workspaceId } });
    return this.toStatusDto(updated!);
  }

  /**
   * POST /api/integrations/email/test?workspaceId=...
   * Send a test email to verify configuration.
   */
  @Post('test')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send test email' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Test email result' })
  async testEmail(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() body: TestEmailDto,
  ): Promise<{ success: boolean; error?: string }> {
    const config = await this.emailService.getConfiguration(workspaceId);
    if (!config) {
      throw new BadRequestException('No email configuration found for this workspace');
    }

    return this.emailService.testConfiguration(workspaceId, body.testEmail);
  }

  /**
   * DELETE /api/integrations/email?workspaceId=...
   * Remove email configuration for a workspace.
   */
  @Delete()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove email configuration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 204, description: 'Configuration removed' })
  async removeConfiguration(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<void> {
    await this.emailConfigRepo.delete({ workspaceId });
    await this.emailService.invalidateCache(workspaceId);
  }

  /**
   * GET /api/integrations/email/bounces?workspaceId=...&page=1&limit=20
   * List bounced email addresses for a workspace.
   */
  @Get('bounces')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List bounced email addresses' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Bounce list returned' })
  async listBounces(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ): Promise<{ bounces: EmailBounceDto[]; total: number; page: number; limit: number }> {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [bounces, total] = await this.emailBounceRepo.findAndCount({
      where: { workspaceId },
      order: { bouncedAt: 'DESC' },
      skip,
      take,
    });

    return {
      bounces: bounces.map(b => ({
        emailAddress: b.emailAddress,
        bounceType: b.bounceType,
        bounceReason: b.bounceReason,
        originalTemplate: b.originalTemplate,
        bouncedAt: b.bouncedAt,
      })),
      total,
      page: Number(page),
      limit: Number(limit),
    };
  }

  /**
   * DELETE /api/integrations/email/bounces/:emailAddress?workspaceId=...
   * Clear a bounce for an email address.
   */
  @Delete('bounces/:emailAddress')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear bounce for email address' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 204, description: 'Bounce cleared' })
  async clearBounce(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('emailAddress') emailAddress: string,
  ): Promise<void> {
    await this.emailService.clearBounce(workspaceId, emailAddress);
  }

  /**
   * GET /api/integrations/email/logs?workspaceId=...&page=1&limit=20&template=...&status=...
   * List email send logs with filtering.
   */
  @Get('logs')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List email send logs' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'template', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Send logs returned' })
  async listSendLogs(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('template') template?: string,
    @Query('status') status?: string,
  ): Promise<{ logs: EmailSendLogDto[]; total: number; page: number; limit: number }> {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const qb = this.emailSendLogRepo.createQueryBuilder('log')
      .where('log.workspace_id = :workspaceId', { workspaceId });

    if (template) {
      qb.andWhere('log.template = :template', { template });
    }
    if (status) {
      qb.andWhere('log.status = :status', { status });
    }

    qb.orderBy('log.created_at', 'DESC')
      .skip(skip)
      .take(take);

    const [logs, total] = await qb.getManyAndCount();

    return {
      logs: logs.map(l => ({
        id: l.id,
        recipientEmail: l.recipientEmail,
        template: l.template,
        subject: l.subject,
        status: l.status,
        messageId: l.messageId,
        errorMessage: l.errorMessage,
        sentAt: l.sentAt || undefined,
        createdAt: l.createdAt,
      })),
      total,
      page: Number(page),
      limit: Number(limit),
    };
  }

  /**
   * Convert entity to status DTO (strips sensitive fields).
   */
  private toStatusDto(config: EmailConfiguration): EmailConfigurationStatusDto {
    return {
      id: config.id,
      provider: config.provider,
      fromAddress: config.fromAddress,
      fromName: config.fromName,
      replyTo: config.replyTo,
      status: config.status,
      rateLimitPerHour: config.rateLimitPerHour,
      totalSent: config.totalSent,
      totalBounced: config.totalBounced,
      lastSentAt: config.lastSentAt || undefined,
      createdAt: config.createdAt,
    };
  }
}
