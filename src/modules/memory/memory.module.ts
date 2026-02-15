/**
 * MemoryModule
 * Story 12.1: Graphiti/Neo4j Setup
 * Story 12.2: Memory Ingestion Pipeline
 *
 * NestJS module for the memory subsystem (Graphiti/Neo4j).
 * Provides Neo4jService, GraphitiService, MemoryHealthService,
 * and ingestion pipeline services (MemoryIngestionService,
 * MemoryExtractionService, MemoryDeduplicationService).
 * Exports GraphitiService, Neo4jService, and MemoryIngestionService
 * for use by other modules (orchestrator, agents, context recovery).
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Neo4jService } from './services/neo4j.service';
import { GraphitiService } from './services/graphiti.service';
import { MemoryHealthService } from './services/memory-health.service';
import { MemoryIngestionService } from './services/memory-ingestion.service';
import { MemoryExtractionService } from './services/memory-extraction.service';
import { MemoryDeduplicationService } from './services/memory-deduplication.service';
import { MemoryController } from './memory.controller';

@Module({
  imports: [ConfigModule],
  controllers: [MemoryController],
  providers: [
    Neo4jService,
    GraphitiService,
    MemoryHealthService,
    MemoryIngestionService,
    MemoryExtractionService,
    MemoryDeduplicationService,
  ],
  exports: [GraphitiService, Neo4jService, MemoryIngestionService],
})
export class MemoryModule {}
