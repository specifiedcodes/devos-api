import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';

export interface UpdateWorkspaceSettingsDto {
  workspaceType?: string;
  tags?: string[];
  defaultDeploymentPlatform?: string;
  projectPreferences?: Record<string, any>;
  notificationPreferences?: Record<string, any>;
  branding?: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
}

@Injectable()
export class WorkspaceSettingsService {
  constructor(
    @InjectRepository(WorkspaceSettings)
    private readonly settingsRepository: Repository<WorkspaceSettings>,
  ) {}

  /**
   * Get settings for a workspace (create default if doesn't exist)
   */
  async getSettings(workspaceId: string): Promise<WorkspaceSettings> {
    let settings = await this.settingsRepository.findOne({
      where: { workspaceId },
    });

    if (!settings) {
      // Create default settings
      settings = this.settingsRepository.create({
        workspaceId,
        workspaceType: 'internal',
        tags: [],
        projectPreferences: {},
        notificationPreferences: {
          emailNotifications: true,
          deploymentAlerts: true,
          costAlerts: true,
        },
      });
      settings = await this.settingsRepository.save(settings);
    }

    return settings;
  }

  /**
   * Update workspace settings
   */
  async updateSettings(
    workspaceId: string,
    dto: UpdateWorkspaceSettingsDto,
  ): Promise<WorkspaceSettings> {
    let settings = await this.settingsRepository.findOne({
      where: { workspaceId },
    });

    if (!settings) {
      // Create new settings with provided values
      settings = this.settingsRepository.create({
        workspaceId,
        ...dto,
      });
    } else {
      // Update existing settings
      Object.assign(settings, dto);
    }

    return this.settingsRepository.save(settings);
  }

  /**
   * Delete workspace settings
   */
  async deleteSettings(workspaceId: string): Promise<void> {
    await this.settingsRepository.delete({ workspaceId });
  }
}
