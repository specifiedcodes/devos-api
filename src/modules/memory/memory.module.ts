/**
 * MemoryModule
 * Story 12.1: Graphiti/Neo4j Setup
 *
 * NestJS module for the memory subsystem (Graphiti/Neo4j).
 * Provides Neo4jService, GraphitiService, and MemoryHealthService.
 * Exports GraphitiService and Neo4jService for use by other modules
 * (orchestrator, agents, context recovery).
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Neo4jService } from './services/neo4j.service';
import { GraphitiService } from './services/graphiti.service';
import { MemoryHealthService } from './services/memory-health.service';
import { MemoryController } from './memory.controller';

@Module({
  imports: [ConfigModule],
  controllers: [MemoryController],
  providers: [Neo4jService, GraphitiService, MemoryHealthService],
  exports: [GraphitiService, Neo4jService],
})
export class MemoryModule {}
