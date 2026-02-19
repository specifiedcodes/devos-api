/**
 * MarketplaceModule
 *
 * Story 18-5: Agent Marketplace Backend
 * Story 18-7: Agent Rating & Reviews
 * Story 18-8: Agent Installation Flow
 * Story 18-9: Agent Revenue Sharing
 *
 * NestJS module for the agent marketplace with publishing,
 * discovery, installation, review, and payment capabilities.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { PromptSecurityService } from './prompt-security.service';
import { AgentDependencyService } from './agent-dependency.service';
import { AgentConflictService } from './agent-conflict.service';
import { MarketplaceEventsGateway } from './marketplace-events.gateway';
import { MarketplaceAgent } from '../../database/entities/marketplace-agent.entity';
import { MarketplaceReview } from '../../database/entities/marketplace-review.entity';
import { InstalledAgent } from '../../database/entities/installed-agent.entity';
import { AgentDefinition } from '../../database/entities/agent-definition.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { User } from '../../database/entities/user.entity';
import { ReviewVote } from '../../database/entities/review-vote.entity';
import { ReviewReport } from '../../database/entities/review-report.entity';
import { InstallationLog } from '../../database/entities/installation-log.entity';
import { AgentDefinitionValidatorService } from '../custom-agents/agent-definition-validator.service';
import { ModelRegistryModule } from '../model-registry/model-registry.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketplaceAgent,
      MarketplaceReview,
      InstalledAgent,
      AgentDefinition,
      WorkspaceMember,
      User,
      ReviewVote,
      ReviewReport,
      InstallationLog,
    ]),
    ModelRegistryModule,
    BillingModule,
  ],
  controllers: [MarketplaceController],
  providers: [
    MarketplaceService,
    PromptSecurityService,
    AgentDefinitionValidatorService,
    AgentDependencyService,
    AgentConflictService,
    MarketplaceEventsGateway,
  ],
  exports: [MarketplaceService, PromptSecurityService, AgentDependencyService, AgentConflictService],
})
export class MarketplaceModule {}
