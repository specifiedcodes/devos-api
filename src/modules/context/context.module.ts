/**
 * ContextModule
 * Story 12.4: Three-Tier Context Recovery Enhancement
 *
 * NestJS module for the project-level context file generation system.
 * Provides:
 * - ContextGenerationService: Core service for generating .devoscontext, DEVOS.md, project-state.yaml
 * - ContextGenerationTriggerService: Event listener for pipeline state changes
 * - ContextController: REST API for manual context refresh
 *
 * Imports MemoryModule for Graphiti memory integration (decisions/problems in DEVOS.md).
 * Exports ContextGenerationService for use by OrchestratorModule and other consumers.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MemoryModule } from '../memory/memory.module';
import { ContextGenerationService } from './services/context-generation.service';
import { ContextGenerationTriggerService } from './services/context-generation-trigger.service';
import { ContextController } from './context.controller';

@Module({
  imports: [ConfigModule, MemoryModule],
  controllers: [ContextController],
  providers: [ContextGenerationService, ContextGenerationTriggerService],
  exports: [ContextGenerationService],
})
export class ContextModule {}
