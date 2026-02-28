/**
 * White-Label Module
 * Story 22-1: White-Label Configuration (AC5)
 *
 * NestJS module wiring the white-label feature together.
 * FileStorageModule, AuditModule, and RedisModule are @Global
 * so they do not need explicit import here.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { WhiteLabelConfig } from '../../database/entities/white-label-config.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { WhiteLabelController, WhiteLabelPublicController } from './white-label.controller';
import { WhiteLabelService } from './white-label.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhiteLabelConfig, WorkspaceMember]),
    MulterModule.register({
      limits: {
        fileSize: 500 * 1024, // 500KB max (logos)
      },
    }),
  ],
  controllers: [WhiteLabelController, WhiteLabelPublicController],
  providers: [WhiteLabelService],
  exports: [WhiteLabelService],
})
export class WhiteLabelModule {}
