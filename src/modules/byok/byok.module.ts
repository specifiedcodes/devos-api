import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BYOKKey } from '../../database/entities/byok-key.entity';
import { BYOKKeyService } from './services/byok-key.service';
import { BYOKKeyController } from './controllers/byok-key.controller';
import { EncryptionModule } from '../../shared/encryption/encryption.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { RateLimiterModule } from '../../shared/cache/rate-limiter.module';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BYOKKey, WorkspaceMember]),
    EncryptionModule,
    AuditModule,
    RateLimiterModule,
  ],
  providers: [BYOKKeyService],
  controllers: [BYOKKeyController],
  exports: [BYOKKeyService],
})
export class BYOKModule {}
