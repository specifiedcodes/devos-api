import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IpAllowlistEntry } from '../../database/entities/ip-allowlist-entry.entity';
import { IpAllowlistConfig } from '../../database/entities/ip-allowlist-config.entity';
import { IpAllowlistService } from './services/ip-allowlist.service';
import { IpAllowlistController } from './controllers/ip-allowlist.controller';
import { PermissionAuditModule } from '../permission-audit/permission-audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IpAllowlistEntry, IpAllowlistConfig]),
    PermissionAuditModule,
  ],
  controllers: [IpAllowlistController],
  providers: [IpAllowlistService],
  exports: [IpAllowlistService],
})
export class IpAllowlistModule {}
