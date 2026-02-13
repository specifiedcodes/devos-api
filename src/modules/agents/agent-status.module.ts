import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentStatusController } from './controllers/agent-status.controller';
import { AgentStatusService } from './services/agent-status.service';
import { Agent } from '../../database/entities/agent.entity';
import { AgentStatusUpdate } from '../../database/entities/agent-status-update.entity';
import { ChatMessage } from '../../database/entities/chat-message.entity';
import { RedisModule } from '../redis/redis.module';

/**
 * AgentStatusModule
 * Story 9.3: Agent Status Updates
 *
 * Provides agent status tracking, history, and real-time updates
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Agent, AgentStatusUpdate, ChatMessage]),
    RedisModule,
  ],
  controllers: [AgentStatusController],
  providers: [AgentStatusService],
  exports: [AgentStatusService],
})
export class AgentStatusModule {}
