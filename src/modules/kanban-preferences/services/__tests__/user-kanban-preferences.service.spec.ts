/**
 * User Kanban Preferences Service Tests
 * Story 7.8: Kanban Board Customization
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, IsNull, FindOperator, SelectQueryBuilder } from 'typeorm';
import { UserKanbanPreferencesService } from '../user-kanban-preferences.service';
import {
  UserKanbanPreferences,
  DEFAULT_COLUMN_CONFIG,
  DEFAULT_CARD_DISPLAY_CONFIG,
} from '../../../../database/entities/user-kanban-preferences.entity';

describe('UserKanbanPreferencesService', () => {
  let service: UserKanbanPreferencesService;
  let repository: jest.Mocked<Repository<UserKanbanPreferences>> & {
    createQueryBuilder: jest.Mock;
  };

  const mockUserId = 'user-123';
  const mockProjectId = 'project-456';

  const mockPreferences: UserKanbanPreferences = {
    id: 'pref-1',
    userId: mockUserId,
    projectId: null,
    columnConfig: DEFAULT_COLUMN_CONFIG,
    cardDisplayConfig: DEFAULT_CARD_DISPLAY_CONFIG,
    theme: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: null as any,
    project: null,
  };

  const mockProjectPreferences: UserKanbanPreferences = {
    ...mockPreferences,
    id: 'pref-2',
    projectId: mockProjectId,
    theme: 'dark',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserKanbanPreferencesService,
        {
          provide: getRepositoryToken(UserKanbanPreferences),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
              delete: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ affected: 1 }),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<UserKanbanPreferencesService>(UserKanbanPreferencesService);
    repository = module.get(getRepositoryToken(UserKanbanPreferences));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPreferences', () => {
    it('should return user preferences for existing user', async () => {
      repository.findOne.mockResolvedValueOnce(mockPreferences);

      const result = await service.getPreferences(mockUserId);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: mockUserId, projectId: expect.any(FindOperator) },
      });
      expect(result.columns).toEqual(DEFAULT_COLUMN_CONFIG);
      expect(result.cardDisplay).toEqual(DEFAULT_CARD_DISPLAY_CONFIG);
      expect(result.theme).toBe('system');
    });

    it('should return built-in defaults for new user', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.getPreferences(mockUserId);

      expect(result.columns).toEqual(DEFAULT_COLUMN_CONFIG);
      expect(result.cardDisplay).toEqual(DEFAULT_CARD_DISPLAY_CONFIG);
      expect(result.theme).toBe('system');
    });

    it('should support projectId for per-project preferences', async () => {
      repository.findOne.mockResolvedValueOnce(mockProjectPreferences);

      const result = await service.getPreferences(mockUserId, mockProjectId);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: mockUserId, projectId: mockProjectId },
      });
      expect(result.theme).toBe('dark');
    });

    it('should fall back to user defaults if project preferences not found', async () => {
      // First call for project prefs returns null
      repository.findOne.mockResolvedValueOnce(null);
      // Second call for user defaults returns prefs
      repository.findOne.mockResolvedValueOnce(mockPreferences);

      const result = await service.getPreferences(mockUserId, mockProjectId);

      expect(repository.findOne).toHaveBeenCalledTimes(2);
      expect(result.theme).toBe('system');
    });

    it('should return built-in defaults if no preferences exist', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.getPreferences(mockUserId, mockProjectId);

      expect(result.columns).toEqual(DEFAULT_COLUMN_CONFIG);
      expect(result.cardDisplay).toEqual(DEFAULT_CARD_DISPLAY_CONFIG);
      expect(result.theme).toBe('system');
    });
  });

  describe('updatePreferences', () => {
    it('should update existing preferences', async () => {
      repository.findOne.mockResolvedValueOnce(mockPreferences);
      repository.save.mockResolvedValueOnce({
        ...mockPreferences,
        theme: 'dark',
      });

      const result = await service.updatePreferences(mockUserId, null, {
        theme: 'dark',
      });

      expect(repository.save).toHaveBeenCalled();
      expect(result.theme).toBe('dark');
    });

    it('should create new preferences if none exist', async () => {
      repository.findOne.mockResolvedValueOnce(null);
      repository.create.mockReturnValueOnce({
        ...mockPreferences,
        theme: 'light',
      } as UserKanbanPreferences);
      repository.save.mockResolvedValueOnce({
        ...mockPreferences,
        theme: 'light',
      });

      const result = await service.updatePreferences(mockUserId, null, {
        theme: 'light',
      });

      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
      expect(result.theme).toBe('light');
    });

    it('should merge partial cardDisplay updates', async () => {
      const existingPrefs = {
        ...mockPreferences,
        cardDisplayConfig: { ...DEFAULT_CARD_DISPLAY_CONFIG },
      };
      repository.findOne.mockResolvedValueOnce(existingPrefs);
      repository.save.mockImplementation(async (entity) => entity as UserKanbanPreferences);

      const result = await service.updatePreferences(mockUserId, null, {
        cardDisplay: { showDates: true },
      });

      expect(result.cardDisplay.showDates).toBe(true);
      expect(result.cardDisplay.showStoryPoints).toBe(true); // Preserved
    });

    it('should update column config', async () => {
      const newColumns = [
        { status: 'backlog', visible: false, displayName: 'Todo', order: 0 },
        { status: 'done', visible: true, displayName: 'Complete', order: 1 },
      ];

      repository.findOne.mockResolvedValueOnce(mockPreferences);
      repository.save.mockImplementation(async (entity) => entity as UserKanbanPreferences);

      const result = await service.updatePreferences(mockUserId, null, {
        columns: newColumns,
      });

      expect(result.columns).toEqual(newColumns);
    });
  });

  describe('resetPreferences', () => {
    it('should delete user default preferences using query builder and return defaults', async () => {
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      repository.createQueryBuilder.mockReturnValueOnce(mockQueryBuilder as any);

      const result = await service.resetPreferences(mockUserId);

      expect(repository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'userId = :userId AND projectId IS NULL',
        { userId: mockUserId }
      );
      expect(result.columns).toEqual(DEFAULT_COLUMN_CONFIG);
      expect(result.cardDisplay).toEqual(DEFAULT_CARD_DISPLAY_CONFIG);
      expect(result.theme).toBe('system');
    });

    it('should reset project-specific preferences using delete', async () => {
      repository.delete.mockResolvedValueOnce({ affected: 1 } as any);

      const result = await service.resetPreferences(mockUserId, mockProjectId);

      expect(repository.delete).toHaveBeenCalledWith({
        userId: mockUserId,
        projectId: mockProjectId,
      });
      expect(result.theme).toBe('system');
    });

    it('should return defaults even if no preferences to delete', async () => {
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      repository.createQueryBuilder.mockReturnValueOnce(mockQueryBuilder as any);

      const result = await service.resetPreferences(mockUserId);

      expect(result.columns).toEqual(DEFAULT_COLUMN_CONFIG);
      expect(result.theme).toBe('system');
    });
  });
});
