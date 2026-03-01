/**
 * TemplatesModule
 *
 * Story 19-1: Template Registry Backend
 * Story 19-2: Template Creation Wizard
 * Story 19-3: Parameterized Scaffolding
 * Story 19-6: Template Installation Flow
 * Story 19-7: Template Versioning
 * Story 19-9: Template Analytics
 *
 * Module for template management with database-backed storage.
 * Extends original Story 4.2 module with TypeORM integration.
 */
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Template } from '../../database/entities/template.entity';
import { TemplateAuditEvent } from '../../database/entities/template-audit-event.entity';
import { TemplateReview } from '../../database/entities/template-review.entity';
import { TemplateInstallation } from '../../database/entities/template-installation.entity';
import { TemplateVersion } from '../../database/entities/template-version.entity';
import { ProjectTemplateVersion } from '../../database/entities/project-template-version.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { Project } from '../../database/entities/project.entity';
import { IntegrationConnection } from '../../database/entities/integration-connection.entity';
import { User } from '../../database/entities/user.entity';
import { TemplatesController } from './controllers/templates.controller';
import { TemplateCreationController } from './controllers/template-creation.controller';
import { TemplateReviewController } from './controllers/template-review.controller';
import { TemplateInstallationController } from './controllers/template-installation.controller';
import { TemplateVersionController } from './controllers/template-version.controller';
import { TemplateUpdateController } from './controllers/template-update.controller';
import { TemplatesService } from './services/templates.service';
import { TemplateRegistryService } from './services/template-registry.service';
import { TemplateAuditService } from './services/template-audit.service';
import { TemplateValidatorService } from './services/template-validator.service';
import { TemplateCreationService } from './services/template-creation.service';
import { TemplateEngineService } from './services/template-engine.service';
import { VariableResolverService } from './services/variable-resolver.service';
import { PostInstallService } from './services/post-install.service';
import { TemplateScaffoldingService } from './services/template-scaffolding.service';
import { TemplateReviewService } from './services/template-review.service';
import { TemplateInstallationService } from './services/template-installation.service';
import { TemplateVersionService } from './services/template-version.service';
import { TemplateUpdateService } from './services/template-update.service';
import { ScaffoldProcessor } from './processors/scaffold.processor';
import { InstallationProcessor } from './processors/installation.processor';
import { TemplatesGateway } from './gateways/templates.gateway';
import { GitHubService } from '../integrations/github/github.service';
import { FileStorageService } from '../file-storage/file-storage.service';
import { TemplateAnalyticsEvent } from '../../database/entities/template-analytics-event.entity';
import { TemplateAnalyticsController } from './controllers/template-analytics.controller';
import { TemplateAnalyticsService } from './services/template-analytics.service';
import { EncryptionModule } from '../../shared/encryption/encryption.module';
// Story 19-10: Import BillingModule for TemplatePurchaseService
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Template,
      TemplateAuditEvent,
      TemplateReview,
      TemplateInstallation,
      TemplateVersion,
      ProjectTemplateVersion,
      TemplateAnalyticsEvent,
      WorkspaceMember,
      Project,
      IntegrationConnection,
      User,
    ]),
    EncryptionModule,
    // Story 19-10: BillingModule for TemplatePurchaseService
    BillingModule,
    // BullMQ queue for scaffolding jobs
    BullModule.registerQueue({
      name: 'scaffold',
    }),
    // BullMQ queue for installation jobs (Story 19-6)
    BullModule.registerQueue({
      name: 'installation',
    }),
    // Use forwardRef to avoid circular dependency
    forwardRef(() => IntegrationsModule),
  ],
  controllers: [
    TemplatesController,
    TemplateCreationController,
    TemplateReviewController,
    TemplateInstallationController,
    TemplateVersionController,
    TemplateUpdateController,
    // Story 19-9: Analytics controller
    TemplateAnalyticsController,
  ],
  providers: [
    // Services
    TemplatesService,
    TemplateRegistryService,
    TemplateAuditService,
    TemplateValidatorService,
    TemplateCreationService,
    // Story 19-3: Scaffolding services
    TemplateEngineService,
    VariableResolverService,
    PostInstallService,
    TemplateScaffoldingService,
    // Story 19-5: Review service
    TemplateReviewService,
    // Story 19-6: Installation service
    TemplateInstallationService,
    // Story 19-7: Version services
    TemplateVersionService,
    TemplateUpdateService,
    // Story 19-9: Analytics service
    TemplateAnalyticsService,
    // Processors
    ScaffoldProcessor,
    InstallationProcessor,
    // Gateways
    TemplatesGateway,
  ],
  exports: [
    TemplatesService,
    TemplateRegistryService,
    TemplateAuditService,
    TemplateValidatorService,
    TemplateCreationService,
    // Story 19-3 exports
    TemplateEngineService,
    VariableResolverService,
    TemplateScaffoldingService,
    TemplatesGateway,
    // Story 19-5 exports
    TemplateReviewService,
    // Story 19-6 exports
    TemplateInstallationService,
    // Story 19-7 exports
    TemplateVersionService,
    TemplateUpdateService,
    // Story 19-9 exports
    TemplateAnalyticsService,
  ],
})
export class TemplatesModule {}

// Import at the end to avoid circular dependency
import { IntegrationsModule } from '../integrations/integrations.module';
