/**
 * Template Update Controller
 *
 * Story 19-7: Template Versioning
 *
 * API endpoints for project-template update detection and management.
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TemplateUpdateService } from '../services/template-update.service';
import { DismissUpdateDto } from '../dto/dismiss-update.dto';
import {
  TemplateUpdateStatusDto,
  ProjectTemplateVersionDto,
} from '../dto/template-version-response.dto';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    id?: string;
    [key: string]: any;
  };
}

@ApiTags('Template Updates')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/projects')
@UseGuards(JwtAuthGuard)
export class TemplateUpdateController {
  constructor(private readonly updateService: TemplateUpdateService) {}

  @Get(':projectId/template-version')
  @ApiOperation({ summary: "Get project's template version information" })
  @ApiParam({ name: 'projectId', description: 'Project ID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Template version information',
    type: ProjectTemplateVersionDto,
  })
  @ApiResponse({ status: 404, description: 'Project or template version record not found' })
  async getProjectTemplateVersion(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectTemplateVersionDto> {
    return this.updateService.getUpdateStatus(projectId);
  }

  @Post(':projectId/template-version/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check for template updates' })
  @ApiParam({ name: 'projectId', description: 'Project ID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Update check result',
    type: TemplateUpdateStatusDto,
  })
  @ApiResponse({ status: 404, description: 'Project or template version record not found' })
  async checkForUpdates(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<TemplateUpdateStatusDto> {
    return this.updateService.checkForUpdates(projectId);
  }

  @Post(':projectId/template-version/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dismiss a template update notification' })
  @ApiParam({ name: 'projectId', description: 'Project ID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Update dismissed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid version format' })
  @ApiResponse({ status: 404, description: 'Project or template version record not found' })
  async dismissUpdate(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: DismissUpdateDto,
  ): Promise<void> {
    await this.updateService.dismissUpdate(projectId, dto.version);
  }

  @Delete(':projectId/template-version/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear dismissed update to re-show notification' })
  @ApiParam({ name: 'projectId', description: 'Project ID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Dismissed update cleared' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async clearDismissedUpdate(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<void> {
    await this.updateService.clearDismissedUpdate(projectId);
  }
}
