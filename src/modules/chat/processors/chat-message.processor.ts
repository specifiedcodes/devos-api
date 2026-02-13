import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bull';
import { ChatService } from '../chat.service';
import { AgentsService } from '../../agents/agents.service';
import { ClaudeApiService } from '../../agents/services/claude-api.service';
import { AgentQueueService } from '../../agent-queue/services/agent-queue.service';
import { AgentJobStatus, AgentJobType } from '../../agent-queue/entities/agent-job.entity';
import { ChatSenderType } from '../../../database/entities/chat-message.entity';
import { AgentType } from '../../../database/entities/agent.entity';
import { buildAgentPrompt } from '../prompts/chat-prompts';
import { RedisService } from '../../redis/redis.service';

/**
 * Job data for PROCESS_CHAT_MESSAGE jobs
 */
export interface ProcessChatMessageJobData {
  agentJobId: string;
  workspaceId: string;
  userId: string;
  jobType: AgentJobType;
  data: {
    messageId: string;
    agentId: string;
    agentType: AgentType;
    workspaceId: string;
    projectId?: string;
    text: string;
    conversationContext: {
      lastMessages: any[];
    };
  };
}

/**
 * ChatMessageProcessor
 * Story 9.2: Send Message to Agent
 *
 * Processes chat message jobs and generates agent responses using Claude API
 */
@Processor('agent-tasks')
@Injectable()
export class ChatMessageProcessor {
  private readonly logger = new Logger(ChatMessageProcessor.name);

  constructor(
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => AgentsService))
    private readonly agentsService: AgentsService,
    @Inject(forwardRef(() => ClaudeApiService))
    private readonly claudeApiService: ClaudeApiService,
    @Inject(forwardRef(() => AgentQueueService))
    private readonly agentQueueService: AgentQueueService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Process PROCESS_CHAT_MESSAGE jobs
   */
  @Process(AgentJobType.PROCESS_CHAT_MESSAGE)
  async processMessage(job: Job<ProcessChatMessageJobData>): Promise<any> {
    const { agentJobId, data } = job.data;
    const { messageId, agentId, agentType, workspaceId, projectId, text, conversationContext } =
      data;

    this.logger.log(
      `Processing chat message job ${agentJobId} for message ${messageId}`,
    );

    // Update job status to processing
    await this.agentQueueService.updateJobStatus(agentJobId, AgentJobStatus.PROCESSING, {
      startedAt: new Date(),
    });

    try {
      // 1. Emit typing indicator via Redis pub/sub
      await this.emitTypingIndicator(workspaceId, agentId, agentType, true);

      // 2. Get agent context
      const agent = await this.agentsService.getAgent(agentId, workspaceId);

      // 3. Build prompt with context
      const { systemPrompt, userPrompt } = buildAgentPrompt(
        agent,
        text,
        conversationContext,
      );

      // 4. Call Claude API
      const response = await this.claudeApiService.sendMessage({
        workspaceId,
        systemPrompt,
        userPrompt,
      });

      // 5. Save agent response message
      const { message: agentMessage } = await this.chatService.createMessage({
        workspaceId,
        projectId: projectId || null,
        agentId,
        userId: null,
        senderType: ChatSenderType.AGENT,
        agentType: agent.type,
        text: response.content,
      });

      // 6. Broadcast message via Redis pub/sub (WebSocket will pick it up)
      await this.broadcastMessage(workspaceId, agentMessage);

      // 7. Clear typing indicator
      await this.emitTypingIndicator(workspaceId, agentId, agentType, false);

      // 8. Update original message status to delivered
      await this.chatService.updateMessageStatus(messageId, 'delivered');

      // 9. Update job status to completed
      await this.agentQueueService.updateJobStatus(agentJobId, AgentJobStatus.COMPLETED, {
        result: {
          responseMessageId: agentMessage.id,
          tokenUsage: {
            input: response.inputTokens,
            output: response.outputTokens,
          },
        },
        completedAt: new Date(),
      });

      this.logger.log(
        `Chat message job ${agentJobId} completed. Response message: ${agentMessage.id}`,
      );

      return {
        success: true,
        responseMessageId: agentMessage.id,
      };
    } catch (error: any) {
      this.logger.error(
        `Chat message job ${agentJobId} failed: ${error.message}`,
        error.stack,
      );

      // Clear typing indicator on error
      await this.emitTypingIndicator(workspaceId, agentId, agentType, false);

      // Sync attempts counter with BullMQ
      await this.agentQueueService.updateJobAttempts(agentJobId, job.attemptsMade + 1);

      throw error;
    }
  }

  /**
   * Handle failed jobs
   */
  @OnQueueFailed()
  async onFailed(job: Job<ProcessChatMessageJobData>, error: Error): Promise<void> {
    // Only handle PROCESS_CHAT_MESSAGE jobs
    if (job.data.jobType !== AgentJobType.PROCESS_CHAT_MESSAGE) {
      return;
    }

    const { agentJobId, data } = job.data;
    const { workspaceId, agentId, agentType } = data;

    this.logger.error(
      `Chat message job ${agentJobId} failed after ${job.attemptsMade} attempts: ${error.message}`,
    );

    // Clear typing indicator
    await this.emitTypingIndicator(workspaceId, agentId, agentType, false);

    // Check if max attempts reached
    const maxAttempts = job.opts.attempts || 3;
    if (job.attemptsMade >= maxAttempts) {
      await this.agentQueueService.updateJobStatus(agentJobId, AgentJobStatus.FAILED, {
        errorMessage: error.message,
        completedAt: new Date(),
      });
    } else {
      await this.agentQueueService.updateJobStatus(agentJobId, AgentJobStatus.RETRYING, {
        errorMessage: error.message,
      });
    }
  }

  /**
   * Emit typing indicator via Redis pub/sub
   */
  private async emitTypingIndicator(
    workspaceId: string,
    agentId: string,
    agentType: AgentType,
    isTyping: boolean,
  ): Promise<void> {
    try {
      await this.redisService.publish(
        'chat-events',
        JSON.stringify({
          event: 'chat:typing',
          workspaceId,
          data: {
            agentId,
            agentType,
            isTyping,
          },
        }),
      );
    } catch (error) {
      this.logger.warn(`Failed to emit typing indicator: ${error}`);
    }
  }

  /**
   * Broadcast message via Redis pub/sub for WebSocket delivery
   */
  private async broadcastMessage(workspaceId: string, message: any): Promise<void> {
    try {
      await this.redisService.publish(
        'chat-events',
        JSON.stringify({
          event: 'chat:message',
          workspaceId,
          data: {
            id: message.id,
            workspaceId: message.workspaceId,
            projectId: message.projectId,
            agentId: message.agentId,
            userId: message.userId,
            senderType: message.senderType,
            agentType: message.agentType,
            text: message.text,
            status: message.status,
            createdAt: message.createdAt.toISOString(),
          },
        }),
      );
    } catch (error) {
      this.logger.warn(`Failed to broadcast message: ${error}`);
    }
  }
}
