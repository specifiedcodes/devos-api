import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IpAllowlistEntry } from '../../database/entities/ip-allowlist-entry.entity';
import { IpAllowlistConfig } from '../../database/entities/ip-allowlist-config.entity';
import { IpAllowlistService } from './services/ip-allowlist.service';
import { IpAllowlistController } from './controllers/ip-allowlist.controller';

@Module({
  imports: [TypeOrmModule.forFeature([IpAllowlistEntry, IpAllowlistConfig])],
  controllers: [IpAllowlistController],
  providers: [IpAllowlistService],
  exports: [IpAllowlistService],
})
export class IpAllowlistModule {}
