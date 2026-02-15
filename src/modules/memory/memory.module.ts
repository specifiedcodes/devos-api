/**
 * MemoryModule
 * Story 12.1: Graphiti/Neo4j Setup
 * Story 12.2: Memory Ingestion Pipeline
 * Story 12.3: Memory Query Service
 * Story 12.6: Cross-Project Learning
 *
 * NestJS module for the memory subsystem (Graphiti/Neo4j).
 * Provides Neo4jService, GraphitiService, MemoryHealthService,
 * ingestion pipeline services (MemoryIngestionService,
 * MemoryExtractionService, MemoryDeduplicationService),
 * MemoryQueryService for querying and scoring memories,
 * and CrossProjectLearningService for workspace-level pattern recognition.
 * Exports GraphitiService, Neo4jService, MemoryIngestionService,
 * MemoryQueryService, and CrossProjectLearningService for use by other modules
 * (orchestrator, agents, context recovery).
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Neo4jService } from './services/neo4j.service';
import { GraphitiService } from './services/graphiti.service';
import { MemoryHealthService } from './services/memory-health.service';
import { MemoryIngestionService } from './services/memory-ingestion.service';
import { MemoryExtractionService } from './services/memory-extraction.service';
import { MemoryDeduplicationService } from './services/memory-deduplication.service';
import { MemoryQueryService } from './services/memory-query.service';
import { CrossProjectLearningService } from './services/cross-project-learning.service';
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
    MemoryQueryService,
    CrossProjectLearningService,
    // Story 12.6: Provide CrossProjectLearningService as string token for optional injection in MemoryQueryService
    {
      provide: 'CrossProjectLearningService',
      useExisting: CrossProjectLearningService,
    },
  ],
  exports: [
    GraphitiService,
    Neo4jService,
    MemoryIngestionService,
    MemoryQueryService,
    MemoryHealthService, // Story 12.5: Exported for ContextHealthService to check Graphiti connectivity
    CrossProjectLearningService, // Story 12.6: Exported for context module access
  ],
})
export class MemoryModule {}
