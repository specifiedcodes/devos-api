import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatMessageProcessor } from './processors/chat-message.processor';
import { ChatRateLimitGuard } from './guards/chat-rate-limit.guard';
import { ChatMessage } from '../../database/entities/chat-message.entity';
import { ConversationThread } from '../../database/entities/conversation-thread.entity';
import { NotificationPreferences } from '../../database/entities/notification-preferences.entity';
import { AgentQueueModule } from '../agent-queue/agent-queue.module';
import { AgentsModule } from '../agents/agents.module';
import { RedisModule } from '../redis/redis.module';
import { RateLimiterModule } from '../../shared/cache/rate-limiter.module';
import { GuardsModule } from '../../common/guards/guards.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { ConversationService } from './services/conversation.service';
import { ChatSearchService } from './services/chat-search.service';
import { ChatExportService } from './services/chat-export.service';
import { ChatArchivalService } from './services/chat-archival.service';
// Story 9.8: Agent Response Time Optimization
import { AgentResponseCacheService } from './services/agent-response-cache.service';
import { AgentStreamingService } from './services/agent-streaming.service';
import { PriorityQueueService } from './services/priority-queue.service';
import { ChatMetricsService } from './services/chat-metrics.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { AgentMetricsController } from './controllers/agent-metrics.controller';
// Story 9.9: Chat Notifications
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';
import { MessageReadTrackingService } from './services/message-read-tracking.service';

/**
 * ChatModule
 * Story 9.2: Send Message to Agent
 * Story 9.5: Conversation History Storage
 *
 * Provides chat messaging functionality between users and agents
 * with conversation threading, search, export, and archival support.
 */
/**
 * ChatModule
 * Story 9.2: Send Message to Agent
 * Story 9.5: Conversation History Storage
 * Story 9.8: Agent Response Time Optimization
 *
 * Provides chat messaging functionality between users and agents
 * with conversation threading, search, export, archival, caching, and streaming support.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, ConversationThread, NotificationPreferences]),
    ScheduleModule.forRoot(),
    ConfigModule,
    forwardRef(() => AgentQueueModule),
    forwardRef(() => AgentsModule),
    RedisModule,
    RateLimiterModule,
    GuardsModule,
    AuditModule,
  ],
  controllers: [ChatController, AgentMetricsController, NotificationPreferencesController],
  providers: [
    ChatService,
    ChatMessageProcessor,
    ChatRateLimitGuard,
    ConversationService,
    ChatSearchService,
    ChatExportService,
    ChatArchivalService,
    // Story 9.8: Response optimization services
    AgentResponseCacheService,
    AgentStreamingService,
    PriorityQueueService,
    ChatMetricsService,
    CircuitBreakerService,
    // Story 9.9: Notification services
    NotificationPreferencesService,
    MessageReadTrackingService,
  ],
  exports: [
    ChatService,
    ConversationService,
    AgentResponseCacheService,
    AgentStreamingService,
    ChatMetricsService,
    NotificationPreferencesService,
    MessageReadTrackingService,
  ],
})
export class ChatModule {}
