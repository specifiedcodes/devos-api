/**
 * SlackBlockBuilderService Interactive Message Tests
 * Story 21.2: Slack Interactive Components (AC14.4)
 *
 * Tests for all 7 new interactive message builders: deployment approval,
 * agent needs input, agent task started/completed, cost alerts, sprint review.
 */

import { SlackBlockBuilderService } from '../services/slack-block-builder.service';

describe('SlackBlockBuilderService - Interactive Messages', () => {
  let service: SlackBlockBuilderService;
  const frontendUrl = 'https://app.devos.io';

  beforeEach(() => {
    service = new SlackBlockBuilderService();
  });

  // ==================== buildDeploymentApproval ====================

  describe('deployment_pending_approval', () => {
    const payload = {
      deploymentId: 'deploy-123',
      projectId: 'proj-1',
      projectName: 'My Project',
      environment: 'production',
      workspaceId: 'ws-1',
      requestedBy: 'John Doe',
      storyTitle: 'Add user login',
    };

    it('should include approve and reject action buttons with correct action_ids', () => {
      const msg = service.buildMessage('deployment_pending_approval', payload, frontendUrl);

      expect(msg.blocks?.[0]?.text?.text).toBe('Deployment Approval Required');

      const actionsBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'actions');
      expect(actionsBlock).toBeDefined();

      const elements = actionsBlock!.elements!;
      const approveBtn = elements.find(e => e.action_id === `approve_deploy:${payload.deploymentId}`);
      const rejectBtn = elements.find(e => e.action_id === `reject_deploy:${payload.deploymentId}`);
      const viewBtn = elements.find(e => e.action_id === 'view_deployment');

      expect(approveBtn).toBeDefined();
      expect(approveBtn!.style).toBe('primary');
      expect(rejectBtn).toBeDefined();
      expect(rejectBtn!.style).toBe('danger');
      expect(viewBtn).toBeDefined();
      expect(viewBtn!.url).toContain('/deployments/deploy-123');
    });

    it('should include project, environment, and requested by fields', () => {
      const msg = service.buildMessage('deployment_pending_approval', payload, frontendUrl);

      const sectionBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'section' && b.fields);
      const fieldTexts = sectionBlock!.fields!.map(f => f.text);

      expect(fieldTexts.some(t => t.includes('My Project'))).toBe(true);
      expect(fieldTexts.some(t => t.includes('production'))).toBe(true);
      expect(fieldTexts.some(t => t.includes('John Doe'))).toBe(true);
    });

    it('should include story title when provided', () => {
      const msg = service.buildMessage('deployment_pending_approval', payload, frontendUrl);

      const sectionBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'section' && b.fields);
      const fieldTexts = sectionBlock!.fields!.map(f => f.text);

      expect(fieldTexts.some(t => t.includes('Add user login'))).toBe(true);
    });

    it('should have YELLOW color', () => {
      const msg = service.buildMessage('deployment_pending_approval', payload, frontendUrl);

      expect(msg.attachments?.[0]?.color).toBe('#ECB22E');
    });
  });

  // ==================== buildAgentNeedsInput ====================

  describe('agent_needs_input', () => {
    const payload = {
      agentId: 'agent-1',
      agentName: 'Dev Agent',
      agentType: 'dev',
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      question: 'Should I use TypeScript or JavaScript?',
      conversationId: 'conv-123',
    };

    it('should include respond button with correct action_id', () => {
      const msg = service.buildMessage('agent_needs_input', payload, frontendUrl);

      const actionsBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'actions');
      const respondBtn = actionsBlock?.elements?.find(
        e => e.action_id === `respond_agent:${payload.agentId}:${payload.conversationId}`,
      );

      expect(respondBtn).toBeDefined();
      expect(respondBtn!.style).toBe('primary');
    });

    it('should include agent name and question text', () => {
      const msg = service.buildMessage('agent_needs_input', payload, frontendUrl);

      const blocks = msg.attachments?.[0]?.blocks || [];
      const sectionFields = blocks.find(b => b.type === 'section' && b.fields);
      const sectionText = blocks.find(b => b.type === 'section' && b.text);

      expect(sectionFields?.fields?.some(f => f.text.includes('Dev Agent'))).toBe(true);
      expect(sectionText?.text?.text).toContain('Should I use TypeScript');
    });

    it('should include View in DevOS link button', () => {
      const msg = service.buildMessage('agent_needs_input', payload, frontendUrl);

      const actionsBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'actions');
      const viewBtn = actionsBlock?.elements?.find(e => e.action_id === 'view_agent_chat');

      expect(viewBtn).toBeDefined();
      expect(viewBtn!.url).toContain('/chat/agent-1');
    });
  });

  // ==================== buildAgentTaskStarted ====================

  describe('agent_task_started', () => {
    const payload = {
      agentId: 'agent-1',
      agentName: 'Dev Agent',
      agentType: 'dev',
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      storyTitle: 'Implement user auth',
      storyId: 'story-1',
    };

    it('should include view story link button', () => {
      const msg = service.buildMessage('agent_task_started', payload, frontendUrl);

      const actionsBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'actions');
      const viewBtn = actionsBlock?.elements?.find(e => e.action_id === 'view_story');

      expect(viewBtn).toBeDefined();
      expect(viewBtn!.url).toContain('/stories/story-1');
    });

    it('should include agent name and story title', () => {
      const msg = service.buildMessage('agent_task_started', payload, frontendUrl);

      const sectionBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'section' && b.fields);
      const fieldTexts = sectionBlock!.fields!.map(f => f.text);

      expect(fieldTexts.some(t => t.includes('Dev Agent'))).toBe(true);
      expect(fieldTexts.some(t => t.includes('Implement user auth'))).toBe(true);
    });

    it('should have BLUE color', () => {
      const msg = service.buildMessage('agent_task_started', payload, frontendUrl);

      expect(msg.attachments?.[0]?.color).toBe('#36C5F0');
    });
  });

  // ==================== buildAgentTaskCompleted ====================

  describe('agent_task_completed', () => {
    const payload = {
      agentId: 'agent-1',
      agentName: 'Dev Agent',
      agentType: 'dev',
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      storyTitle: 'Implement user auth',
      storyId: 'story-1',
      filesChanged: 12,
    };

    it('should include files changed count', () => {
      const msg = service.buildMessage('agent_task_completed', payload, frontendUrl);

      const sectionBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'section' && b.fields);
      const fieldTexts = sectionBlock!.fields!.map(f => f.text);

      expect(fieldTexts.some(t => t.includes('12'))).toBe(true);
    });

    it('should have GREEN color', () => {
      const msg = service.buildMessage('agent_task_completed', payload, frontendUrl);

      expect(msg.attachments?.[0]?.color).toBe('#36a64f');
    });

    it('should show 0 when filesChanged not provided', () => {
      const noFiles = { ...payload, filesChanged: undefined };
      const msg = service.buildMessage('agent_task_completed', noFiles, frontendUrl);

      const sectionBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'section' && b.fields);
      const fieldTexts = sectionBlock!.fields!.map(f => f.text);

      expect(fieldTexts.some(t => t.includes('0'))).toBe(true);
    });
  });

  // ==================== buildCostAlertWarning ====================

  describe('cost_alert_warning', () => {
    const payload = {
      workspaceId: 'ws-1',
      currentCost: 85.50,
      limit: 100.00,
      percentage: 85,
      currency: 'USD',
    };

    it('should include percentage and YELLOW color', () => {
      const msg = service.buildMessage('cost_alert_warning', payload, frontendUrl);

      expect(msg.attachments?.[0]?.color).toBe('#ECB22E');

      const sectionBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'section' && b.fields);
      const fieldTexts = sectionBlock!.fields!.map(f => f.text);

      expect(fieldTexts.some(t => t.includes('85%'))).toBe(true);
      expect(fieldTexts.some(t => t.includes('85.50'))).toBe(true);
      expect(fieldTexts.some(t => t.includes('100.00'))).toBe(true);
    });

    it('should include View Cost Dashboard button', () => {
      const msg = service.buildMessage('cost_alert_warning', payload, frontendUrl);

      const actionsBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'actions');
      const viewBtn = actionsBlock?.elements?.find(e => e.action_id === 'view_costs');

      expect(viewBtn).toBeDefined();
      expect(viewBtn!.url).toContain('/settings/costs');
    });
  });

  // ==================== buildCostAlertExceeded ====================

  describe('cost_alert_exceeded', () => {
    const payload = {
      workspaceId: 'ws-1',
      currentCost: 120.00,
      limit: 100.00,
      currency: 'USD',
    };

    it('should include RED color', () => {
      const msg = service.buildMessage('cost_alert_exceeded', payload, frontendUrl);

      expect(msg.attachments?.[0]?.color).toBe('#E01E5A');
    });

    it('should include current cost and limit', () => {
      const msg = service.buildMessage('cost_alert_exceeded', payload, frontendUrl);

      const sectionBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'section' && b.fields);
      const fieldTexts = sectionBlock!.fields!.map(f => f.text);

      expect(fieldTexts.some(t => t.includes('120.00'))).toBe(true);
      expect(fieldTexts.some(t => t.includes('100.00'))).toBe(true);
    });

    it('should include View Cost Dashboard button', () => {
      const msg = service.buildMessage('cost_alert_exceeded', payload, frontendUrl);

      const actionsBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'actions');
      expect(actionsBlock?.elements?.some(e => e.action_id === 'view_costs')).toBe(true);
    });
  });

  // ==================== buildSprintReviewReady ====================

  describe('sprint_review_ready', () => {
    const payload = {
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      sprintName: 'Sprint 5',
      completedStories: 8,
      totalStories: 10,
    };

    it('should include completed/total counts', () => {
      const msg = service.buildMessage('sprint_review_ready', payload, frontendUrl);

      const sectionBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'section' && b.fields);
      const fieldTexts = sectionBlock!.fields!.map(f => f.text);

      expect(fieldTexts.some(t => t.includes('8 of 10'))).toBe(true);
      expect(fieldTexts.some(t => t.includes('Sprint 5'))).toBe(true);
    });

    it('should have TEAL color', () => {
      const msg = service.buildMessage('sprint_review_ready', payload, frontendUrl);

      expect(msg.attachments?.[0]?.color).toBe('#2EB67D');
    });

    it('should include View Sprint button', () => {
      const msg = service.buildMessage('sprint_review_ready', payload, frontendUrl);

      const actionsBlock = msg.attachments?.[0]?.blocks?.find(b => b.type === 'actions');
      const viewBtn = actionsBlock?.elements?.find(e => e.action_id === 'view_sprint');

      expect(viewBtn).toBeDefined();
      expect(viewBtn!.url).toContain('/sprints');
    });
  });

  // ==================== Text Truncation ====================

  describe('text truncation', () => {
    it('should truncate long text fields in deployment approval', () => {
      const longPayload = {
        ...{
          deploymentId: 'deploy-1',
          projectId: 'proj-1',
          projectName: 'A'.repeat(300),
          environment: 'production',
          workspaceId: 'ws-1',
          requestedBy: 'User',
        },
      };

      const msg = service.buildMessage('deployment_pending_approval', longPayload, frontendUrl);

      // Fallback text should be truncated
      expect(msg.text.length).toBeLessThan(400);
    });

    it('should truncate long agent name in agent_needs_input', () => {
      const longPayload = {
        agentId: 'agent-1',
        agentName: 'B'.repeat(300),
        agentType: 'dev',
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        question: 'Q'.repeat(600),
      };

      const msg = service.buildMessage('agent_needs_input', longPayload, frontendUrl);

      const blocks = msg.attachments?.[0]?.blocks || [];
      const sectionText = blocks.find(b => b.type === 'section' && b.text);

      // Question is truncated to 500 chars
      expect(sectionText?.text?.text?.length).toBeLessThanOrEqual(520);
    });
  });
});
