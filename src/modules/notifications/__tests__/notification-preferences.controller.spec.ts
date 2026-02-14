/**
 * NotificationPreferencesController Tests
 * Story 10.6: Configurable Notification Preferences
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { NotificationPreferencesController } from '../controllers/notification-preferences.controller';
import { NotificationPreferencesService } from '../services/notification-preferences.service';
import { QuietHoursService } from '../services/quiet-hours.service';
import {
  NotificationPreferences,
  DEFAULT_EVENT_NOTIFICATION_SETTINGS,
  DEFAULT_CHANNEL_PREFERENCES,
  DEFAULT_QUIET_HOURS_CONFIG,
} from '../../../database/entities/notification-preferences.entity';

describe('NotificationPreferencesController', () => {
  let controller: NotificationPreferencesController;
  let preferencesService: jest.Mocked<NotificationPreferencesService>;
  let quietHoursService: jest.Mocked<QuietHoursService>;

  const mockRequestId = 'user-123';
  const mockWorkspaceId = 'workspace-456';
  const mockRequest = { user: { sub: mockRequestId, email: 'test@example.com' } };

  const createMockPreferences = (): NotificationPreferences => ({
    id: 'pref-789',
    userId: mockRequestId,
    workspaceId: mockWorkspaceId,
    enabled: true,
    pushEnabled: true,
    soundEnabled: true,
    soundVolume: 0.5,
    soundFile: 'default',
    dndEnabled: false,
    dndSchedule: null,
    agentSettings: {},
    typeSettings: {
      chatMessages: true,
      statusUpdates: true,
      taskCompletions: true,
      errors: true,
      mentions: true,
    },
    eventSettings: { ...DEFAULT_EVENT_NOTIFICATION_SETTINGS },
    channelPreferences: { ...DEFAULT_CHANNEL_PREFERENCES },
    perTypeChannelOverrides: null,
    inAppEnabled: true,
    emailEnabled: false,
    quietHours: { ...DEFAULT_QUIET_HOURS_CONFIG },
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {} as any,
    workspace: {} as any,
  });

  beforeEach(async () => {
    const mockPreferencesService = {
      getPreferences: jest.fn(),
      updatePreferences: jest.fn(),
    };

    const mockQuietHoursService = {
      getStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationPreferencesController],
      providers: [
        {
          provide: NotificationPreferencesService,
          useValue: mockPreferencesService,
        },
        {
          provide: QuietHoursService,
          useValue: mockQuietHoursService,
        },
      ],
    }).compile();

    controller = module.get<NotificationPreferencesController>(
      NotificationPreferencesController,
    );
    preferencesService = module.get(NotificationPreferencesService);
    quietHoursService = module.get(QuietHoursService);
  });

  describe('getPreferences', () => {
    it('should return notification preferences', async () => {
      const mockPrefs = createMockPreferences();
      preferencesService.getPreferences.mockResolvedValueOnce(mockPrefs);

      const result = await controller.getPreferences(mockWorkspaceId, mockRequest);

      expect(result.id).toBe(mockPrefs.id);
      expect(result.userId).toBe(mockRequestId);
      expect(result.workspaceId).toBe(mockWorkspaceId);
      expect(result.eventSettings).toEqual(DEFAULT_EVENT_NOTIFICATION_SETTINGS);
      expect(result.channelPreferences).toEqual(DEFAULT_CHANNEL_PREFERENCES);
      expect(result.quietHours).toEqual(DEFAULT_QUIET_HOURS_CONFIG);
    });

    it('should call service with correct parameters', async () => {
      const mockPrefs = createMockPreferences();
      preferencesService.getPreferences.mockResolvedValueOnce(mockPrefs);

      await controller.getPreferences(mockWorkspaceId, mockRequest);

      expect(preferencesService.getPreferences).toHaveBeenCalledWith(
        mockRequestId,
        mockWorkspaceId,
      );
    });
  });

  describe('updatePreferences', () => {
    it('should update event settings', async () => {
      const mockPrefs = createMockPreferences();
      mockPrefs.eventSettings.epicCompletions = false;
      preferencesService.updatePreferences.mockResolvedValueOnce(mockPrefs);

      const result = await controller.updatePreferences(
        mockWorkspaceId,
        mockRequest,
        { eventSettings: { epicCompletions: false } },
      );

      expect(result.eventSettings.epicCompletions).toBe(false);
      expect(preferencesService.updatePreferences).toHaveBeenCalledWith(
        mockRequestId,
        mockWorkspaceId,
        { eventSettings: { epicCompletions: false } },
      );
    });

    it('should update channel preferences', async () => {
      const mockPrefs = createMockPreferences();
      mockPrefs.channelPreferences.push = false;
      preferencesService.updatePreferences.mockResolvedValueOnce(mockPrefs);

      const result = await controller.updatePreferences(
        mockWorkspaceId,
        mockRequest,
        { channelPreferences: { push: false } },
      );

      expect(result.channelPreferences.push).toBe(false);
    });

    it('should update quiet hours', async () => {
      const mockPrefs = createMockPreferences();
      mockPrefs.quietHours.enabled = true;
      mockPrefs.quietHours.timezone = 'America/New_York';
      preferencesService.updatePreferences.mockResolvedValueOnce(mockPrefs);

      const result = await controller.updatePreferences(
        mockWorkspaceId,
        mockRequest,
        { quietHours: { enabled: true, timezone: 'America/New_York' } },
      );

      expect(result.quietHours.enabled).toBe(true);
      expect(result.quietHours.timezone).toBe('America/New_York');
    });

    it('should reject disabling critical notifications', async () => {
      preferencesService.updatePreferences.mockRejectedValueOnce(
        new BadRequestException('Critical notification "deploymentFailure" cannot be disabled'),
      );

      await expect(
        controller.updatePreferences(mockWorkspaceId, mockRequest, {
          eventSettings: { deploymentFailure: false },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update global settings', async () => {
      const mockPrefs = createMockPreferences();
      mockPrefs.enabled = false;
      mockPrefs.pushEnabled = false;
      preferencesService.updatePreferences.mockResolvedValueOnce(mockPrefs);

      const result = await controller.updatePreferences(
        mockWorkspaceId,
        mockRequest,
        { enabled: false, pushEnabled: false },
      );

      expect(result.enabled).toBe(false);
      expect(result.pushEnabled).toBe(false);
    });
  });

  describe('getQuietHoursStatus', () => {
    it('should return quiet hours status when not in quiet hours', async () => {
      const mockPrefs = createMockPreferences();
      preferencesService.getPreferences.mockResolvedValueOnce(mockPrefs);
      quietHoursService.getStatus.mockResolvedValueOnce({
        inQuietHours: false,
      });

      const result = await controller.getQuietHoursStatus(
        mockWorkspaceId,
        mockRequest,
      );

      expect(result.inQuietHours).toBe(false);
      expect(result.endsAt).toBeUndefined();
    });

    it('should return quiet hours status with end time when in quiet hours', async () => {
      const mockPrefs = createMockPreferences();
      mockPrefs.quietHours.enabled = true;
      preferencesService.getPreferences.mockResolvedValueOnce(mockPrefs);
      quietHoursService.getStatus.mockResolvedValueOnce({
        inQuietHours: true,
        endsAt: '2024-01-15T08:00:00.000Z',
        timezone: 'America/New_York',
      });

      const result = await controller.getQuietHoursStatus(
        mockWorkspaceId,
        mockRequest,
      );

      expect(result.inQuietHours).toBe(true);
      expect(result.endsAt).toBeDefined();
      expect(result.timezone).toBe('America/New_York');
    });
  });

  describe('response DTO conversion', () => {
    it('should convert entity to response DTO correctly', async () => {
      const mockPrefs = createMockPreferences();
      preferencesService.getPreferences.mockResolvedValueOnce(mockPrefs);

      const result = await controller.getPreferences(mockWorkspaceId, mockRequest);

      expect(result.id).toBe(mockPrefs.id);
      expect(result.userId).toBe(mockPrefs.userId);
      expect(result.workspaceId).toBe(mockPrefs.workspaceId);
      expect(result.enabled).toBe(mockPrefs.enabled);
      expect(result.pushEnabled).toBe(mockPrefs.pushEnabled);
      expect(result.soundEnabled).toBe(mockPrefs.soundEnabled);
      expect(result.soundVolume).toBe(mockPrefs.soundVolume);
      expect(result.soundFile).toBe(mockPrefs.soundFile);
      expect(result.dndEnabled).toBe(mockPrefs.dndEnabled);
      expect(result.eventSettings).toEqual(mockPrefs.eventSettings);
      expect(result.channelPreferences).toEqual(mockPrefs.channelPreferences);
      expect(result.quietHours).toEqual(mockPrefs.quietHours);
      expect(result.inAppEnabled).toBe(mockPrefs.inAppEnabled);
      expect(result.emailEnabled).toBe(mockPrefs.emailEnabled);
    });
  });
});
