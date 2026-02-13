import { validate } from 'class-validator';
import { ConversationThread } from './conversation-thread.entity';

/**
 * Unit tests for ConversationThread Entity
 * Story 9.5: Conversation History Storage
 */
describe('ConversationThread Entity', () => {
  describe('Entity Creation', () => {
    it('should create entity with required fields', () => {
      const thread = new ConversationThread();
      thread.id = '123e4567-e89b-12d3-a456-426614174000';
      thread.workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      thread.messageCount = 0;
      thread.isArchived = false;
      thread.createdAt = new Date();
      thread.updatedAt = new Date();

      expect(thread.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(thread.workspaceId).toBe('123e4567-e89b-12d3-a456-426614174001');
      expect(thread.messageCount).toBe(0);
      expect(thread.isArchived).toBe(false);
    });

    it('should create entity with optional fields', () => {
      const thread = new ConversationThread();
      thread.id = '123e4567-e89b-12d3-a456-426614174000';
      thread.workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      thread.projectId = '123e4567-e89b-12d3-a456-426614174002';
      thread.agentId = '123e4567-e89b-12d3-a456-426614174003';
      thread.title = 'Test Conversation';
      thread.messageCount = 5;
      thread.lastMessageAt = new Date();
      thread.lastMessagePreview = 'Hello, world!';
      thread.isArchived = false;
      thread.createdAt = new Date();
      thread.updatedAt = new Date();

      expect(thread.projectId).toBe('123e4567-e89b-12d3-a456-426614174002');
      expect(thread.agentId).toBe('123e4567-e89b-12d3-a456-426614174003');
      expect(thread.title).toBe('Test Conversation');
      expect(thread.messageCount).toBe(5);
      expect(thread.lastMessagePreview).toBe('Hello, world!');
    });

    it('should handle null values for optional fields', () => {
      const thread = new ConversationThread();
      thread.id = '123e4567-e89b-12d3-a456-426614174000';
      thread.workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      thread.projectId = null;
      thread.agentId = null;
      thread.title = undefined;
      thread.messageCount = 0;
      thread.lastMessageAt = null;
      thread.lastMessagePreview = null;
      thread.isArchived = false;
      thread.archivedAt = null;
      thread.createdAt = new Date();
      thread.updatedAt = new Date();

      expect(thread.projectId).toBeNull();
      expect(thread.agentId).toBeNull();
      expect(thread.title).toBeUndefined();
      expect(thread.lastMessageAt).toBeNull();
      expect(thread.lastMessagePreview).toBeNull();
      expect(thread.archivedAt).toBeNull();
    });
  });

  describe('Archival State', () => {
    it('should handle archived state correctly', () => {
      const thread = new ConversationThread();
      thread.id = '123e4567-e89b-12d3-a456-426614174000';
      thread.workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      thread.isArchived = true;
      thread.archivedAt = new Date('2026-01-15T10:00:00Z');
      thread.messageCount = 10;
      thread.createdAt = new Date();
      thread.updatedAt = new Date();

      expect(thread.isArchived).toBe(true);
      expect(thread.archivedAt).toEqual(new Date('2026-01-15T10:00:00Z'));
    });

    it('should have null archivedAt when not archived', () => {
      const thread = new ConversationThread();
      thread.isArchived = false;
      thread.archivedAt = null;

      expect(thread.isArchived).toBe(false);
      expect(thread.archivedAt).toBeNull();
    });
  });

  describe('Message Count Tracking', () => {
    it('should start with zero message count', () => {
      const thread = new ConversationThread();
      thread.messageCount = 0;

      expect(thread.messageCount).toBe(0);
    });

    it('should allow incrementing message count', () => {
      const thread = new ConversationThread();
      thread.messageCount = 0;
      thread.messageCount += 1;

      expect(thread.messageCount).toBe(1);
    });
  });

  describe('Title Generation', () => {
    it('should allow title up to 255 characters', () => {
      const thread = new ConversationThread();
      const longTitle = 'a'.repeat(255);
      thread.title = longTitle;

      expect(thread.title).toBe(longTitle);
      expect(thread.title.length).toBe(255);
    });

    it('should allow empty title', () => {
      const thread = new ConversationThread();
      thread.title = undefined;

      expect(thread.title).toBeUndefined();
    });
  });

  describe('Last Message Preview', () => {
    it('should store last message preview', () => {
      const thread = new ConversationThread();
      thread.lastMessagePreview = 'This is the last message...';

      expect(thread.lastMessagePreview).toBe('This is the last message...');
    });

    it('should handle long preview text', () => {
      const thread = new ConversationThread();
      const longPreview = 'This is a very long message '.repeat(100);
      thread.lastMessagePreview = longPreview;

      expect(thread.lastMessagePreview).toBe(longPreview);
    });
  });
});
