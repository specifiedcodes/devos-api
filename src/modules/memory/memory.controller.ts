/**
 * MemoryController
 * Story 12.1: Graphiti/Neo4j Setup
 *
 * REST API endpoints for the memory subsystem.
 * Provides health check endpoint for monitoring Neo4j and memory graph status.
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemoryHealthService } from './services/memory-health.service';
import { MemoryHealth } from './interfaces/memory.interfaces';

@ApiTags('Memory')
@Controller('api/v1/memory')
export class MemoryController {
  constructor(private readonly memoryHealthService: MemoryHealthService) {}

  @Get('health')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get memory subsystem health status' })
  @ApiResponse({
    status: 200,
    description: 'Memory health status returned successfully',
  })
  async getHealth(): Promise<MemoryHealth> {
    return this.memoryHealthService.getHealth();
  }
}
