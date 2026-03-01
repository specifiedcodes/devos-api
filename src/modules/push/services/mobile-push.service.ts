/**
 * Mobile Push Service
 * Story 22.7: Mobile Push Notifications
 *
 * Handles Expo Push API integration for mobile notifications:
 * - Token registration and management
 * - Push notification delivery via Expo
 * - Quiet hours and category filtering
 * - Push receipt checking
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PushToken, MobilePlatform } from '../../../database/entities/push-token.entity';
import { MobileNotificationPreferences, NotificationCategoryType } from '../../../database/entities/mobile-notification-preferences.entity';
import {
  MobileNotificationCategory,
  NotificationEvent,
  NotificationEventType,
  NOTIFICATION_EVENT_TYPES,
  DEPLOYMENT_NOTIFICATION_ACTIONS,
  AGENT_NOTIFICATION_ACTIONS,
  COST_NOTIFICATION_ACTIONS,
} from '../constants/notification-categories';

export interface ExpoPushMessage {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  categoryId?: string;
  priority?: 'default' | 'normal' | 'high';
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

interface SendResult {
  deviceId: string;
  success: boolean;
  error?: string;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_BATCH_SIZE = 100;
const URGENT_EVENT_TYPES: NotificationEventType[] = [
  NOTIFICATION_EVENT_TYPES.AGENT_ERROR,
  NOTIFICATION_EVENT_TYPES.APPROVAL_NEEDED,
  NOTIFICATION_EVENT_TYPES.DEPLOYMENT_FAILED,
  NOTIFICATION_EVENT_TYPES.COST_ALERT,
];

@Injectable()
export class MobilePushService {
  private readonly logger = new Logger(MobilePushService.name);

  constructor(
    @InjectRepository(PushToken)
    private readonly pushTokenRepository: Repository<PushToken>,
    @InjectRepository(MobileNotificationPreferences)
    private readonly preferencesRepository: Repository<MobileNotificationPreferences>,
    private readonly configService: ConfigService,
  ) {}

  async registerToken(
    userId: string,
    workspaceId: string,
    expoPushToken: string,
    deviceId: string,
    platform: MobilePlatform,
  ): Promise<PushToken> {
    const existingToken = await this.pushTokenRepository.findOne({
      where: { deviceId, userId },
    });

    if (existingToken) {
      existingToken.pushToken = expoPushToken;
      existingToken.platform = platform;
      existingToken.isActive = true;
      existingToken.lastUsedAt = new Date();
      return this.pushTokenRepository.save(existingToken);
    }

    const newToken = this.pushTokenRepository.create({
      userId,
      workspaceId,
      pushToken: expoPushToken,
      deviceId,
      platform,
      isActive: true,
      lastUsedAt: new Date(),
    });

    try {
      return await this.pushTokenRepository.save(newToken);
    } catch (error: any) {
      if (error.code === '23505') {
        const retryToken = await this.pushTokenRepository.findOne({
          where: { deviceId, userId },
        });
        if (retryToken) {
          retryToken.pushToken = expoPushToken;
          retryToken.platform = platform;
          retryToken.isActive = true;
          retryToken.lastUsedAt = new Date();
          return this.pushTokenRepository.save(retryToken);
        }
      }
      throw error;
    }
  }

  async unregisterDevice(userId: string, deviceId: string): Promise<boolean> {
    const result = await this.pushTokenRepository.update(
      { deviceId, userId },
      { isActive: false },
    );
    return (result.affected ?? 0) > 0;
  }

  async getUserDevices(userId: string, workspaceId: string): Promise<PushToken[]> {
    return this.pushTokenRepository.find({
      where: { userId, workspaceId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async sendToUser(
    userId: string,
    workspaceId: string,
    event: NotificationEvent,
  ): Promise<SendResult[]> {
    const tokens = await this.pushTokenRepository.find({
      where: { userId, workspaceId, isActive: true },
    });

    if (tokens.length === 0) {
      this.logger.debug(`No active push tokens for user ${userId}`);
      return [];
    }

    const preferences = await this.getOrCreatePreferences(userId, workspaceId);
    const filteredTokens = await this.filterByPreferences(tokens, event, preferences);

    if (filteredTokens.length === 0) {
      this.logger.debug(`All tokens filtered by preferences for user ${userId}`);
      return [];
    }

    return this.sendPushNotifications(filteredTokens, event);
  }

  async sendToWorkspace(
    workspaceId: string,
    event: NotificationEvent,
    excludeUserId?: string,
  ): Promise<SendResult[]> {
    const tokens = await this.pushTokenRepository.find({
      where: { workspaceId, isActive: true },
    });

    let filteredTokens = tokens;
    if (excludeUserId) {
      filteredTokens = tokens.filter((t) => t.userId !== excludeUserId);
    }

    if (filteredTokens.length === 0) {
      this.logger.debug(`No active push tokens for workspace ${workspaceId}`);
      return [];
    }

    const userIds = [...new Set(filteredTokens.map((t) => t.userId))];
    const preferencesMap = new Map<string, MobileNotificationPreferences>();

    const preferencesList = await this.preferencesRepository.find({
      where: userIds.map((userId) => ({ userId, workspaceId })),
    });

    for (const prefs of preferencesList) {
      preferencesMap.set(prefs.userId, prefs);
    }

    for (const userId of userIds) {
      if (!preferencesMap.has(userId)) {
        const prefs = await this.getOrCreatePreferences(userId, workspaceId);
        preferencesMap.set(userId, prefs);
      }
    }

    const tokensToSend: PushToken[] = [];
    for (const token of filteredTokens) {
      const prefs = preferencesMap.get(token.userId);
      if (prefs) {
        const filtered = await this.filterByPreferences([token], event, prefs);
        tokensToSend.push(...filtered);
      }
    }

    if (tokensToSend.length === 0) {
      this.logger.debug(`All tokens filtered by preferences for workspace ${workspaceId}`);
      return [];
    }

    return this.sendPushNotifications(tokensToSend, event);
  }

  private async getOrCreatePreferences(
    userId: string,
    workspaceId: string,
  ): Promise<MobileNotificationPreferences> {
    let preferences = await this.preferencesRepository.findOne({
      where: { userId, workspaceId },
    });

    if (!preferences) {
      preferences = this.preferencesRepository.create({
        userId,
        workspaceId,
        categoriesEnabled: ['agent', 'deployment', 'cost', 'sprint'] as NotificationCategoryType[],
        urgentOnlyInQuiet: true,
      });
      await this.preferencesRepository.save(preferences);
    }

    return preferences;
  }

  private async filterByPreferences(
    tokens: PushToken[],
    event: NotificationEvent,
    preferences: MobileNotificationPreferences,
  ): Promise<PushToken[]> {
    if (!preferences.categoriesEnabled.includes(event.category as NotificationCategoryType)) {
      return [];
    }

    if (this.isInQuietHours(preferences)) {
      const isUrgent = URGENT_EVENT_TYPES.includes(event.type as NotificationEventType);
      if (preferences.urgentOnlyInQuiet && !isUrgent) {
        return [];
      }
    }

    return tokens;
  }

  private isInQuietHours(preferences: MobileNotificationPreferences): boolean {
    if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const start = preferences.quietHoursStart;
    const end = preferences.quietHoursEnd;

    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    } else {
      return currentTime >= start || currentTime <= end;
    }
  }

  private async sendPushNotifications(
    tokens: PushToken[],
    event: NotificationEvent,
  ): Promise<SendResult[]> {
    const results: SendResult[] = [];
    const pushTokens = tokens.map((t) => t.pushToken);

    for (let i = 0; i < pushTokens.length; i += MAX_BATCH_SIZE) {
      const batch = pushTokens.slice(i, i + MAX_BATCH_SIZE);
      const batchTokens = tokens.slice(i, i + MAX_BATCH_SIZE);

      const messages: ExpoPushMessage[] = batch.map((token) => ({
        to: token,
        title: event.title,
        body: event.body,
        data: {
          ...event.data,
          type: event.type,
          category: event.category,
        },
        sound: 'default',
        priority: event.priority === 'high' ? 'high' : 'default',
        categoryId: this.getCategoryId(event.category),
      }));

      try {
        const tickets = await this.sendBatchToExpo(messages);

        for (let j = 0; j < tickets.length; j++) {
          const ticket = tickets[j];
          const token = batchTokens[j];

          if (ticket.status === 'ok') {
            results.push({ deviceId: token.deviceId, success: true });
            await this.pushTokenRepository.update(
              { id: token.id },
              { lastUsedAt: new Date() },
            );
          } else {
            results.push({
              deviceId: token.deviceId,
              success: false,
              error: ticket.message || ticket.details?.error,
            });

            if (ticket.details?.error === 'DeviceNotRegistered') {
              await this.pushTokenRepository.update(
                { id: token.id },
                { isActive: false },
              );
            }
          }
        }
      } catch (error: any) {
        this.logger.error(`Failed to send push batch: ${error.message}`);
        for (const token of batchTokens) {
          results.push({
            deviceId: token.deviceId,
            success: false,
            error: error.message,
          });
        }
      }
    }

    return results;
  }

  private async sendBatchToExpo(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      throw new Error(`Expo push failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  async checkReceipts(ticketIds: string[]): Promise<Map<string, ExpoPushReceipt>> {
    if (ticketIds.length === 0) {
      return new Map();
    }

    try {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ ids: ticketIds }),
      });

      if (!response.ok) {
        this.logger.warn(`Receipt check failed with status ${response.status}`);
        return new Map();
      }

      const data = await response.json();
      const receipts = new Map<string, ExpoPushReceipt>();

      for (const [id, receipt] of Object.entries(data.data || {})) {
        receipts.set(id, receipt as ExpoPushReceipt);

        if ((receipt as ExpoPushReceipt).status === 'error') {
          this.logger.warn(`Push receipt error for ${id}: ${(receipt as ExpoPushReceipt).message}`);
        }
      }

      return receipts;
    } catch (error: any) {
      this.logger.error(`Failed to check receipts: ${error.message}`);
      return new Map();
    }
  }

  private getCategoryId(category: MobileNotificationCategory): string {
    switch (category) {
      case MobileNotificationCategory.AGENT:
        return 'agent-notification';
      case MobileNotificationCategory.DEPLOYMENT:
        return 'deployment-notification';
      case MobileNotificationCategory.COST:
        return 'cost-notification';
      case MobileNotificationCategory.SPRINT:
        return 'sprint-notification';
      default:
        return 'default-notification';
    }
  }

  async getPreferences(userId: string, workspaceId: string): Promise<MobileNotificationPreferences> {
    return this.getOrCreatePreferences(userId, workspaceId);
  }

  private readonly VALID_CATEGORIES: NotificationCategoryType[] = ['agent', 'deployment', 'cost', 'sprint'];

  private validateCategories(categories: string[]): void {
    for (const cat of categories) {
      if (!this.VALID_CATEGORIES.includes(cat as NotificationCategoryType)) {
        throw new Error(`Invalid notification category: ${cat}`);
      }
    }
  }

  async updatePreferences(
    userId: string,
    workspaceId: string,
    updates: Partial<Pick<MobileNotificationPreferences, 'quietHoursStart' | 'quietHoursEnd' | 'categoriesEnabled' | 'urgentOnlyInQuiet'>>,
  ): Promise<MobileNotificationPreferences> {
    if (updates.categoriesEnabled) {
      this.validateCategories(updates.categoriesEnabled);
    }

    let preferences = await this.preferencesRepository.findOne({
      where: { userId, workspaceId },
    });

    if (!preferences) {
      preferences = this.preferencesRepository.create({
        userId,
        workspaceId,
        categoriesEnabled: ['agent', 'deployment', 'cost', 'sprint'] as NotificationCategoryType[],
        urgentOnlyInQuiet: true,
        ...updates,
      });
    } else {
      Object.assign(preferences, updates);
    }

    return this.preferencesRepository.save(preferences);
  }

  async cleanupExpiredTokens(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.pushTokenRepository.update(
      { lastUsedAt: LessThan(thirtyDaysAgo), isActive: true },
      { isActive: false },
    );

    const count = result.affected ?? 0;
    if (count > 0) {
      this.logger.log(`Deactivated ${count} expired push tokens`);
    }
    return count;
  }
}
