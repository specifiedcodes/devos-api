/**
 * ProjectFilesController
 * Story 16.2: File Upload/Download API (AC5)
 *
 * REST API endpoints for file upload, download, listing,
 * metadata update, soft-delete, and storage usage.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../common/guards/role.guard';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { ProjectFilesService } from './project-files.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { ListFilesQueryDto } from './dto/list-files-query.dto';
import { FileResponseDto } from './dto/file-response.dto';

@Controller('api/v1/workspaces/:workspaceId/projects/:projectId/files')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiBearerAuth('JWT-auth')
@ApiTags('File Storage')
export class ProjectFilesController {
  constructor(private readonly projectFilesService: ProjectFilesService) {}

  /**
   * Get storage usage stats for a project.
   *
   * IMPORTANT: This static route MUST be declared before :fileId
   * parameterized routes to prevent NestJS from matching "storage-usage"
   * as a fileId parameter.
   */
  @Get('storage-usage')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get storage usage stats for a project' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Storage usage stats',
    schema: {
      type: 'object',
      properties: {
        totalFiles: { type: 'number', example: 42 },
        totalSizeBytes: { type: 'number', example: 104857600 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async getStorageUsage(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.projectFilesService.getStorageUsage(workspaceId, projectId);
  }

  /**
   * Upload a file to a project.
   */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  }))
  @ApiOperation({ summary: 'Upload a file to a project' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'path'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'The file to upload (max 100MB)',
        },
        path: {
          type: 'string',
          description: 'Destination path within project',
          example: '/docs',
        },
        description: {
          type: 'string',
          description: 'Optional file description',
          example: 'API design specification',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    type: FileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid file or parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires Developer role or higher' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async uploadFile(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.projectFilesService.uploadFile(
      req.user.id,
      workspaceId,
      projectId,
      file,
      dto,
    );
  }

  /**
   * List files in a project with pagination and filters.
   */
  @Get()
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'List files in a project' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of files',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async listFiles(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListFilesQueryDto,
  ) {
    return this.projectFilesService.listFiles(workspaceId, projectId, query);
  }

  /**
   * Get file metadata with a signed download URL.
   */
  @Get(':fileId')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Get file metadata' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'fileId', description: 'File ID' })
  @ApiResponse({
    status: 200,
    description: 'File metadata with signed download URL',
    type: FileResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFile(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.projectFilesService.getFile(workspaceId, projectId, fileId);
  }

  /**
   * Download file content directly.
   */
  @Get(':fileId/download')
  @RequireRole(WorkspaceRole.VIEWER, WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Download file content' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'fileId', description: 'File ID' })
  @ApiResponse({
    status: 200,
    description: 'File content with appropriate Content-Type header',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async downloadFile(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { buffer, filename, mimeType } = await this.projectFilesService.downloadFile(
      workspaceId,
      projectId,
      fileId,
      req.user?.id,
    );

    // Sanitize filename for Content-Disposition header to prevent header injection
    // Replace quotes and non-ASCII characters for safe inline use
    const safeFilename = filename.replace(/["\\\r\n]/g, '_');
    // RFC 5987 encoding for non-ASCII filenames
    const encodedFilename = encodeURIComponent(filename).replace(/'/g, '%27');

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
      'Content-Length': buffer.length.toString(),
    });

    res.send(buffer);
  }

  /**
   * Update file metadata (description, path).
   */
  @Patch(':fileId')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Update file metadata' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'fileId', description: 'File ID' })
  @ApiResponse({
    status: 200,
    description: 'File metadata updated',
    type: FileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires Developer role or higher' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 409, description: 'Conflict - file at new path already exists' })
  async updateFile(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() dto: UpdateFileDto,
    @Req() req: any,
  ) {
    return this.projectFilesService.updateFile(
      workspaceId,
      projectId,
      fileId,
      dto,
      req.user?.id,
    );
  }

  /**
   * Soft-delete a file.
   */
  @Delete(':fileId')
  @RequireRole(WorkspaceRole.DEVELOPER, WorkspaceRole.ADMIN, WorkspaceRole.OWNER)
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft delete a file' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'fileId', description: 'File ID' })
  @ApiResponse({ status: 204, description: 'File deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires Developer role or higher' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFile(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Req() req: any,
  ) {
    await this.projectFilesService.deleteFile(
      req.user.id,
      workspaceId,
      projectId,
      fileId,
    );
  }
}
