import { AgentStatusUpdate, isValidAgentStatusUpdate } from './agent-status-update.entity';
import { AgentType } from './agent.entity';

describe('AgentStatusUpdate Entity', () => {
  describe('isValidAgentStatusUpdate', () => {
    it('should return true for valid status update', () => {
      const validUpdate = {
        id: 'status-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        agentType: AgentType.DEV,
        agentName: 'Dev Agent',
        previousStatus: 'idle',
        newStatus: 'coding',
        message: 'Started coding',
        category: 'progress',
        metadata: { file: 'src/auth.ts' },
        postedToChat: false,
        chatMessageId: null,
        createdAt: new Date(),
      };

      expect(isValidAgentStatusUpdate(validUpdate)).toBe(true);
    });

    it('should return true when previousStatus is null', () => {
      const validUpdate = {
        id: 'status-1',
        workspaceId: 'workspace-1',
        projectId: null,
        agentId: 'agent-1',
        agentType: AgentType.DEV,
        agentName: 'Dev Agent',
        previousStatus: null,
        newStatus: 'created',
        message: 'Agent created',
        category: 'task_lifecycle',
        metadata: null,
        postedToChat: false,
        chatMessageId: null,
        createdAt: new Date(),
      };

      expect(isValidAgentStatusUpdate(validUpdate)).toBe(true);
    });

    it('should return false for null value', () => {
      expect(isValidAgentStatusUpdate(null)).toBe(false);
    });

    it('should return false for undefined value', () => {
      expect(isValidAgentStatusUpdate(undefined)).toBe(false);
    });

    it('should return false for non-object value', () => {
      expect(isValidAgentStatusUpdate('string')).toBe(false);
      expect(isValidAgentStatusUpdate(123)).toBe(false);
      expect(isValidAgentStatusUpdate([])).toBe(false);
    });

    it('should return false when missing required fields', () => {
      const invalidUpdate = {
        id: 'status-1',
        workspaceId: 'workspace-1',
        // missing agentId
        agentType: AgentType.DEV,
        agentName: 'Dev Agent',
        newStatus: 'coding',
        message: 'Started coding',
        category: 'progress',
      };

      expect(isValidAgentStatusUpdate(invalidUpdate)).toBe(false);
    });

    it('should return false when id is not a string', () => {
      const invalidUpdate = {
        id: 123,
        workspaceId: 'workspace-1',
        agentId: 'agent-1',
        agentType: AgentType.DEV,
        agentName: 'Dev Agent',
        newStatus: 'coding',
        message: 'Started coding',
        category: 'progress',
      };

      expect(isValidAgentStatusUpdate(invalidUpdate)).toBe(false);
    });

    it('should return false when agentType is not a string', () => {
      const invalidUpdate = {
        id: 'status-1',
        workspaceId: 'workspace-1',
        agentId: 'agent-1',
        agentType: 123,
        agentName: 'Dev Agent',
        newStatus: 'coding',
        message: 'Started coding',
        category: 'progress',
      };

      expect(isValidAgentStatusUpdate(invalidUpdate)).toBe(false);
    });
  });
});
