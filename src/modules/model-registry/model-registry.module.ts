/**
 * ModelRegistryModule
 *
 * Story 13-2: Model Registry
 *
 * NestJS module for the model registry.
 * Seeds default model definitions on module initialization.
 */
import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelDefinition } from '../../database/entities/model-definition.entity';
import { ModelRegistryService } from './services/model-registry.service';
import { ModelRegistryController } from './controllers/model-registry.controller';
import { AuthModule } from '../auth/auth.module';
import { GuardsModule } from '../../common/guards/guards.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ModelDefinition]),
    AuthModule,
    GuardsModule,
  ],
  providers: [ModelRegistryService],
  controllers: [ModelRegistryController],
  exports: [ModelRegistryService],
})
export class ModelRegistryModule implements OnModuleInit {
  private readonly logger = new Logger(ModelRegistryModule.name);

  constructor(private readonly modelRegistryService: ModelRegistryService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.modelRegistryService.seedDefaults();
      this.logger.log('Model registry seed data initialized successfully');
    } catch (error) {
      this.logger.error('Failed to seed model registry defaults', error);
    }
  }
}
