import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';

/**
 * Allowed values for defaultDeploymentPlatform.
 * Story 28.3: Only 'railway' is accepted for new updates.
 * Existing 'vercel' or 'supabase' values in the database are tolerated but cannot be set via API.
 */
const ALLOWED_DEPLOYMENT_PLATFORMS = ['railway'];

/**
 * Deprecated values that return a warning but are rejected for new updates.
 */
const DEPRECATED_DEPLOYMENT_PLATFORMS = ['vercel', 'supabase'];

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
  private readonly logger = new Logger(WorkspaceSettingsService.name);

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
      // Story 28.3: New workspaces default to 'railway'
      settings = this.settingsRepository.create({
        workspaceId,
        workspaceType: 'internal',
        tags: [],
        defaultDeploymentPlatform: 'railway',
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
   *
   * Story 28.3: Validates defaultDeploymentPlatform - only 'railway' is accepted.
   * Setting to 'vercel' or 'supabase' returns a BadRequestException with deprecation notice.
   */
  async updateSettings(
    workspaceId: string,
    dto: UpdateWorkspaceSettingsDto,
  ): Promise<WorkspaceSettings> {
    // Story 28.3: Validate defaultDeploymentPlatform
    if (dto.defaultDeploymentPlatform !== undefined) {
      if (DEPRECATED_DEPLOYMENT_PLATFORMS.includes(dto.defaultDeploymentPlatform)) {
        throw new BadRequestException(
          `'${dto.defaultDeploymentPlatform}' is deprecated as a deployment platform. ` +
            `Only 'railway' is supported. Please use Railway for deployments.`,
        );
      }
      if (!ALLOWED_DEPLOYMENT_PLATFORMS.includes(dto.defaultDeploymentPlatform)) {
        throw new BadRequestException(
          `Invalid deployment platform '${dto.defaultDeploymentPlatform}'. ` +
            `Only 'railway' is supported.`,
        );
      }
    }

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

  /**
   * Set spending limit for a workspace (Story 3.5)
   */
  async setSpendingLimit(
    workspaceId: string,
    monthlyLimitUsd: number,
    alertThresholds: number[],
    limitEnabled: boolean,
  ): Promise<WorkspaceSettings> {
    let settings = await this.settingsRepository.findOne({
      where: { workspaceId },
    });

    if (!settings) {
      // Create new settings with spending limits
      settings = this.settingsRepository.create({
        workspaceId,
        monthlyLimitUsd,
        alertThresholds,
        limitEnabled,
        triggeredAlerts: {},
      });
    } else {
      // Reset triggered alerts if limit is being disabled or amount changed
      // Must check BEFORE overwriting the values
      const limitAmountChanged = settings.monthlyLimitUsd !== monthlyLimitUsd;
      if (!limitEnabled || limitAmountChanged) {
        settings.triggeredAlerts = {};
      }

      // Update existing settings
      settings.monthlyLimitUsd = monthlyLimitUsd;
      settings.alertThresholds = alertThresholds;
      settings.limitEnabled = limitEnabled;
    }

    const saved = await this.settingsRepository.save(settings);
    this.logger.log(
      `Spending limit set for workspace ${workspaceId}: $${monthlyLimitUsd} (enabled: ${limitEnabled})`,
    );

    return saved;
  }

  /**
   * Get spending limits for a workspace (Story 3.5)
   */
  async getSpendingLimits(workspaceId: string): Promise<{
    monthly_limit_usd?: number;
    alert_thresholds?: number[];
    limit_enabled: boolean;
    triggered_alerts?: Record<string, any>;
  }> {
    const settings = await this.settingsRepository.findOne({
      where: { workspaceId },
    });

    if (!settings) {
      return {
        limit_enabled: false,
        alert_thresholds: [80, 90, 100],
      };
    }

    return {
      monthly_limit_usd: settings.monthlyLimitUsd,
      alert_thresholds: settings.alertThresholds || [80, 90, 100],
      limit_enabled: settings.limitEnabled,
      triggered_alerts: settings.triggeredAlerts || {},
    };
  }
}
