/**
 * Template Update Service
 *
 * Story 19-7: Template Versioning
 *
 * Manages project-template version tracking and update detection.
 */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProjectTemplateVersion,
  TemplateUpdateType,
} from '../../../database/entities/project-template-version.entity';
import { TemplateVersion } from '../../../database/entities/template-version.entity';
import { Template } from '../../../database/entities/template.entity';
import { Project } from '../../../database/entities/project.entity';
import { SemverUtil } from '../utils/semver.util';
import {
  TemplateUpdateStatusDto,
  ProjectTemplateVersionDto,
} from '../dto/template-version-response.dto';

@Injectable()
export class TemplateUpdateService {
  constructor(
    @InjectRepository(ProjectTemplateVersion)
    private readonly projectTemplateVersionRepository: Repository<ProjectTemplateVersion>,
    @InjectRepository(TemplateVersion)
    private readonly templateVersionRepository: Repository<TemplateVersion>,
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  /**
   * Record that a project was created from a specific template version
   * Called during template installation completion
   */
  async recordProjectTemplateVersion(
    projectId: string,
    templateId: string,
    version: string,
  ): Promise<ProjectTemplateVersion> {
    // Find the template version record
    let templateVersion = await this.templateVersionRepository.findOne({
      where: { templateId, version },
    });

    // If version record doesn't exist, create a virtual entry
    // This handles cases where templates were created before versioning was implemented
    const record = this.projectTemplateVersionRepository.create({
      projectId,
      templateId,
      templateVersionId: templateVersion?.id || null,
      installedVersion: version,
      latestVersion: version, // Initially, latest is same as installed
      updateAvailable: false,
      updateType: null,
      lastCheckedAt: new Date(),
    });

    return this.projectTemplateVersionRepository.save(record);
  }

  /**
   * Check for updates for a specific project
   */
  async checkForUpdates(projectId: string): Promise<TemplateUpdateStatusDto> {
    const record = await this.projectTemplateVersionRepository.findOne({
      where: { projectId },
      relations: ['template'],
    });

    if (!record) {
      throw new NotFoundException(`No template version record found for project ${projectId}`);
    }

    // Get the latest version of the template
    const latestVersion = await this.templateVersionRepository.findOne({
      where: { templateId: record.templateId, isLatest: true },
    });

    // Determine if update is available
    let updateAvailable = false;
    let updateType: TemplateUpdateType | null = null;
    let latestVersionStr = record.installedVersion;

    if (latestVersion) {
      latestVersionStr = latestVersion.version;
      updateAvailable = SemverUtil.isGreater(latestVersion.version, record.installedVersion);

      if (updateAvailable) {
        const detectedType = SemverUtil.getUpdateType(record.installedVersion, latestVersion.version);
        updateType = detectedType as TemplateUpdateType;
      }
    }

    // Check if user dismissed this version
    if (updateAvailable && record.dismissedVersion === latestVersionStr) {
      updateAvailable = false;
    }

    // Update the record
    record.latestVersion = latestVersionStr;
    record.updateAvailable = updateAvailable;
    record.updateType = updateAvailable ? updateType : null;
    record.lastCheckedAt = new Date();
    await this.projectTemplateVersionRepository.save(record);

    return {
      projectId: record.projectId,
      templateId: record.templateId,
      installedVersion: record.installedVersion,
      latestVersion: latestVersionStr,
      updateAvailable,
      updateType,
      lastCheckedAt: record.lastCheckedAt,
      changelog: latestVersion?.changelog,
      dismissedVersion: record.dismissedVersion,
    };
  }

  /**
   * Get update status for a project
   */
  async getUpdateStatus(projectId: string): Promise<ProjectTemplateVersionDto> {
    const record = await this.projectTemplateVersionRepository.findOne({
      where: { projectId },
      relations: ['template'],
    });

    if (!record) {
      throw new NotFoundException(`No template version record found for project ${projectId}`);
    }

    const template = record.template;

    return {
      id: record.id,
      projectId: record.projectId,
      templateId: record.templateId,
      templateName: template?.name,
      templateDisplayName: template?.displayName,
      installedVersion: record.installedVersion,
      latestVersion: record.latestVersion,
      updateAvailable: record.updateAvailable,
      updateType: record.updateType,
      lastCheckedAt: record.lastCheckedAt,
      dismissedVersion: record.dismissedVersion,
      createdAt: record.createdAt,
    };
  }

  /**
   * Dismiss an update notification
   */
  async dismissUpdate(projectId: string, version: string): Promise<void> {
    const record = await this.projectTemplateVersionRepository.findOne({
      where: { projectId },
    });

    if (!record) {
      throw new NotFoundException(`No template version record found for project ${projectId}`);
    }

    if (!SemverUtil.isValid(version)) {
      throw new BadRequestException(`Invalid semver format: ${version}`);
    }

    record.dismissedVersion = version;
    record.updateAvailable = false; // Hide the notification
    await this.projectTemplateVersionRepository.save(record);
  }

  /**
   * Clear dismissed update (to re-show the notification)
   */
  async clearDismissedUpdate(projectId: string): Promise<void> {
    await this.projectTemplateVersionRepository.update(
      { projectId },
      { dismissedVersion: null },
    );
  }

  /**
   * Batch check updates for all projects in a workspace
   * Used by scheduled jobs
   */
  async batchCheckUpdates(workspaceId: string): Promise<{ checked: number; updated: number }> {
    // Get all projects with template versions in this workspace
    const records = await this.projectTemplateVersionRepository
      .createQueryBuilder('ptv')
      .innerJoin('ptv.project', 'project')
      .where('project.workspaceId = :workspaceId', { workspaceId })
      .getMany();

    let updated = 0;

    for (const record of records) {
      try {
        const latestVersion = await this.templateVersionRepository.findOne({
          where: { templateId: record.templateId, isLatest: true },
        });

        if (latestVersion) {
          const wasAvailable = record.updateAvailable;
          const updateAvailable = SemverUtil.isGreater(latestVersion.version, record.installedVersion);

          // Respect dismissed version
          const effectivelyAvailable =
            updateAvailable && record.dismissedVersion !== latestVersion.version;

          const updateType = effectivelyAvailable
            ? (SemverUtil.getUpdateType(record.installedVersion, latestVersion.version) as TemplateUpdateType)
            : null;

          record.latestVersion = latestVersion.version;
          record.updateAvailable = effectivelyAvailable;
          record.updateType = updateType;
          record.lastCheckedAt = new Date();

          await this.projectTemplateVersionRepository.save(record);

          if (wasAvailable !== effectivelyAvailable) {
            updated++;
          }
        }
      } catch (error) {
        // Log error but continue with other records
        console.error(`Error checking updates for project ${record.projectId}:`, error);
      }
    }

    return { checked: records.length, updated };
  }

  /**
   * Get all projects with available updates in a workspace
   */
  async getProjectsWithUpdates(workspaceId: string): Promise<ProjectTemplateVersionDto[]> {
    const records = await this.projectTemplateVersionRepository
      .createQueryBuilder('ptv')
      .innerJoinAndSelect('ptv.project', 'project')
      .leftJoinAndSelect('ptv.template', 'template')
      .where('project.workspaceId = :workspaceId', { workspaceId })
      .andWhere('ptv.updateAvailable = :updateAvailable', { updateAvailable: true })
      .getMany();

    return records.map((record) => ({
      id: record.id,
      projectId: record.projectId,
      templateId: record.templateId,
      templateName: record.template?.name,
      templateDisplayName: record.template?.displayName,
      installedVersion: record.installedVersion,
      latestVersion: record.latestVersion,
      updateAvailable: record.updateAvailable,
      updateType: record.updateType,
      lastCheckedAt: record.lastCheckedAt,
      dismissedVersion: record.dismissedVersion,
      createdAt: record.createdAt,
    }));
  }

  /**
   * Delete the project template version record (when project is deleted)
   */
  async deleteForProject(projectId: string): Promise<void> {
    await this.projectTemplateVersionRepository.delete({ projectId });
  }
}
