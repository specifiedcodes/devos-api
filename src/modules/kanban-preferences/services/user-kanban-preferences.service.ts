/**
 * User Kanban Preferences Service
 * Story 7.8: Kanban Board Customization
 *
 * Service for managing user Kanban board preferences.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import {
  UserKanbanPreferences,
  DEFAULT_COLUMN_CONFIG,
  DEFAULT_CARD_DISPLAY_CONFIG,
  type KanbanColumnConfig,
  type KanbanCardDisplayConfig,
  type KanbanTheme,
} from '../../../database/entities/user-kanban-preferences.entity';

/**
 * Full preferences object returned to clients
 */
export interface KanbanPreferencesDto {
  columns: KanbanColumnConfig[];
  cardDisplay: KanbanCardDisplayConfig;
  theme: string;
}

/**
 * Partial preferences for updates
 */
export interface UpdateKanbanPreferencesDto {
  columns?: KanbanColumnConfig[];
  cardDisplay?: Partial<KanbanCardDisplayConfig>;
  theme?: string;
}

@Injectable()
export class UserKanbanPreferencesService {
  private readonly logger = new Logger(UserKanbanPreferencesService.name);

  constructor(
    @InjectRepository(UserKanbanPreferences)
    private readonly preferencesRepository: Repository<UserKanbanPreferences>,
  ) {}

  /**
   * Get preferences for a user, optionally for a specific project
   * Falls back to user defaults if project-specific preferences don't exist
   * Returns built-in defaults if no preferences exist at all
   */
  async getPreferences(userId: string, projectId?: string): Promise<KanbanPreferencesDto> {
    // Try to get project-specific preferences first
    if (projectId) {
      const projectPrefs = await this.preferencesRepository.findOne({
        where: { userId, projectId },
      });

      if (projectPrefs) {
        this.logger.debug(`Found project-specific preferences for user ${userId}, project ${projectId}`);
        return this.mapToDto(projectPrefs);
      }
    }

    // Fall back to user's default preferences (projectId = null)
    const userPrefs = await this.preferencesRepository.findOne({
      where: { userId, projectId: IsNull() },
    });

    if (userPrefs) {
      this.logger.debug(`Found user default preferences for user ${userId}`);
      return this.mapToDto(userPrefs);
    }

    // Return built-in defaults
    this.logger.debug(`Using built-in defaults for user ${userId}`);
    return this.getBuiltInDefaults();
  }

  /**
   * Update preferences for a user, optionally for a specific project
   * Creates new preferences if they don't exist
   */
  async updatePreferences(
    userId: string,
    projectId: string | null,
    updates: UpdateKanbanPreferencesDto,
  ): Promise<KanbanPreferencesDto> {
    // Find existing preferences
    let prefs = await this.preferencesRepository.findOne({
      where: { userId, projectId: projectId ?? IsNull() },
    });

    if (!prefs) {
      // Create new preferences with defaults
      prefs = this.preferencesRepository.create({
        userId,
        projectId,
        columnConfig: DEFAULT_COLUMN_CONFIG,
        cardDisplayConfig: DEFAULT_CARD_DISPLAY_CONFIG,
        theme: 'system',
      });
    }

    // Apply updates
    if (updates.columns) {
      prefs.columnConfig = updates.columns;
    }

    if (updates.cardDisplay) {
      prefs.cardDisplayConfig = {
        ...prefs.cardDisplayConfig,
        ...updates.cardDisplay,
      };
    }

    if (updates.theme) {
      prefs.theme = updates.theme as KanbanTheme;
    }

    // Save and return
    const saved = await this.preferencesRepository.save(prefs);
    this.logger.log(`Updated preferences for user ${userId}, project ${projectId || 'default'}`);

    return this.mapToDto(saved);
  }

  /**
   * Reset preferences to defaults for a user
   * Deletes the preferences record, causing getPreferences to return built-in defaults
   */
  async resetPreferences(userId: string, projectId?: string): Promise<KanbanPreferencesDto> {
    // Delete existing preferences using proper TypeORM query syntax
    if (projectId) {
      await this.preferencesRepository.delete({ userId, projectId });
    } else {
      // For null projectId, use QueryBuilder for proper NULL handling
      await this.preferencesRepository
        .createQueryBuilder()
        .delete()
        .where('userId = :userId AND projectId IS NULL', { userId })
        .execute();
    }

    this.logger.log(`Reset preferences for user ${userId}, project ${projectId || 'default'}`);

    // Return built-in defaults
    return this.getBuiltInDefaults();
  }

  /**
   * Get built-in default preferences
   */
  private getBuiltInDefaults(): KanbanPreferencesDto {
    return {
      columns: DEFAULT_COLUMN_CONFIG,
      cardDisplay: DEFAULT_CARD_DISPLAY_CONFIG,
      theme: 'system',
    };
  }

  /**
   * Map entity to DTO
   */
  private mapToDto(entity: UserKanbanPreferences): KanbanPreferencesDto {
    return {
      columns: entity.columnConfig,
      cardDisplay: entity.cardDisplayConfig,
      theme: entity.theme,
    };
  }
}
