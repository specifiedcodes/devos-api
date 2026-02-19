/**
 * CustomAgentsModule
 *
 * Story 18-1: Agent Definition Schema
 * Story 18-3: Agent Sandbox Testing
 * Story 18-4: Agent Versioning
 *
 * NestJS module for custom agent definition CRUD, validation,
 * audit logging, import/export, sandbox testing, and version management.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AgentDefinition } from '../../database/entities/agent-definition.entity';
import { AgentDefinitionAuditEvent } from '../../database/entities/agent-definition-audit-event.entity';
import { AgentVersion } from '../../database/entities/agent-version.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { AgentSandboxSession } from '../../database/entities/agent-sandbox-session.entity';
import { AgentSandboxToolCall } from '../../database/entities/agent-sandbox-tool-call.entity';
import { AgentTestScenario } from '../../database/entities/agent-test-scenario.entity';
import { CustomAgentsService } from './custom-agents.service';
import { CustomAgentsController } from './custom-agents.controller';
import { AgentDefinitionValidatorService } from './agent-definition-validator.service';
import { AgentDefinitionAuditService } from './agent-definition-audit.service';
import { AgentVersionService } from './agent-version.service';
import { AgentSandboxService } from './agent-sandbox.service';
import { SandboxToolExecutorService } from './sandbox-tool-executor.service';
import { ModelRegistryModule } from '../model-registry/model-registry.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentDefinition,
      AgentDefinitionAuditEvent,
      AgentVersion,
      WorkspaceMember,
      AgentSandboxSession,
      AgentSandboxToolCall,
      AgentTestScenario,
    ]),
    ModelRegistryModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [CustomAgentsController],
  providers: [
    CustomAgentsService,
    AgentDefinitionValidatorService,
    AgentDefinitionAuditService,
    AgentVersionService,
    AgentSandboxService,
    SandboxToolExecutorService,
  ],
  exports: [
    CustomAgentsService,
    AgentDefinitionValidatorService,
    AgentVersionService,
    AgentSandboxService,
  ],
})
export class CustomAgentsModule {}
