/**
 * Mobile Push Controller Tests
 * Story 22.7: Mobile Push Notifications
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MobilePushController } from '../mobile-push.controller';
import { MobilePushService } from '../services/mobile-push.service';

describe('MobilePushController', () => {
  let controller: MobilePushController;
  let mobilePushService: jest.Mocked<MobilePushService>;

  const mockRequest = (user: any = {}) => ({
    user: {
      sub: 'user-1',
      userId: 'user-1',
      ...user,
    },
  });

  beforeEach(async () => {
    const mockMobilePushService = {
      registerToken: jest.fn(),
      unregisterDevice: jest.fn(),
      getUserDevices: jest.fn(),
      getPreferences: jest.fn(),
      updatePreferences: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobilePushController],
      providers: [
        {
          provide: MobilePushService,
          useValue: mockMobilePushService,
        },
      ],
    }).compile();

    controller = module.get<MobilePushController>(MobilePushController);
    mobilePushService = module.get(MobilePushService);
  });

  describe('registerToken', () => {
    it('should register a valid push token', async () => {
      mobilePushService.registerToken.mockResolvedValue({} as any);

      const result = await controller.registerToken(
        mockRequest(),
        'workspace-1',
        {
          expoPushToken: 'ExponentPushToken[test123]',
          deviceId: 'device-1',
          platform: 'ios',
        },
      );

      expect(result).toEqual({ success: true, deviceId: 'device-1' });
      expect(mobilePushService.registerToken).toHaveBeenCalledWith(
        'user-1',
        'workspace-1',
        'ExponentPushToken[test123]',
        'device-1',
        'ios',
      );
    });

    it('should reject invalid Expo push token format', async () => {
      await expect(
        controller.registerToken(mockRequest(), 'workspace-1', {
          expoPushToken: 'invalid-token',
          deviceId: 'device-1',
          platform: 'ios',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if user has no access to workspace', async () => {
      await expect(
        controller.registerToken(
          mockRequest({ workspaceId: 'other-workspace' }),
          'workspace-1',
          {
            expoPushToken: 'ExponentPushToken[test123]',
            deviceId: 'device-1',
            platform: 'ios',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unregisterDevice', () => {
    it('should unregister device', async () => {
      mobilePushService.unregisterDevice.mockResolvedValue(true);

      await controller.unregisterDevice(mockRequest(), 'workspace-1', 'device-1');

      expect(mobilePushService.unregisterDevice).toHaveBeenCalledWith('user-1', 'device-1');
    });

    it('should reject if deviceId is missing', async () => {
      await expect(controller.unregisterDevice(mockRequest(), 'workspace-1', '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid deviceId format', async () => {
      await expect(
        controller.unregisterDevice(mockRequest(), 'workspace-1', 'device; DROP TABLE'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if user has no access to workspace', async () => {
      await expect(
        controller.unregisterDevice(
          mockRequest({ workspaceId: 'other-workspace' }),
          'workspace-1',
          'device-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDevices', () => {
    it('should return user devices', async () => {
      const mockDevices = [
        { id: '1', deviceId: 'device-1', platform: 'ios', isActive: true },
      ];
      mobilePushService.getUserDevices.mockResolvedValue(mockDevices as any);

      const result = await controller.getDevices(mockRequest(), 'workspace-1');

      expect(result.devices).toHaveLength(1);
      expect(result.devices[0].deviceId).toBe('device-1');
    });
  });

  describe('getPreferences', () => {
    it('should return user preferences', async () => {
      mobilePushService.getPreferences.mockResolvedValue({
        categoriesEnabled: ['agent', 'deployment'],
        urgentOnlyInQuiet: true,
      } as any);

      const result = await controller.getPreferences(mockRequest(), 'workspace-1');

      expect(result.categoriesEnabled).toEqual(['agent', 'deployment']);
      expect(result.urgentOnlyInQuiet).toBe(true);
    });
  });

  describe('updatePreferences', () => {
    it('should update preferences with valid time format', async () => {
      mobilePushService.updatePreferences.mockResolvedValue({
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        categoriesEnabled: ['agent'],
        urgentOnlyInQuiet: true,
      } as any);

      const result = await controller.updatePreferences(mockRequest(), 'workspace-1', {
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      });

      expect(result.quietHoursStart).toBe('22:00');
      expect(result.quietHoursEnd).toBe('08:00');
    });

    it('should reject invalid time format', async () => {
      await expect(
        controller.updatePreferences(mockRequest(), 'workspace-1', {
          quietHoursStart: '25:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('isValidTimeFormat', () => {
    it('should validate correct time format', () => {
      expect((controller as any).isValidTimeFormat('22:00')).toBe(true);
      expect((controller as any).isValidTimeFormat('08:30')).toBe(true);
      expect((controller as any).isValidTimeFormat('00:00')).toBe(true);
      expect((controller as any).isValidTimeFormat('23:59')).toBe(true);
    });

    it('should reject invalid time format', () => {
      expect((controller as any).isValidTimeFormat('25:00')).toBe(false);
      expect((controller as any).isValidTimeFormat('22:60')).toBe(false);
      expect((controller as any).isValidTimeFormat('2:00')).toBe(false);
      expect((controller as any).isValidTimeFormat('22:0')).toBe(false);
    });
  });
});
