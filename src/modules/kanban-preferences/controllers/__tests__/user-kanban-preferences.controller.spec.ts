/**
 * User Kanban Preferences Controller Tests
 * Story 7.8: Kanban Board Customization
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UserKanbanPreferencesController } from '../user-kanban-preferences.controller';
import { UserKanbanPreferencesService } from '../../services/user-kanban-preferences.service';
import {
  DEFAULT_COLUMN_CONFIG,
  DEFAULT_CARD_DISPLAY_CONFIG,
} from '../../../../database/entities/user-kanban-preferences.entity';
import { User } from '../../../../database/entities/user.entity';

describe('UserKanbanPreferencesController', () => {
  let controller: UserKanbanPreferencesController;
  let service: jest.Mocked<UserKanbanPreferencesService>;

  const mockUserId = 'user-123';
  const mockProjectId = 'project-456';

  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
  } as User;

  const mockRequest = {
    user: mockUser,
  } as any;

  const mockPreferences = {
    columns: DEFAULT_COLUMN_CONFIG,
    cardDisplay: DEFAULT_CARD_DISPLAY_CONFIG,
    theme: 'system',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserKanbanPreferencesController],
      providers: [
        {
          provide: UserKanbanPreferencesService,
          useValue: {
            getPreferences: jest.fn(),
            updatePreferences: jest.fn(),
            resetPreferences: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UserKanbanPreferencesController>(UserKanbanPreferencesController);
    service = module.get(UserKanbanPreferencesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPreferences', () => {
    it('should return user preferences', async () => {
      service.getPreferences.mockResolvedValue(mockPreferences);

      const result = await controller.getPreferences(mockRequest);

      expect(service.getPreferences).toHaveBeenCalledWith(mockUserId, undefined);
      expect(result).toEqual({ preferences: mockPreferences });
    });

    it('should support projectId parameter', async () => {
      service.getPreferences.mockResolvedValue(mockPreferences);

      const result = await controller.getPreferences(mockRequest, mockProjectId);

      expect(service.getPreferences).toHaveBeenCalledWith(mockUserId, mockProjectId);
      expect(result).toEqual({ preferences: mockPreferences });
    });

    it('should return defaults for new users', async () => {
      service.getPreferences.mockResolvedValue(mockPreferences);

      const result = await controller.getPreferences(mockRequest);

      expect(result.preferences.theme).toBe('system');
      expect(result.preferences.columns).toEqual(DEFAULT_COLUMN_CONFIG);
    });
  });

  describe('updatePreferences', () => {
    it('should update user preferences', async () => {
      const updatedPrefs = { ...mockPreferences, theme: 'dark' };
      service.updatePreferences.mockResolvedValue(updatedPrefs);

      const result = await controller.updatePreferences(
        mockRequest,
        { theme: 'dark' },
      );

      expect(service.updatePreferences).toHaveBeenCalledWith(
        mockUserId,
        null,
        { theme: 'dark', columns: undefined, cardDisplay: undefined },
      );
      expect(result.preferences.theme).toBe('dark');
    });

    it('should support projectId for per-project preferences', async () => {
      service.updatePreferences.mockResolvedValue(mockPreferences);

      await controller.updatePreferences(mockRequest, { theme: 'light' }, mockProjectId);

      expect(service.updatePreferences).toHaveBeenCalledWith(
        mockUserId,
        mockProjectId,
        expect.any(Object),
      );
    });

    it('should update column configurations', async () => {
      const newColumns = [
        { status: 'backlog' as const, visible: false, displayName: 'Todo', order: 0 },
      ];
      service.updatePreferences.mockResolvedValue({ ...mockPreferences, columns: newColumns as any });

      const result = await controller.updatePreferences(
        mockRequest,
        { columns: newColumns as any },
      );

      expect(result.preferences.columns).toEqual(newColumns);
    });

    it('should update card display config', async () => {
      const cardDisplay = { showDates: true };
      service.updatePreferences.mockResolvedValue({
        ...mockPreferences,
        cardDisplay: { ...DEFAULT_CARD_DISPLAY_CONFIG, showDates: true },
      });

      const result = await controller.updatePreferences(
        mockRequest,
        { cardDisplay },
      );

      expect(result.preferences.cardDisplay.showDates).toBe(true);
    });
  });

  describe('resetPreferences', () => {
    it('should reset preferences to defaults', async () => {
      service.resetPreferences.mockResolvedValue(mockPreferences);

      const result = await controller.resetPreferences(mockRequest);

      expect(service.resetPreferences).toHaveBeenCalledWith(mockUserId, undefined);
      expect(result.preferences).toEqual(mockPreferences);
    });

    it('should reset project-specific preferences', async () => {
      service.resetPreferences.mockResolvedValue(mockPreferences);

      await controller.resetPreferences(mockRequest, mockProjectId);

      expect(service.resetPreferences).toHaveBeenCalledWith(mockUserId, mockProjectId);
    });

    it('should return default preferences after reset', async () => {
      service.resetPreferences.mockResolvedValue(mockPreferences);

      const result = await controller.resetPreferences(mockRequest);

      expect(result.preferences.theme).toBe('system');
      expect(result.preferences.columns).toEqual(DEFAULT_COLUMN_CONFIG);
      expect(result.preferences.cardDisplay).toEqual(DEFAULT_CARD_DISPLAY_CONFIG);
    });
  });

  describe('authentication', () => {
    it('should use user ID from request', async () => {
      service.getPreferences.mockResolvedValue(mockPreferences);

      await controller.getPreferences(mockRequest);

      expect(service.getPreferences).toHaveBeenCalledWith(mockUserId, undefined);
    });
  });
});
