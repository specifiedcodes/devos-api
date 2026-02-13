import {
  ChatMessage,
  ChatSenderType,
  ChatMessageStatus,
} from './chat-message.entity';
import { AgentType } from './agent.entity';

describe('ChatMessage Entity', () => {
  describe('ChatSenderType enum', () => {
    it('should have USER value', () => {
      expect(ChatSenderType.USER).toBe('user');
    });

    it('should have AGENT value', () => {
      expect(ChatSenderType.AGENT).toBe('agent');
    });
  });

  describe('ChatMessageStatus enum', () => {
    it('should have SENT value', () => {
      expect(ChatMessageStatus.SENT).toBe('sent');
    });

    it('should have DELIVERED value', () => {
      expect(ChatMessageStatus.DELIVERED).toBe('delivered');
    });

    it('should have READ value', () => {
      expect(ChatMessageStatus.READ).toBe('read');
    });
  });

  describe('ChatMessage', () => {
    it('should create a user message with all required fields', () => {
      const message = new ChatMessage();
      message.id = '550e8400-e29b-41d4-a716-446655440001';
      message.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      message.agentId = '550e8400-e29b-41d4-a716-446655440003';
      message.userId = '550e8400-e29b-41d4-a716-446655440004';
      message.senderType = ChatSenderType.USER;
      message.text = 'Hello, how is the task going?';
      message.status = ChatMessageStatus.SENT;
      message.createdAt = new Date();
      message.updatedAt = new Date();

      expect(message.id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(message.workspaceId).toBe('550e8400-e29b-41d4-a716-446655440002');
      expect(message.agentId).toBe('550e8400-e29b-41d4-a716-446655440003');
      expect(message.userId).toBe('550e8400-e29b-41d4-a716-446655440004');
      expect(message.senderType).toBe(ChatSenderType.USER);
      expect(message.text).toBe('Hello, how is the task going?');
      expect(message.status).toBe(ChatMessageStatus.SENT);
    });

    it('should create an agent message with agentType', () => {
      const message = new ChatMessage();
      message.id = '550e8400-e29b-41d4-a716-446655440001';
      message.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      message.agentId = '550e8400-e29b-41d4-a716-446655440003';
      message.userId = null;
      message.senderType = ChatSenderType.AGENT;
      message.agentType = AgentType.DEV;
      message.text = 'Task is 75% complete. Working on tests now.';
      message.status = ChatMessageStatus.SENT;
      message.createdAt = new Date();
      message.updatedAt = new Date();

      expect(message.senderType).toBe(ChatSenderType.AGENT);
      expect(message.agentType).toBe(AgentType.DEV);
      expect(message.userId).toBeNull();
    });

    it('should handle nullable fields correctly', () => {
      const message = new ChatMessage();
      message.id = '550e8400-e29b-41d4-a716-446655440001';
      message.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      message.projectId = null;
      message.agentId = null;
      message.userId = '550e8400-e29b-41d4-a716-446655440004';
      message.senderType = ChatSenderType.USER;
      message.agentType = null;
      message.text = 'A general workspace message';
      message.metadata = null;
      message.status = ChatMessageStatus.SENT;
      message.deliveredAt = null;
      message.readAt = null;

      expect(message.projectId).toBeNull();
      expect(message.agentId).toBeNull();
      expect(message.agentType).toBeNull();
      expect(message.metadata).toBeNull();
      expect(message.deliveredAt).toBeNull();
      expect(message.readAt).toBeNull();
    });

    it('should support status update messages', () => {
      const message = new ChatMessage();
      message.id = '550e8400-e29b-41d4-a716-446655440001';
      message.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      message.agentId = '550e8400-e29b-41d4-a716-446655440003';
      message.userId = null;
      message.senderType = ChatSenderType.AGENT;
      message.agentType = AgentType.DEVOPS;
      message.text = 'Deployment completed successfully';
      message.isStatusUpdate = true;
      message.status = ChatMessageStatus.SENT;

      expect(message.isStatusUpdate).toBe(true);
    });

    it('should support metadata for attachments and links', () => {
      const message = new ChatMessage();
      message.id = '550e8400-e29b-41d4-a716-446655440001';
      message.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      message.agentId = '550e8400-e29b-41d4-a716-446655440003';
      message.userId = '550e8400-e29b-41d4-a716-446655440004';
      message.senderType = ChatSenderType.USER;
      message.text = 'Check this file';
      message.metadata = {
        attachments: [{ name: 'file.txt', size: 1024 }],
        links: ['https://github.com/example/repo'],
      };
      message.status = ChatMessageStatus.SENT;

      expect(message.metadata).toBeDefined();
      expect(message.metadata!.attachments).toHaveLength(1);
      expect(message.metadata!.links).toHaveLength(1);
    });

    it('should track delivery timestamps', () => {
      const message = new ChatMessage();
      message.id = '550e8400-e29b-41d4-a716-446655440001';
      message.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      message.agentId = '550e8400-e29b-41d4-a716-446655440003';
      message.userId = '550e8400-e29b-41d4-a716-446655440004';
      message.senderType = ChatSenderType.USER;
      message.text = 'Test message';
      message.status = ChatMessageStatus.DELIVERED;
      message.deliveredAt = new Date('2026-02-13T14:30:05Z');

      expect(message.status).toBe(ChatMessageStatus.DELIVERED);
      expect(message.deliveredAt).toEqual(new Date('2026-02-13T14:30:05Z'));
    });

    it('should track read timestamps', () => {
      const message = new ChatMessage();
      message.id = '550e8400-e29b-41d4-a716-446655440001';
      message.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      message.agentId = '550e8400-e29b-41d4-a716-446655440003';
      message.userId = '550e8400-e29b-41d4-a716-446655440004';
      message.senderType = ChatSenderType.USER;
      message.text = 'Test message';
      message.status = ChatMessageStatus.READ;
      message.deliveredAt = new Date('2026-02-13T14:30:05Z');
      message.readAt = new Date('2026-02-13T14:30:10Z');

      expect(message.status).toBe(ChatMessageStatus.READ);
      expect(message.readAt).toEqual(new Date('2026-02-13T14:30:10Z'));
    });

    it('should support all AgentType values for agentType field', () => {
      const agentTypes = [
        AgentType.DEV,
        AgentType.PLANNER,
        AgentType.QA,
        AgentType.DEVOPS,
        AgentType.ORCHESTRATOR,
      ];

      agentTypes.forEach((agentType) => {
        const message = new ChatMessage();
        message.agentType = agentType;
        expect(message.agentType).toBe(agentType);
      });
    });
  });
});
