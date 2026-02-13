import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  InternalServerErrorException,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';
import { BYOKKeyService } from '../../byok/services/byok-key.service';
import { KeyProvider } from '../../../database/entities/byok-key.entity';
import {
  ClaudeApiRequest,
  ClaudeApiResponse,
} from '../interfaces/claude-api.interfaces';

/**
 * Streaming event type from Claude API
 */
export interface ClaudeStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type: string;
    text?: string;
  };
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_TIMEOUT_MS = 120000;

/**
 * ClaudeApiService
 * Story 5.3: Dev Agent Implementation
 *
 * Shared service wrapping the Anthropic SDK for agent use.
 * Retrieves workspace-scoped BYOK keys and sends structured prompts to Claude.
 */
@Injectable()
export class ClaudeApiService {
  private readonly logger = new Logger(ClaudeApiService.name);
  private readonly timeoutMs: number;
  // Cache Anthropic clients per workspace to enable connection reuse.
  // Key: `${workspaceId}:${apiKey}` to invalidate on key rotation.
  private readonly clientCache = new Map<string, Anthropic>();

  constructor(
    private readonly byokKeyService: BYOKKeyService,
    private readonly configService: ConfigService,
  ) {
    this.timeoutMs =
      this.configService.get<number>('CLAUDE_API_TIMEOUT_MS') ||
      DEFAULT_TIMEOUT_MS;
  }

  /**
   * Get or create an Anthropic client for the given API key.
   * Caches clients to allow connection pooling and reuse.
   */
  private getClient(workspaceId: string, apiKey: string): Anthropic {
    const cacheKey = `${workspaceId}:${apiKey.slice(-8)}`;
    let client = this.clientCache.get(cacheKey);
    if (!client) {
      client = new Anthropic({ apiKey, timeout: this.timeoutMs });
      this.clientCache.set(cacheKey, client);
    }
    return client;
  }

  /**
   * Send a message to the Claude API using the workspace's BYOK key
   */
  async sendMessage(request: ClaudeApiRequest): Promise<ClaudeApiResponse> {
    const { workspaceId, systemPrompt, userPrompt } = request;
    const model = request.model || DEFAULT_MODEL;
    const maxTokens = request.maxTokens || DEFAULT_MAX_TOKENS;
    const temperature = request.temperature ?? DEFAULT_TEMPERATURE;

    this.logger.log(
      `Sending Claude API request for workspace ${workspaceId} (model: ${model}, maxTokens: ${maxTokens})`,
    );

    // Retrieve the workspace's Anthropic API key
    const apiKey = await this.byokKeyService.getActiveKeyForProvider(
      workspaceId,
      KeyProvider.ANTHROPIC,
    );

    if (!apiKey) {
      throw new BadRequestException(
        'No Anthropic API key configured for this workspace',
      );
    }

    // Get or create Anthropic client with the workspace's key (cached for reuse)
    const client = this.getClient(workspaceId, apiKey);

    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // Extract text content from response
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      const content = textBlock?.text ?? '';

      const result: ClaudeApiResponse = {
        content,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        stopReason: response.stop_reason || 'end_turn',
      };

      this.logger.log(
        `Claude API response received for workspace ${workspaceId}: ${result.inputTokens} input tokens, ${result.outputTokens} output tokens`,
      );

      return result;
    } catch (error: any) {
      this.handleApiError(error, workspaceId);
    }
  }

  /**
   * Story 9.8: Stream a message from Claude API
   * Returns an async iterator of streaming events
   */
  async streamMessage(
    request: ClaudeApiRequest,
  ): Promise<AsyncIterable<ClaudeStreamEvent>> {
    const { workspaceId, systemPrompt, userPrompt } = request;
    const model = request.model || DEFAULT_MODEL;
    const maxTokens = request.maxTokens || DEFAULT_MAX_TOKENS;
    const temperature = request.temperature ?? DEFAULT_TEMPERATURE;

    this.logger.log(
      `Starting Claude API stream for workspace ${workspaceId} (model: ${model})`,
    );

    // Retrieve the workspace's Anthropic API key
    const apiKey = await this.byokKeyService.getActiveKeyForProvider(
      workspaceId,
      KeyProvider.ANTHROPIC,
    );

    if (!apiKey) {
      throw new BadRequestException(
        'No Anthropic API key configured for this workspace',
      );
    }

    // Get or create Anthropic client with the workspace's key
    const client = this.getClient(workspaceId, apiKey);

    try {
      const stream = await client.messages.stream({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // Return async iterator wrapper
      return this.createStreamIterator(stream, workspaceId);
    } catch (error: any) {
      this.handleApiError(error, workspaceId);
    }
  }

  /**
   * Create async iterator from Claude stream
   */
  private async *createStreamIterator(
    stream: MessageStream,
    workspaceId: string,
  ): AsyncIterable<ClaudeStreamEvent> {
    try {
      for await (const event of stream) {
        yield event as ClaudeStreamEvent;
      }
    } catch (error: any) {
      this.logger.error(
        `Stream error for workspace ${workspaceId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Handle API errors with appropriate NestJS exceptions.
   * Never logs API keys.
   */
  private handleApiError(error: any, workspaceId: string): never {
    // Timeout errors
    if (
      error?.code === 'ETIMEDOUT' ||
      error?.code === 'ECONNABORTED' ||
      error?.message?.includes('timeout')
    ) {
      this.logger.error(
        `Claude API timeout for workspace ${workspaceId}: ${error.message}`,
      );
      throw new RequestTimeoutException(
        'Claude API request timed out. Please try again.',
      );
    }

    // Anthropic SDK error with status code
    const status = error?.status;

    if (status === 401) {
      this.logger.error(
        `Claude API authentication error for workspace ${workspaceId}`,
      );
      throw new BadRequestException(
        'Anthropic API key is invalid or revoked',
      );
    }

    if (status === 429) {
      const retryAfter = error?.headers?.['retry-after'];
      this.logger.error(
        `Claude API rate limit for workspace ${workspaceId}${retryAfter ? `, retry after: ${retryAfter}s` : ''}`,
      );
      throw new ServiceUnavailableException(
        `Claude API rate limit exceeded${retryAfter ? `. Retry after ${retryAfter} seconds` : ''}`,
      );
    }

    if (status && status >= 500) {
      this.logger.error(
        `Claude API server error for workspace ${workspaceId}: status ${status}`,
      );
      throw new InternalServerErrorException(
        'Claude API is temporarily unavailable',
      );
    }

    // Unknown error
    this.logger.error(
      `Claude API unknown error for workspace ${workspaceId}: ${error?.message || 'Unknown error'}`,
    );
    throw new InternalServerErrorException(
      `Claude API error: ${error?.message || 'Unknown error'}`,
    );
  }
}
