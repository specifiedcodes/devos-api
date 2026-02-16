/**
 * ProjectFilesModule
 * Story 16.2: File Upload/Download API (AC6)
 *
 * NestJS module for file management within projects.
 * Depends on FileStorageModule (@Global) and AuditModule.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectFilesController } from './project-files.controller';
import { ProjectFilesService } from './project-files.service';
import { ProjectFile } from '../../database/entities/project-file.entity';
import { Project } from '../../database/entities/project.entity';
import { AuditModule } from '../../shared/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectFile, Project]),
    AuditModule,
  ],
  controllers: [ProjectFilesController],
  providers: [ProjectFilesService],
  exports: [ProjectFilesService],
})
export class ProjectFilesModule {}
