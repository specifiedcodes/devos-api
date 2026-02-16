/**
 * ProjectFilesService
 * Story 16.2: File Upload/Download API (AC4)
 *
 * Service layer for file upload, download, listing, update,
 * soft-delete, and storage usage operations.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ProjectFile } from '../../database/entities/project-file.entity';
import { Project } from '../../database/entities/project.entity';
import { FileStorageService } from '../file-storage/file-storage.service';
import { STORAGE_BUCKETS } from '../file-storage/constants/buckets';
import { BUCKET_CONFIGS } from '../file-storage/constants/buckets';
import { validateMimeType } from '../file-storage/utils/mime-validation';
import { AuditService, AuditAction } from '../../shared/audit/audit.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { ListFilesQueryDto } from './dto/list-files-query.dto';
import { FileResponseDto } from './dto/file-response.dto';
import { sanitizeFilename } from './utils/filename-sanitizer';

/** Maximum file size in bytes (100MB) */
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/** Signed URL expiry time in seconds (1 hour) */
const SIGNED_URL_EXPIRY = 3600;

@Injectable()
export class ProjectFilesService {
  private readonly logger = new Logger(ProjectFilesService.name);

  constructor(
    @InjectRepository(ProjectFile)
    private readonly projectFileRepository: Repository<ProjectFile>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly fileStorageService: FileStorageService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Upload a file to a project.
   */
  async uploadFile(
    userId: string,
    workspaceId: string,
    projectId: string,
    file: Express.Multer.File,
    dto: UploadFileDto,
  ): Promise<FileResponseDto> {
    // Validate project exists and belongs to workspace
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });
    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    // Validate file is present and non-empty
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('File is empty or missing');
    }

    // Validate MIME type
    const bucket = STORAGE_BUCKETS.UPLOADS;
    if (!validateMimeType(bucket, file.mimetype)) {
      const allowedTypes = BUCKET_CONFIGS[bucket].allowedMimeTypes.join(', ');
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed types: ${allowedTypes}`,
      );
    }

    // Validate file size
    if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File size ${file.buffer.length} exceeds maximum allowed size of 100MB`,
      );
    }

    // Sanitize filename
    const sanitizedFilename = sanitizeFilename(file.originalname);

    // Build storage key: {workspaceId}/{projectId}/{uuid}/{filename}
    const fileUuid = randomUUID();
    const storageKey = this.fileStorageService.buildKey(
      workspaceId,
      projectId,
      fileUuid,
      sanitizedFilename,
    );

    // Upload to MinIO
    await this.fileStorageService.upload(bucket, storageKey, file.buffer, {
      contentType: file.mimetype,
    });

    // Create entity
    const projectFile = this.projectFileRepository.create({
      projectId,
      workspaceId,
      filename: sanitizedFilename,
      path: dto.path,
      mimeType: file.mimetype,
      sizeBytes: file.buffer.length,
      storageKey,
      description: dto.description,
      uploadedBy: userId,
    });

    const savedFile = await this.projectFileRepository.save(projectFile);

    // Generate signed URL
    const downloadUrl = await this.fileStorageService.getSignedUrl(
      bucket,
      storageKey,
      SIGNED_URL_EXPIRY,
    );

    // Log audit event (fire and forget)
    this.auditService
      .log(workspaceId, userId, AuditAction.FILE_UPLOADED, 'project_file', savedFile.id, {
        fileId: savedFile.id,
        filename: sanitizedFilename,
        projectId,
        sizeBytes: file.buffer.length,
        mimeType: file.mimetype,
      })
      .catch(() => {});

    return this.toFileResponseDto(savedFile, downloadUrl);
  }

  /**
   * Get file metadata by ID with a fresh signed download URL.
   */
  async getFile(
    workspaceId: string,
    projectId: string,
    fileId: string,
  ): Promise<FileResponseDto> {
    const file = await this.projectFileRepository.findOne({
      where: { id: fileId, projectId, workspaceId },
    });

    if (!file) {
      throw new NotFoundException(`File not found: ${fileId}`);
    }

    const downloadUrl = await this.fileStorageService.getSignedUrl(
      STORAGE_BUCKETS.UPLOADS,
      file.storageKey,
      SIGNED_URL_EXPIRY,
    );

    return this.toFileResponseDto(file, downloadUrl);
  }

  /**
   * Download file content as a buffer.
   */
  async downloadFile(
    workspaceId: string,
    projectId: string,
    fileId: string,
    userId?: string,
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const file = await this.projectFileRepository.findOne({
      where: { id: fileId, projectId, workspaceId },
    });

    if (!file) {
      throw new NotFoundException(`File not found: ${fileId}`);
    }

    const buffer = await this.fileStorageService.download(
      STORAGE_BUCKETS.UPLOADS,
      file.storageKey,
    );

    // Log audit event (fire and forget)
    if (userId) {
      this.auditService
        .log(workspaceId, userId, AuditAction.FILE_DOWNLOADED, 'project_file', file.id, {
          fileId: file.id,
          filename: file.filename,
          projectId,
        })
        .catch(() => {});
    }

    return {
      buffer,
      filename: file.filename,
      mimeType: file.mimeType,
    };
  }

  /**
   * List files with pagination and optional filters.
   */
  async listFiles(
    workspaceId: string,
    projectId: string,
    query: ListFilesQueryDto,
  ): Promise<{
    files: FileResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.projectFileRepository
      .createQueryBuilder('file')
      .where('file.workspaceId = :workspaceId', { workspaceId })
      .andWhere('file.projectId = :projectId', { projectId })
      .andWhere('file.deletedAt IS NULL');

    // Optional filters
    if (query.path) {
      qb.andWhere('file.path = :path', { path: query.path });
    }

    if (query.mimeType) {
      qb.andWhere('file.mimeType = :mimeType', { mimeType: query.mimeType });
    }

    if (query.search) {
      // Escape ILIKE special characters (% and _) to prevent wildcard injection
      const escapedSearch = query.search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      qb.andWhere('file.filename ILIKE :search', { search: `%${escapedSearch}%` });
    }

    qb.orderBy('file.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const [files, total] = await qb.getManyAndCount();

    // Generate signed URLs for all files with concurrency limit
    // Process in batches of 10 to avoid overwhelming MinIO with concurrent requests
    const BATCH_SIZE = 10;
    const filesWithUrls: FileResponseDto[] = [];
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          const downloadUrl = await this.fileStorageService.getSignedUrl(
            STORAGE_BUCKETS.UPLOADS,
            file.storageKey,
            SIGNED_URL_EXPIRY,
          );
          return this.toFileResponseDto(file, downloadUrl);
        }),
      );
      filesWithUrls.push(...batchResults);
    }

    return {
      files: filesWithUrls,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update file metadata (description and/or path).
   */
  async updateFile(
    workspaceId: string,
    projectId: string,
    fileId: string,
    dto: UpdateFileDto,
    userId?: string,
  ): Promise<FileResponseDto> {
    const file = await this.projectFileRepository.findOne({
      where: { id: fileId, projectId, workspaceId },
    });

    if (!file) {
      throw new NotFoundException(`File not found: ${fileId}`);
    }

    const changes: Record<string, any> = {};

    if (dto.description !== undefined) {
      changes.description = { from: file.description, to: dto.description };
      file.description = dto.description;
    }

    if (dto.path !== undefined) {
      // Check uniqueness at the new path
      const existing = await this.projectFileRepository
        .createQueryBuilder('file')
        .where('file.projectId = :projectId', { projectId })
        .andWhere('file.path = :path', { path: dto.path })
        .andWhere('file.filename = :filename', { filename: file.filename })
        .andWhere('file.id != :fileId', { fileId })
        .andWhere('file.deletedAt IS NULL')
        .getOne();

      if (existing) {
        throw new ConflictException(
          `A file named "${file.filename}" already exists at path "${dto.path}"`,
        );
      }

      changes.path = { from: file.path, to: dto.path };
      file.path = dto.path;
    }

    const savedFile = await this.projectFileRepository.save(file);

    const downloadUrl = await this.fileStorageService.getSignedUrl(
      STORAGE_BUCKETS.UPLOADS,
      savedFile.storageKey,
      SIGNED_URL_EXPIRY,
    );

    // Log audit event (fire and forget)
    if (userId) {
      this.auditService
        .log(workspaceId, userId, AuditAction.FILE_UPDATED, 'project_file', fileId, {
          fileId,
          filename: savedFile.filename,
          projectId,
          changes,
        })
        .catch(() => {});
    }

    return this.toFileResponseDto(savedFile, downloadUrl);
  }

  /**
   * Soft-delete a file (sets deletedAt timestamp).
   * Does NOT delete from MinIO - deferred to background cleanup.
   */
  async deleteFile(
    userId: string,
    workspaceId: string,
    projectId: string,
    fileId: string,
  ): Promise<void> {
    const file = await this.projectFileRepository.findOne({
      where: { id: fileId, projectId, workspaceId },
    });

    if (!file) {
      throw new NotFoundException(`File not found: ${fileId}`);
    }

    await this.projectFileRepository.softDelete(fileId);

    // Log audit event (fire and forget)
    this.auditService
      .log(workspaceId, userId, AuditAction.FILE_DELETED, 'project_file', fileId, {
        fileId,
        filename: file.filename,
        projectId,
      })
      .catch(() => {});
  }

  /**
   * Get storage usage stats for a project.
   */
  async getStorageUsage(
    workspaceId: string,
    projectId: string,
  ): Promise<{ totalFiles: number; totalSizeBytes: number }> {
    const result = await this.projectFileRepository
      .createQueryBuilder('file')
      .select('COUNT(file.id)', 'totalFiles')
      .addSelect('COALESCE(SUM(file.sizeBytes), 0)', 'totalSizeBytes')
      .where('file.workspaceId = :workspaceId', { workspaceId })
      .andWhere('file.projectId = :projectId', { projectId })
      .andWhere('file.deletedAt IS NULL')
      .getRawOne();

    const totalFiles = parseInt(result?.totalFiles ?? '0', 10);
    const totalSizeBytes = parseInt(result?.totalSizeBytes ?? '0', 10);

    return {
      totalFiles: Number.isNaN(totalFiles) ? 0 : totalFiles,
      totalSizeBytes: Number.isNaN(totalSizeBytes) ? 0 : totalSizeBytes,
    };
  }

  /**
   * Map entity to response DTO.
   */
  private toFileResponseDto(file: ProjectFile, downloadUrl: string): FileResponseDto {
    return {
      id: file.id,
      filename: file.filename,
      path: file.path,
      sizeBytes: typeof file.sizeBytes === 'string' ? parseInt(file.sizeBytes, 10) : file.sizeBytes,
      mimeType: file.mimeType,
      description: file.description,
      uploadedBy: file.uploadedBy,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      downloadUrl,
    };
  }
}
