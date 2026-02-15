/**
 * ContextModule
 * Story 12.4: Three-Tier Context Recovery Enhancement
 * Story 12.5: Context Health Indicators UI
 *
 * NestJS module for the project-level context file generation and health system.
 * Provides:
 * - ContextGenerationService: Core service for generating .devoscontext, DEVOS.md, project-state.yaml
 * - ContextGenerationTriggerService: Event listener for pipeline state changes
 * - ContextHealthService: Health assessment of context tiers + Graphiti (Story 12.5)
 * - ContextHealthEventService: Health transition detection and event emission (Story 12.5)
 * - ContextHealthNotificationHandler: Push notifications on critical health (Story 12.5)
 * - ContextController: REST API for manual context refresh and health endpoint
 *
 * Imports MemoryModule for Graphiti memory integration (decisions/problems in DEVOS.md).
 * Exports ContextGenerationService and ContextHealthService for use by other modules.
 */
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MemoryModule } from '../memory/memory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContextGenerationService } from './services/context-generation.service';
import { ContextGenerationTriggerService } from './services/context-generation-trigger.service';
import { ContextHealthService } from './services/context-health.service';
import { ContextHealthEventService } from './services/context-health-event.service';
import { ContextHealthNotificationHandler } from './services/context-health-notification.handler';
import { ContextController } from './context.controller';

@Module({
  imports: [
    ConfigModule,
    MemoryModule,
    forwardRef(() => NotificationsModule),
  ],
  controllers: [ContextController],
  providers: [
    ContextGenerationService,
    ContextGenerationTriggerService,
    ContextHealthService,
    ContextHealthEventService,
    ContextHealthNotificationHandler,
  ],
  exports: [ContextGenerationService, ContextHealthService],
})
export class ContextModule {}
