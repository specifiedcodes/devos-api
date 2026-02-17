/**
 * CustomAgentsModule
 *
 * Story 18-1: Agent Definition Schema
 *
 * NestJS module for custom agent definition CRUD, validation,
 * audit logging, and import/export.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentDefinition } from '../../database/entities/agent-definition.entity';
import { AgentDefinitionAuditEvent } from '../../database/entities/agent-definition-audit-event.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { CustomAgentsService } from './custom-agents.service';
import { CustomAgentsController } from './custom-agents.controller';
import { AgentDefinitionValidatorService } from './agent-definition-validator.service';
import { AgentDefinitionAuditService } from './agent-definition-audit.service';
import { ModelRegistryModule } from '../model-registry/model-registry.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentDefinition, AgentDefinitionAuditEvent, WorkspaceMember]),
    ModelRegistryModule,
  ],
  controllers: [CustomAgentsController],
  providers: [
    CustomAgentsService,
    AgentDefinitionValidatorService,
    AgentDefinitionAuditService,
  ],
  exports: [CustomAgentsService, AgentDefinitionValidatorService],
})
export class CustomAgentsModule {}
