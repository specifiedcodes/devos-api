/**
 * File Storage Module
 * Story 16.1: MinIO S3 Storage Setup (AC4)
 *
 * Global NestJS module for S3-compatible file storage.
 * Provides FileStorageService to all modules without explicit import.
 * Used by cli-sessions, file uploads, exports, and backups.
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FileStorageService } from './file-storage.service';

@Global() // Make available to all modules (used by cli-sessions, exports, etc.)
@Module({
  imports: [ConfigModule],
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class FileStorageModule {}
