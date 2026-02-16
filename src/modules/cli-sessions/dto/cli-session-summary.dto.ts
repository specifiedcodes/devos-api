import {
  CliSessionStatus,
  CliSessionAgentType,
} from '../../../database/entities/cli-session.entity';

/**
 * CLI Session Summary DTO
 * Story 8.5: CLI Session History and Replay
 *
 * Lightweight representation for list views (no output text)
 */
export interface CliSessionSummaryDto {
  id: string;
  agentId: string;
  agentType: CliSessionAgentType;
  storyKey: string | null;
  status: CliSessionStatus;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  lineCount: number;
  isArchived: boolean;        // Story 16.3: true if session is archived to MinIO
  archivedAt: string | null;  // Story 16.3: ISO timestamp when archived
}

/**
 * Paginated result wrapper
 */
export interface PaginatedCliSessionsResult {
  data: CliSessionSummaryDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
