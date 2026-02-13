/**
 * User Kanban Preferences Entity Tests
 * Story 7.8: Kanban Board Customization
 */

import {
  UserKanbanPreferences,
  DEFAULT_COLUMN_CONFIG,
  DEFAULT_CARD_DISPLAY_CONFIG,
  type KanbanColumnConfig,
  type KanbanCardDisplayConfig,
} from '../user-kanban-preferences.entity';

describe('UserKanbanPreferences Entity', () => {
  describe('DEFAULT_COLUMN_CONFIG', () => {
    it('should have all four column statuses', () => {
      const statuses = DEFAULT_COLUMN_CONFIG.map((col) => col.status);

      expect(statuses).toContain('backlog');
      expect(statuses).toContain('in_progress');
      expect(statuses).toContain('review');
      expect(statuses).toContain('done');
    });

    it('should have all columns visible by default', () => {
      const allVisible = DEFAULT_COLUMN_CONFIG.every((col) => col.visible);
      expect(allVisible).toBe(true);
    });

    it('should have columns in correct order', () => {
      expect(DEFAULT_COLUMN_CONFIG[0].order).toBe(0);
      expect(DEFAULT_COLUMN_CONFIG[1].order).toBe(1);
      expect(DEFAULT_COLUMN_CONFIG[2].order).toBe(2);
      expect(DEFAULT_COLUMN_CONFIG[3].order).toBe(3);
    });

    it('should have correct display names', () => {
      expect(DEFAULT_COLUMN_CONFIG[0].displayName).toBe('Backlog');
      expect(DEFAULT_COLUMN_CONFIG[1].displayName).toBe('In Progress');
      expect(DEFAULT_COLUMN_CONFIG[2].displayName).toBe('Review');
      expect(DEFAULT_COLUMN_CONFIG[3].displayName).toBe('Done');
    });

    it('should have exactly 4 columns', () => {
      expect(DEFAULT_COLUMN_CONFIG).toHaveLength(4);
    });
  });

  describe('DEFAULT_CARD_DISPLAY_CONFIG', () => {
    it('should have showStoryPoints enabled', () => {
      expect(DEFAULT_CARD_DISPLAY_CONFIG.showStoryPoints).toBe(true);
    });

    it('should have showTags enabled', () => {
      expect(DEFAULT_CARD_DISPLAY_CONFIG.showTags).toBe(true);
    });

    it('should have showDates disabled by default', () => {
      expect(DEFAULT_CARD_DISPLAY_CONFIG.showDates).toBe(false);
    });

    it('should have showPriority enabled', () => {
      expect(DEFAULT_CARD_DISPLAY_CONFIG.showPriority).toBe(true);
    });

    it('should have showEpic enabled', () => {
      expect(DEFAULT_CARD_DISPLAY_CONFIG.showEpic).toBe(true);
    });

    it('should have showAssignedAgent enabled', () => {
      expect(DEFAULT_CARD_DISPLAY_CONFIG.showAssignedAgent).toBe(true);
    });
  });

  describe('UserKanbanPreferences class', () => {
    it('should be defined', () => {
      expect(UserKanbanPreferences).toBeDefined();
    });

    it('should instantiate with default values', () => {
      const prefs = new UserKanbanPreferences();

      // These should be undefined until set
      expect(prefs.id).toBeUndefined();
      expect(prefs.userId).toBeUndefined();
      expect(prefs.projectId).toBeUndefined();
    });

    it('should allow setting user preferences', () => {
      const prefs = new UserKanbanPreferences();

      prefs.userId = 'user-123';
      prefs.projectId = null;
      prefs.theme = 'dark';
      prefs.columnConfig = DEFAULT_COLUMN_CONFIG;
      prefs.cardDisplayConfig = DEFAULT_CARD_DISPLAY_CONFIG;

      expect(prefs.userId).toBe('user-123');
      expect(prefs.projectId).toBeNull();
      expect(prefs.theme).toBe('dark');
      expect(prefs.columnConfig).toEqual(DEFAULT_COLUMN_CONFIG);
      expect(prefs.cardDisplayConfig).toEqual(DEFAULT_CARD_DISPLAY_CONFIG);
    });

    it('should allow per-project preferences', () => {
      const prefs = new UserKanbanPreferences();

      prefs.userId = 'user-123';
      prefs.projectId = 'project-456';
      prefs.theme = 'light';

      expect(prefs.userId).toBe('user-123');
      expect(prefs.projectId).toBe('project-456');
      expect(prefs.theme).toBe('light');
    });
  });

  describe('Type validation', () => {
    it('should validate KanbanColumnConfig structure', () => {
      const column: KanbanColumnConfig = {
        status: 'backlog',
        visible: true,
        displayName: 'To Do',
        order: 0,
      };

      expect(column.status).toBe('backlog');
      expect(column.visible).toBe(true);
      expect(column.displayName).toBe('To Do');
      expect(column.order).toBe(0);
    });

    it('should validate KanbanCardDisplayConfig structure', () => {
      const config: KanbanCardDisplayConfig = {
        showStoryPoints: false,
        showTags: false,
        showDates: true,
        showPriority: false,
        showEpic: false,
        showAssignedAgent: false,
      };

      expect(config.showStoryPoints).toBe(false);
      expect(config.showTags).toBe(false);
      expect(config.showDates).toBe(true);
      expect(config.showPriority).toBe(false);
      expect(config.showEpic).toBe(false);
      expect(config.showAssignedAgent).toBe(false);
    });
  });
});
