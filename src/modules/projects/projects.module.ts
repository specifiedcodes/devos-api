import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project } from '../../database/entities/project.entity';
import { ProjectPreferences } from '../../database/entities/project-preferences.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { AuditModule } from '../../shared/audit/audit.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { ProvisioningModule } from '../provisioning/provisioning.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      ProjectPreferences,
      WorkspaceMember,
      SecurityEvent,
    ]),
    AuditModule,
    OnboardingModule,
    ProvisioningModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
