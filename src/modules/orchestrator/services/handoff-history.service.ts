/**
 * HandoffHistoryService
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Persists handoff audit trail records to PostgreSQL.
 * Provides query methods for handoff history by story or workspace.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HandoffHistory } from '../entities/handoff-history.entity';

@Injectable()
export class HandoffHistoryService {
  private readonly logger = new Logger(HandoffHistoryService.name);

  constructor(
    @InjectRepository(HandoffHistory)
    private readonly historyRepository: Repository<HandoffHistory>,
  ) {}

  /**
   * Record a handoff in the audit trail.
   * Stored in PostgreSQL for long-term persistence.
   */
  async recordHandoff(handoff: {
    workspaceId: string;
    storyId: string;
    fromAgentType: string;
    fromAgentId: string;
    toAgentType: string;
    toAgentId: string;
    fromPhase: string;
    toPhase: string;
    handoffType: 'normal' | 'rejection' | 'escalation' | 'completion';
    contextSummary: string;
    iterationCount: number;
    durationMs: number;
    metadata: Record<string, any>;
  }): Promise<void> {
    const entity = this.historyRepository.create(handoff);
    await this.historyRepository.save(entity);

    this.logger.debug(
      `Recorded handoff: ${handoff.fromAgentType} -> ${handoff.toAgentType} for story ${handoff.storyId}`,
    );
  }

  /**
   * Get handoff history for a story.
   * Ordered by timestamp descending (most recent first).
   */
  async getStoryHandoffs(
    storyId: string,
    workspaceId: string,
  ): Promise<HandoffHistory[]> {
    return this.historyRepository.find({
      where: { storyId, workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get handoff history for a workspace with pagination.
   * Cap limit at 100 to prevent excessive queries.
   */
  async getWorkspaceHandoffs(params: {
    workspaceId: string;
    limit: number;
    offset: number;
  }): Promise<{ items: HandoffHistory[]; total: number }> {
    const limit = Math.min(params.limit, 100);
    const offset = params.offset;

    const [items, total] = await this.historyRepository.findAndCount({
      where: { workspaceId: params.workspaceId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { items, total };
  }
}
