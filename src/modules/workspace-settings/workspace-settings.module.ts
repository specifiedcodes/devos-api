import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceSettings } from '../../database/entities/workspace-settings.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { WorkspaceSettingsService } from './services/workspace-settings.service';
import { WorkspaceSettingsController } from './controllers/workspace-settings.controller';
import { UsageModule } from '../usage/usage.module';
import { AuditModule } from '../../shared/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceSettings,
      WorkspaceMember,
      SecurityEvent,
    ]),
    forwardRef(() => UsageModule),
    forwardRef(() => AuditModule),
  ],
  controllers: [WorkspaceSettingsController],
  providers: [WorkspaceSettingsService],
  exports: [WorkspaceSettingsService],
})
export class WorkspaceSettingsModule {}
