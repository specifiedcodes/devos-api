import { CliSessionSummaryDto } from './cli-session-summary.dto';

/**
 * CLI Session Replay DTO
 * Story 8.5: CLI Session History and Replay
 *
 * Extended representation for replay view (includes decompressed output)
 */
export interface CliSessionReplayDto extends CliSessionSummaryDto {
  outputLines: string[]; // Decompressed, split by newline
}
