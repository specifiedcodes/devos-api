import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionAuditEvent } from '../../database/entities/permission-audit-event.entity';
import { PermissionAuditService } from './services/permission-audit.service';
import { PermissionAuditController } from './controllers/permission-audit.controller';
import { PermissionAuditCleanupJob } from './jobs/permission-audit-cleanup.job';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PermissionAuditEvent])],
  controllers: [PermissionAuditController],
  providers: [PermissionAuditService, PermissionAuditCleanupJob],
  exports: [PermissionAuditService],
})
export class PermissionAuditModule {}
