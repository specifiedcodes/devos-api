/**
 * White-Label Email Template Controller
 * Story 22-2: White-Label Email Templates (AC4)
 *
 * REST API endpoints for managing white-label email templates.
 */

import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../common/guards/role.guard';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { WhiteLabelEmailTemplateService } from './services/white-label-email-template.service';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { EmailTemplateResponseDto } from './dto/email-template-response.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { WhiteLabelEmailTemplateType } from '../../database/entities/white-label-email-template.entity';

@ApiTags('White-Label')
@ApiBearerAuth('JWT-auth')
@Controller('api/workspaces/:workspaceId/white-label/email-templates')
@UseGuards(JwtAuthGuard)
export class WhiteLabelEmailTemplateController {
  constructor(
    private readonly emailTemplateService: WhiteLabelEmailTemplateService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all email templates for workspace' })
  @ApiResponse({ status: 200, description: 'List of email templates' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a workspace member' })
  async getTemplates(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: any,
  ): Promise<EmailTemplateResponseDto[]> {
    await this.emailTemplateService.validateWorkspaceMembership(workspaceId, req.user.id);
    return this.emailTemplateService.getTemplates(workspaceId);
  }

  @Get('send-test')
  @ApiOperation({ summary: 'Get send-test endpoint info' })
  @ApiResponse({ status: 200, description: 'Info' })
  getInfo(): { message: string } {
    return { message: 'Use POST to send a test email' };
  }

  @Get(':templateType')
  @ApiOperation({ summary: 'Get a specific email template by type' })
  @ApiResponse({ status: 200, description: 'Email template' })
  @ApiResponse({ status: 400, description: 'Invalid template type' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a workspace member' })
  async getTemplateByType(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('templateType') templateType: string,
    @Req() req: any,
  ): Promise<EmailTemplateResponseDto> {
    await this.emailTemplateService.validateWorkspaceMembership(workspaceId, req.user.id);
    const validType = this.validateTemplateType(templateType);
    return this.emailTemplateService.getTemplateByType(workspaceId, validType);
  }

  @Put()
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @UseGuards(RoleGuard)
  @ApiOperation({ summary: 'Create or update an email template' })
  @ApiResponse({ status: 200, description: 'Email template saved' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 403, description: 'Forbidden - Owner or Admin required' })
  async upsertTemplate(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateEmailTemplateDto,
    @Req() req: any,
  ): Promise<EmailTemplateResponseDto> {
    const template = await this.emailTemplateService.upsertTemplate(
      workspaceId,
      dto,
      req.user.id,
    );
    return EmailTemplateResponseDto.fromEntity(template);
  }

  @Delete(':templateType')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @UseGuards(RoleGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset an email template to default' })
  @ApiResponse({ status: 204, description: 'Template reset to default' })
  @ApiResponse({ status: 400, description: 'Invalid template type' })
  @ApiResponse({ status: 403, description: 'Forbidden - Owner or Admin required' })
  @ApiResponse({ status: 404, description: 'No custom template found' })
  async resetTemplate(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('templateType') templateType: string,
    @Req() req: any,
  ): Promise<void> {
    const validType = this.validateTemplateType(templateType);
    return this.emailTemplateService.resetTemplate(workspaceId, validType, req.user.id);
  }

  @Post('send-test')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @UseGuards(RoleGuard)
  @ApiOperation({ summary: 'Send a test email' })
  @ApiResponse({ status: 200, description: 'Test email sent' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 403, description: 'Forbidden - Owner or Admin required' })
  async sendTestEmail(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: SendTestEmailDto,
    @Req() req: any,
  ): Promise<{ success: boolean; messageId?: string }> {
    return this.emailTemplateService.sendTestEmail(workspaceId, dto, req.user.id);
  }

  private validateTemplateType(type: string): WhiteLabelEmailTemplateType {
    const validTypes = Object.values(WhiteLabelEmailTemplateType);
    if (!validTypes.includes(type as WhiteLabelEmailTemplateType)) {
      throw new BadRequestException(
        `Invalid template type: ${type}. Valid types: ${validTypes.join(', ')}`,
      );
    }
    return type as WhiteLabelEmailTemplateType;
  }
}
