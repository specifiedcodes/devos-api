import {
  AGENT_CHAT_PROMPTS,
  buildAgentPrompt,
  getAgentTypeName,
  hasAgentPrompt,
} from './chat-prompts';
import { AgentType, AgentStatus } from '../../../database/entities/agent.entity';
import { ChatSenderType, ChatMessageStatus } from '../../../database/entities/chat-message.entity';

describe('ChatPrompts', () => {
  describe('AGENT_CHAT_PROMPTS', () => {
    it('should have prompts for all agent types', () => {
      const agentTypes = Object.values(AgentType);
      agentTypes.forEach((type) => {
        expect(AGENT_CHAT_PROMPTS[type]).toBeDefined();
        expect(typeof AGENT_CHAT_PROMPTS[type]).toBe('string');
        expect(AGENT_CHAT_PROMPTS[type].length).toBeGreaterThan(0);
      });
    });

    it('should have DEV agent prompt with correct persona', () => {
      expect(AGENT_CHAT_PROMPTS[AgentType.DEV]).toContain('Dev Agent');
      expect(AGENT_CHAT_PROMPTS[AgentType.DEV]).toContain('code');
    });

    it('should have QA agent prompt with testing focus', () => {
      expect(AGENT_CHAT_PROMPTS[AgentType.QA]).toContain('QA Agent');
      expect(AGENT_CHAT_PROMPTS[AgentType.QA]).toContain('test');
    });

    it('should have PLANNER agent prompt with planning focus', () => {
      expect(AGENT_CHAT_PROMPTS[AgentType.PLANNER]).toContain('Planner Agent');
      expect(AGENT_CHAT_PROMPTS[AgentType.PLANNER]).toContain('epic');
    });

    it('should have DEVOPS agent prompt with infrastructure focus', () => {
      expect(AGENT_CHAT_PROMPTS[AgentType.DEVOPS]).toContain('DevOps Agent');
      expect(AGENT_CHAT_PROMPTS[AgentType.DEVOPS]).toContain('deployment');
    });

    it('should have ORCHESTRATOR agent prompt with coordination focus', () => {
      expect(AGENT_CHAT_PROMPTS[AgentType.ORCHESTRATOR]).toContain('Orchestrator');
      expect(AGENT_CHAT_PROMPTS[AgentType.ORCHESTRATOR]).toContain('coordinate');
    });
  });

  describe('buildAgentPrompt', () => {
    const mockAgent = {
      type: AgentType.DEV,
      status: AgentStatus.RUNNING,
      currentTask: 'Implementing user authentication',
      lastHeartbeat: new Date('2026-02-13T14:30:00Z'),
    };

    const mockMessages = [
      {
        id: 'msg-1',
        workspaceId: 'ws-1',
        agentId: 'agent-1',
        userId: 'user-1',
        senderType: ChatSenderType.USER,
        agentType: null,
        text: 'How is the task going?',
        status: ChatMessageStatus.SENT,
        isStatusUpdate: false,
        metadata: null,
        deliveredAt: null,
        readAt: null,
        projectId: null,
        createdAt: new Date('2026-02-13T14:29:00Z'),
        updatedAt: new Date('2026-02-13T14:29:00Z'),
      },
      {
        id: 'msg-2',
        workspaceId: 'ws-1',
        agentId: 'agent-1',
        userId: null,
        senderType: ChatSenderType.AGENT,
        agentType: AgentType.DEV,
        text: "I'm making good progress on the authentication module.",
        status: ChatMessageStatus.SENT,
        isStatusUpdate: false,
        metadata: null,
        deliveredAt: null,
        readAt: null,
        projectId: null,
        createdAt: new Date('2026-02-13T14:29:30Z'),
        updatedAt: new Date('2026-02-13T14:29:30Z'),
      },
    ];

    it('should include agent base prompt in system prompt', () => {
      const result = buildAgentPrompt(mockAgent, 'What is the ETA?', {
        lastMessages: [],
      });

      expect(result.systemPrompt).toContain('Dev Agent');
      expect(result.systemPrompt).toContain('code');
    });

    it('should include agent current state in system prompt', () => {
      const result = buildAgentPrompt(mockAgent, 'What is the ETA?', {
        lastMessages: [],
      });

      expect(result.systemPrompt).toContain('Current Task: Implementing user authentication');
      expect(result.systemPrompt).toContain('Agent Status: running');
      expect(result.systemPrompt).toContain('2026-02-13');
    });

    it('should handle agent with no current task', () => {
      const agentNoTask = { ...mockAgent, currentTask: null };
      const result = buildAgentPrompt(agentNoTask, 'What are you working on?', {
        lastMessages: [],
      });

      expect(result.systemPrompt).toContain('Current Task: No active task');
    });

    it('should include conversation history in user prompt', () => {
      const result = buildAgentPrompt(mockAgent, 'What is left to do?', {
        lastMessages: mockMessages as any,
      });

      expect(result.userPrompt).toContain('Conversation History');
      expect(result.userPrompt).toContain('User: How is the task going?');
      expect(result.userPrompt).toContain('Agent (dev): I\'m making good progress');
    });

    it('should include user message in prompt', () => {
      const result = buildAgentPrompt(mockAgent, 'What is the ETA?', {
        lastMessages: [],
      });

      expect(result.userPrompt).toContain("User's Message: What is the ETA?");
    });

    it('should not include history section when no messages', () => {
      const result = buildAgentPrompt(mockAgent, 'Hello!', {
        lastMessages: [],
      });

      expect(result.userPrompt).not.toContain('Conversation History');
      expect(result.userPrompt).toContain("User's Message: Hello!");
    });

    it('should handle all agent types', () => {
      const agentTypes = Object.values(AgentType);
      agentTypes.forEach((type) => {
        const agent = { ...mockAgent, type };
        const result = buildAgentPrompt(agent, 'Test message', {
          lastMessages: [],
        });

        expect(result.systemPrompt.length).toBeGreaterThan(0);
        expect(result.userPrompt.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getAgentTypeName', () => {
    it('should return correct name for DEV agent', () => {
      expect(getAgentTypeName(AgentType.DEV)).toBe('Dev Agent');
    });

    it('should return correct name for QA agent', () => {
      expect(getAgentTypeName(AgentType.QA)).toBe('QA Agent');
    });

    it('should return correct name for PLANNER agent', () => {
      expect(getAgentTypeName(AgentType.PLANNER)).toBe('Planner Agent');
    });

    it('should return correct name for DEVOPS agent', () => {
      expect(getAgentTypeName(AgentType.DEVOPS)).toBe('DevOps Agent');
    });

    it('should return correct name for ORCHESTRATOR agent', () => {
      expect(getAgentTypeName(AgentType.ORCHESTRATOR)).toBe('Orchestrator');
    });
  });

  describe('hasAgentPrompt', () => {
    it('should return true for all valid agent types', () => {
      const agentTypes = Object.values(AgentType);
      agentTypes.forEach((type) => {
        expect(hasAgentPrompt(type)).toBe(true);
      });
    });
  });
});
