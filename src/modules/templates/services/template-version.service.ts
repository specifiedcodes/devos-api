/**
 * Template Version Service
 *
 * Story 19-7: Template Versioning
 *
 * Manages template version publishing, listing, and retrieval.
 */
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TemplateVersion } from '../../../database/entities/template-version.entity';
import { Template } from '../../../database/entities/template.entity';
import { TemplateAuditService } from './template-audit.service';
import { PublishTemplateVersionDto } from '../dto/publish-template-version.dto';
import { ListVersionsQueryDto, VersionSortBy, SortOrder } from '../dto/list-versions-query.dto';
import {
  TemplateVersionResponseDto,
  TemplateVersionListResponseDto,
} from '../dto/template-version-response.dto';
import { SemverUtil } from '../utils/semver.util';
import { TemplateAuditEventType } from '../../../database/entities/template-audit-event.entity';

@Injectable()
export class TemplateVersionService {
  constructor(
    @InjectRepository(TemplateVersion)
    private readonly versionRepository: Repository<TemplateVersion>,
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    private readonly dataSource: DataSource,
    private readonly auditService: TemplateAuditService,
  ) {}

  /**
   * Publish a new version of a template
   */
  async publishVersion(
    templateId: string,
    userId: string,
    workspaceId: string | null,
    dto: PublishTemplateVersionDto,
  ): Promise<TemplateVersion> {
    // Validate semver format
    if (!SemverUtil.isValid(dto.version)) {
      throw new BadRequestException(`Invalid semver format: ${dto.version}`);
    }

    // Check if template exists and user has access
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    // Verify user has permission (workspace member or owner)
    // For now, we allow any workspace member to publish versions

    // Check if version already exists
    const existingVersion = await this.versionRepository.findOne({
      where: { templateId, version: dto.version },
    });

    if (existingVersion) {
      throw new ConflictException(`Version ${dto.version} already exists for this template`);
    }

    // Validate that new version is greater than existing versions
    await this.validateNewVersion(templateId, dto.version);

    // Use transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Unset isLatest on all previous versions
      await queryRunner.manager.update(
        TemplateVersion,
        { templateId, isLatest: true },
        { isLatest: false },
      );

      // Create new version with full definition snapshot
      const newVersion = queryRunner.manager.create(TemplateVersion, {
        templateId,
        version: dto.version,
        changelog: dto.changelog || null,
        definition: template.definition, // Snapshot current definition
        isLatest: true,
        downloadCount: 0,
        publishedBy: userId,
        publishedAt: new Date(),
      });

      const savedVersion = await queryRunner.manager.save(newVersion);

      // Update template's version field
      template.version = dto.version;
      await queryRunner.manager.save(template);

      await queryRunner.commitTransaction();

      // Audit log
      await this.auditService.logEvent({
        templateId,
        workspaceId,
        actorId: userId,
        eventType: TemplateAuditEventType.VERSION_PUBLISHED,
        details: {
          version: dto.version,
          changelog: dto.changelog,
          versionId: savedVersion.id,
        },
      });

      return savedVersion;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Validate that new version is greater than existing versions
   */
  async validateNewVersion(templateId: string, newVersion: string): Promise<void> {
    const existingVersions = await this.versionRepository.find({
      where: { templateId },
      select: ['version'],
    });

    if (existingVersions.length === 0) {
      // First version is always valid
      return;
    }

    const versionStrings = existingVersions.map((v) => v.version);
    const maxVersion = SemverUtil.max(versionStrings);

    if (maxVersion && !SemverUtil.isGreater(newVersion, maxVersion)) {
      throw new BadRequestException(
        `Version ${newVersion} must be greater than existing latest version ${maxVersion}`,
      );
    }
  }

  /**
   * List all versions for a template
   */
  async listVersions(
    templateId: string,
    query: ListVersionsQueryDto,
  ): Promise<TemplateVersionListResponseDto> {
    // Verify template exists
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    const { page = 1, limit = 20, sortBy, sortOrder, latestOnly } = query;
    const skip = (page - 1) * limit;

    const qb = this.versionRepository
      .createQueryBuilder('version')
      .where('version.templateId = :templateId', { templateId });

    if (latestOnly) {
      qb.andWhere('version.isLatest = :isLatest', { isLatest: true });
    }

    // Get total count first (before pagination)
    const total = await qb.getCount();

    // Get all matching versions for proper semver sorting if needed
    let items: TemplateVersion[];
    if (sortBy === VersionSortBy.VERSION) {
      // Fetch all and sort by semver in memory (database can't sort semver correctly)
      const allVersions = await this.versionRepository.find({
        where: { templateId },
      });

      // Sort using SemverUtil
      const sorted = sortOrder === SortOrder.ASC
        ? SemverUtil.sort(allVersions.map(v => v.version))
        : SemverUtil.sortDesc(allVersions.map(v => v.version));

      // Map back to entities and apply pagination
      const versionMap = new Map(allVersions.map(v => [v.version, v]));
      const paginatedVersions = sorted.slice(skip, skip + limit);
      items = paginatedVersions
        .map(v => versionMap.get(v))
        .filter((v): v is TemplateVersion => v !== undefined);

      return {
        items: items.map((v) => this.toResponseDto(v)),
        total,
        page,
        limit,
        hasMore: skip + items.length < total,
      };
    }

    // For non-version sorting, use database ordering
    const sortColumn =
      sortBy === VersionSortBy.DOWNLOAD_COUNT
        ? 'version.downloadCount'
        : 'version.publishedAt';

    qb.orderBy(sortColumn, sortOrder === SortOrder.ASC ? 'ASC' : 'DESC');

    // Apply pagination
    qb.skip(skip).take(limit);

    items = await qb.getMany();

    return {
      items: items.map((v) => this.toResponseDto(v)),
      total,
      page,
      limit,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Get a specific version by version number
   */
  async getVersion(templateId: string, version: string): Promise<TemplateVersionResponseDto> {
    if (!SemverUtil.isValid(version)) {
      throw new BadRequestException(`Invalid semver format: ${version}`);
    }

    const templateVersion = await this.versionRepository.findOne({
      where: { templateId, version },
    });

    if (!templateVersion) {
      throw new NotFoundException(`Version ${version} not found for template ${templateId}`);
    }

    return this.toResponseDto(templateVersion);
  }

  /**
   * Get the latest version of a template
   */
  async getLatestVersion(templateId: string): Promise<TemplateVersion | null> {
    return this.versionRepository.findOne({
      where: { templateId, isLatest: true },
    });
  }

  /**
   * Get version by ID
   */
  async getVersionById(versionId: string): Promise<TemplateVersion | null> {
    return this.versionRepository.findOne({
      where: { id: versionId },
    });
  }

  /**
   * Increment download count for a version
   */
  async incrementDownloadCount(versionId: string): Promise<void> {
    await this.versionRepository.increment({ id: versionId }, 'downloadCount', 1);
  }

  /**
   * Delete a version (only if it's not the only version and not latest)
   */
  async deleteVersion(templateId: string, version: string, userId: string): Promise<void> {
    const templateVersion = await this.versionRepository.findOne({
      where: { templateId, version },
    });

    if (!templateVersion) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    if (templateVersion.isLatest) {
      throw new BadRequestException('Cannot delete the latest version');
    }

    // Count total versions
    const count = await this.versionRepository.count({
      where: { templateId },
    });

    if (count <= 1) {
      throw new BadRequestException('Cannot delete the only version');
    }

    await this.versionRepository.remove(templateVersion);
  }

  /**
   * Map entity to response DTO
   */
  private toResponseDto(entity: TemplateVersion): TemplateVersionResponseDto {
    return {
      id: entity.id,
      templateId: entity.templateId,
      version: entity.version,
      changelog: entity.changelog,
      definition: entity.definition,
      isLatest: entity.isLatest,
      downloadCount: entity.downloadCount,
      publishedBy: entity.publishedBy,
      publishedAt: entity.publishedAt,
      createdAt: entity.createdAt,
    };
  }
}
