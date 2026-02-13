import { Logger } from '@nestjs/common';
import { ClaudeApiResponse } from '../interfaces/claude-api.interfaces';

const logger = new Logger('parseJsonResponse');

/**
 * Parse a JSON response from the Claude API.
 * Shared utility used by DevAgentService, PlannerAgentService, QAAgentService, and DevOpsAgentService.
 *
 * Handles cases where Claude may include markdown fences around JSON.
 * Falls back to { rawContent } if JSON parsing fails.
 */
export function parseJsonResponse(response: ClaudeApiResponse): Record<string, any> {
  let content = response.content.trim();

  // Strip markdown code fences if present
  if (content.startsWith('```json')) {
    content = content.slice(7);
  } else if (content.startsWith('```')) {
    content = content.slice(3);
  }
  if (content.endsWith('```')) {
    content = content.slice(0, -3);
  }
  content = content.trim();

  try {
    return JSON.parse(content);
  } catch {
    logger.warn(
      'Failed to parse Claude API response as JSON, returning raw content',
    );
    return { rawContent: content };
  }
}
