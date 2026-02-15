/**
 * ModelPreferencesModule
 *
 * Story 13-9: User Model Preferences
 *
 * NestJS module for managing workspace model preferences.
 * Provides API endpoints for configuring preferred models, presets, and cost optimization.
 */
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceSettings } from '../../database/entities/workspace-settings.entity';
import { BYOKKey } from '../../database/entities/byok-key.entity';
import { ModelPreferencesService } from './services/model-preferences.service';
import { ModelPreferencesController } from './controllers/model-preferences.controller';
import { RedisModule } from '../redis/redis.module';
import { ModelRegistryModule } from '../model-registry/model-registry.module';
import { UsageModule } from '../usage/usage.module';
import { AuditModule } from '../../shared/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceSettings, BYOKKey]),
    RedisModule,
    forwardRef(() => ModelRegistryModule),
    forwardRef(() => UsageModule),
    AuditModule,
  ],
  providers: [ModelPreferencesService],
  controllers: [ModelPreferencesController],
  exports: [ModelPreferencesService],
})
export class ModelPreferencesModule {}
