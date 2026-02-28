/**
 * White-Label Module
 * Story 22-1: White-Label Configuration (AC5)
 * Story 22-2: White-Label Email Templates (AC6)
 *
 * NestJS module wiring the white-label feature together.
 * FileStorageModule, AuditModule, and RedisModule are @Global
 * so they do not need explicit import here.
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { WhiteLabelConfig } from '../../database/entities/white-label-config.entity';
import { WhiteLabelEmailTemplate } from '../../database/entities/white-label-email-template.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { WhiteLabelController, WhiteLabelPublicController } from './white-label.controller';
import { WhiteLabelEmailTemplateController } from './white-label-email-template.controller';
import { WhiteLabelService } from './white-label.service';
import { WhiteLabelEmailTemplateService } from './services/white-label-email-template.service';
import { WhiteLabelEmailRendererService } from './services/white-label-email-renderer.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhiteLabelConfig, WhiteLabelEmailTemplate, WorkspaceMember]),
    MulterModule.register({
      limits: {
        fileSize: 500 * 1024,
      },
    }),
    forwardRef(() => EmailModule),
  ],
  controllers: [WhiteLabelController, WhiteLabelPublicController, WhiteLabelEmailTemplateController],
  providers: [WhiteLabelService, WhiteLabelEmailTemplateService, WhiteLabelEmailRendererService],
  exports: [WhiteLabelService, WhiteLabelEmailTemplateService, WhiteLabelEmailRendererService],
})
export class WhiteLabelModule {}
