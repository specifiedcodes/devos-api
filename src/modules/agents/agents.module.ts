import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { Agent } from '../../database/entities/agent.entity';
import { ContextSnapshot } from '../../database/entities/context-snapshot.entity';
import { AgentQueueModule } from '../agent-queue/agent-queue.module';
import { BYOKModule } from '../byok/byok.module';
import { ClaudeApiService } from './services/claude-api.service';
import { DevAgentService } from './implementations/dev-agent.service';
import { PlannerAgentService } from './implementations/planner-agent.service';
import { QAAgentService } from './implementations/qa-agent.service';
import { DevOpsAgentService } from './implementations/devops-agent.service';
import { ContextRecoveryService } from './context-recovery.service';
import { OrchestratorService } from './orchestrator.service';
import { FailureRecoveryService } from './failure-recovery.service';

/**
 * AgentsModule
 * Stories 5.2-5.10: Complete agent system
 *
 * Manages autonomous agent lifecycle, implementations, and orchestration
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Agent, ContextSnapshot]),
    forwardRef(() => AgentQueueModule),
    forwardRef(() => BYOKModule),
  ],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    ClaudeApiService,
    DevAgentService,
    PlannerAgentService,
    QAAgentService,
    DevOpsAgentService,
    ContextRecoveryService,
    OrchestratorService,
    FailureRecoveryService,
  ],
  exports: [
    AgentsService,
    ClaudeApiService,
    DevAgentService,
    PlannerAgentService,
    QAAgentService,
    DevOpsAgentService,
    ContextRecoveryService,
    OrchestratorService,
    FailureRecoveryService,
  ],
})
export class AgentsModule {}
