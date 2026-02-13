import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationPreferences,
  NotificationTypeSettings,
  DNDSchedule,
  AgentNotificationSettings,
  SoundFile,
} from '../../../database/entities/notification-preferences.entity';
import {
  UpdateNotificationPreferencesDto,
  NotificationPreferencesResponseDto,
} from '../dto/notification-preferences.dto';

/**
 * Default notification type settings
 */
const DEFAULT_TYPE_SETTINGS: NotificationTypeSettings = {
  chatMessages: true,
  statusUpdates: true,
  taskCompletions: true,
  errors: true,
  mentions: true,
};

/**
 * NotificationPreferencesService
 * Story 9.9: Chat Notifications
 *
 * Service for managing user notification preferences
 */
@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(
    @InjectRepository(NotificationPreferences)
    private readonly preferencesRepository: Repository<NotificationPreferences>,
  ) {}

  /**
   * Get notification preferences for a user in a workspace
   * Creates default preferences if none exist
   */
  async getPreferences(
    userId: string,
    workspaceId: string,
  ): Promise<NotificationPreferencesResponseDto> {
    let preferences = await this.preferencesRepository.findOne({
      where: { userId, workspaceId },
    });

    // Create default preferences if not found
    if (!preferences) {
      preferences = await this.createDefaultPreferences(userId, workspaceId);
    }

    return this.toResponseDto(preferences);
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    let preferences = await this.preferencesRepository.findOne({
      where: { userId, workspaceId: dto.workspaceId },
    });

    // Create if not exists
    if (!preferences) {
      preferences = await this.createDefaultPreferences(userId, dto.workspaceId);
    }

    // Update fields
    if (dto.enabled !== undefined) {
      preferences.enabled = dto.enabled;
    }
    if (dto.pushEnabled !== undefined) {
      preferences.pushEnabled = dto.pushEnabled;
    }
    if (dto.soundEnabled !== undefined) {
      preferences.soundEnabled = dto.soundEnabled;
    }
    if (dto.dnd !== undefined) {
      preferences.dndEnabled = dto.dnd.enabled;
      if (dto.dnd.schedule) {
        preferences.dndSchedule = dto.dnd.schedule;
      }
    }
    if (dto.agentSettings !== undefined) {
      preferences.agentSettings = {
        ...preferences.agentSettings,
        ...dto.agentSettings,
      };
    }
    if (dto.typeSettings !== undefined) {
      preferences.typeSettings = {
        ...preferences.typeSettings,
        ...dto.typeSettings,
      };
    }
    if (dto.soundSettings !== undefined) {
      if (dto.soundSettings.volume !== undefined) {
        preferences.soundVolume = dto.soundSettings.volume;
      }
      if (dto.soundSettings.soundFile !== undefined) {
        preferences.soundFile = dto.soundSettings.soundFile;
      }
    }

    await this.preferencesRepository.save(preferences);

    this.logger.log(
      `Updated notification preferences for user ${userId} in workspace ${dto.workspaceId}`,
    );

    return this.toResponseDto(preferences);
  }

  /**
   * Mute an agent for a user
   */
  async muteAgent(
    userId: string,
    workspaceId: string,
    agentId: string,
  ): Promise<NotificationPreferencesResponseDto> {
    const preferences = await this.getOrCreatePreferences(userId, workspaceId);

    preferences.agentSettings = {
      ...preferences.agentSettings,
      [agentId]: {
        ...(preferences.agentSettings[agentId] || { soundEnabled: true, priority: 'normal' }),
        muted: true,
      },
    };

    await this.preferencesRepository.save(preferences);
    return this.toResponseDto(preferences);
  }

  /**
   * Unmute an agent for a user
   */
  async unmuteAgent(
    userId: string,
    workspaceId: string,
    agentId: string,
  ): Promise<NotificationPreferencesResponseDto> {
    const preferences = await this.getOrCreatePreferences(userId, workspaceId);

    preferences.agentSettings = {
      ...preferences.agentSettings,
      [agentId]: {
        ...(preferences.agentSettings[agentId] || { soundEnabled: true, priority: 'normal' }),
        muted: false,
      },
    };

    await this.preferencesRepository.save(preferences);
    return this.toResponseDto(preferences);
  }

  /**
   * Check if notifications should be shown for a user
   */
  async shouldShowNotification(
    userId: string,
    workspaceId: string,
    agentId?: string,
    notificationType?: keyof NotificationTypeSettings,
  ): Promise<boolean> {
    const preferences = await this.preferencesRepository.findOne({
      where: { userId, workspaceId },
    });

    if (!preferences) {
      // Default is to show notifications
      return true;
    }

    // Check master toggle
    if (!preferences.enabled) {
      return false;
    }

    // Check DND
    if (this.isDNDActive(preferences)) {
      return false;
    }

    // Check agent mute
    if (agentId && preferences.agentSettings[agentId]?.muted) {
      return false;
    }

    // Check notification type
    if (notificationType && !preferences.typeSettings[notificationType]) {
      return false;
    }

    return true;
  }

  /**
   * Check if DND is currently active
   */
  isDNDActive(preferences: NotificationPreferences): boolean {
    if (!preferences.dndEnabled || !preferences.dndSchedule) {
      return false;
    }

    const { startTime, endTime, daysOfWeek, timezone } = preferences.dndSchedule;

    try {
      const now = new Date();
      const currentDay = now.getDay();

      // Check if today is a DND day
      if (!daysOfWeek.includes(currentDay)) {
        return false;
      }

      // Parse times
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);

      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const currentMins = currentHour * 60 + currentMin;
      const startMins = startHour * 60 + startMin;
      const endMins = endHour * 60 + endMin;

      // Handle overnight DND (e.g., 22:00 - 08:00)
      if (startMins > endMins) {
        return currentMins >= startMins || currentMins < endMins;
      }

      return currentMins >= startMins && currentMins < endMins;
    } catch {
      return false;
    }
  }

  /**
   * Get or create preferences
   */
  private async getOrCreatePreferences(
    userId: string,
    workspaceId: string,
  ): Promise<NotificationPreferences> {
    let preferences = await this.preferencesRepository.findOne({
      where: { userId, workspaceId },
    });

    if (!preferences) {
      preferences = await this.createDefaultPreferences(userId, workspaceId);
    }

    return preferences;
  }

  /**
   * Create default preferences
   */
  private async createDefaultPreferences(
    userId: string,
    workspaceId: string,
  ): Promise<NotificationPreferences> {
    const preferences = this.preferencesRepository.create({
      userId,
      workspaceId,
      enabled: true,
      pushEnabled: true,
      soundEnabled: true,
      soundVolume: 0.5,
      soundFile: 'default' as SoundFile,
      dndEnabled: false,
      dndSchedule: null,
      agentSettings: {},
      typeSettings: DEFAULT_TYPE_SETTINGS,
    });

    await this.preferencesRepository.save(preferences);

    this.logger.log(
      `Created default notification preferences for user ${userId} in workspace ${workspaceId}`,
    );

    return preferences;
  }

  /**
   * Convert entity to response DTO
   */
  private toResponseDto(
    preferences: NotificationPreferences,
  ): NotificationPreferencesResponseDto {
    return {
      id: preferences.id,
      userId: preferences.userId,
      workspaceId: preferences.workspaceId,
      enabled: preferences.enabled,
      pushEnabled: preferences.pushEnabled,
      soundEnabled: preferences.soundEnabled,
      dnd: {
        enabled: preferences.dndEnabled,
        schedule: preferences.dndSchedule || undefined,
      },
      agentSettings: preferences.agentSettings,
      typeSettings: preferences.typeSettings,
      soundSettings: {
        volume: Number(preferences.soundVolume),
        soundFile: preferences.soundFile,
      },
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
    };
  }
}
