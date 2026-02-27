/**
 * LinearApiClientService
 * Story 21.5: Linear Two-Way Sync (AC2)
 *
 * Low-level service encapsulating all communication with the Linear GraphQL API,
 * handling authentication, rate limiting, error handling, and response parsing.
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';
import {
  CreateLinearIssueInput,
  UpdateLinearIssueInput,
  LinearIssue,
} from '../dto/linear-integration.dto';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
const RATE_LIMIT_MAX = 1500;
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

export class LinearApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errors?: Array<{ message: string }>,
  ) {
    super(message);
    this.name = 'LinearApiError';
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

@Injectable()
export class LinearApiClientService {
  private readonly logger = new Logger(LinearApiClientService.name);

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Execute a Linear GraphQL query with decrypted token.
   */
  async query<T>(
    accessToken: string,
    accessTokenIv: string,
    graphqlQuery: string,
    variables?: Record<string, unknown>,
    integrationId?: string,
  ): Promise<T> {
    // Rate limit check
    if (integrationId) {
      await this.checkRateLimit(integrationId);
    }

    const decryptedToken = this.encryptionService.decrypt(accessToken);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(LINEAR_GRAPHQL_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${decryptedToken}`,
          },
          body: JSON.stringify({ query: graphqlQuery, variables }),
        });

        if (response.status === 401) {
          this.logger.warn('Linear API returned 401 - token may be expired');
          throw new UnauthorizedException('Linear access token is invalid or expired');
        }

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
          throw new RateLimitError('Linear API rate limit exceeded', retryAfter);
        }

        if (response.status >= 500) {
          throw new LinearApiError(`Linear API server error: ${response.status}`, response.status);
        }

        // Track rate limit only after confirming a successful (non-error) response
        if (integrationId) {
          await this.trackRateLimit(integrationId);
        }

        const data = await response.json();

        if (data.errors && data.errors.length > 0) {
          throw new LinearApiError(
            `Linear GraphQL error: ${data.errors.map((e: { message: string }) => e.message).join(', ')}`,
            undefined,
            data.errors,
          );
        }

        return data.data as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry auth errors or rate limit errors
        if (error instanceof UnauthorizedException || error instanceof RateLimitError) {
          throw error;
        }

        // Don't retry GraphQL errors (client errors)
        if (error instanceof LinearApiError && !error.statusCode) {
          throw error;
        }

        // Retry on server errors and network errors
        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAYS[attempt] || 4000;
          this.logger.warn(`Linear API request failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new LinearApiError('Linear API request failed after retries');
  }

  /**
   * Fetch the authenticated user's teams from Linear.
   */
  async getTeams(
    accessToken: string,
    accessTokenIv: string,
  ): Promise<Array<{ id: string; name: string; key: string }>> {
    const result = await this.query<{ teams: { nodes: Array<{ id: string; name: string; key: string }> } }>(
      accessToken,
      accessTokenIv,
      `query { teams { nodes { id name key } } }`,
    );
    return result.teams.nodes;
  }

  /**
   * Fetch workflow states for a team.
   */
  async getWorkflowStates(
    accessToken: string,
    accessTokenIv: string,
    teamId: string,
  ): Promise<Array<{ id: string; name: string; type: string; position: number }>> {
    const result = await this.query<{
      team: { states: { nodes: Array<{ id: string; name: string; type: string; position: number }> } };
    }>(
      accessToken,
      accessTokenIv,
      `query($teamId: String!) { team(id: $teamId) { states { nodes { id name type position } } } }`,
      { teamId },
    );
    return result.team.states.nodes;
  }

  /**
   * Create a Linear issue from a DevOS story.
   */
  async createIssue(
    accessToken: string,
    accessTokenIv: string,
    input: CreateLinearIssueInput,
  ): Promise<{ id: string; identifier: string; url: string }> {
    const result = await this.query<{
      issueCreate: { success: boolean; issue: { id: string; identifier: string; url: string } };
    }>(
      accessToken,
      accessTokenIv,
      `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`,
      { input },
    );
    return result.issueCreate.issue;
  }

  /**
   * Update a Linear issue.
   */
  async updateIssue(
    accessToken: string,
    accessTokenIv: string,
    issueId: string,
    input: UpdateLinearIssueInput,
  ): Promise<{ id: string; identifier: string; updatedAt: string }> {
    const result = await this.query<{
      issueUpdate: { success: boolean; issue: { id: string; identifier: string; updatedAt: string } };
    }>(
      accessToken,
      accessTokenIv,
      `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier updatedAt } } }`,
      { id: issueId, input },
    );
    return result.issueUpdate.issue;
  }

  /**
   * Get a single Linear issue by ID.
   */
  async getIssue(
    accessToken: string,
    accessTokenIv: string,
    issueId: string,
  ): Promise<LinearIssue | null> {
    try {
      const result = await this.query<{ issue: LinearIssue }>(
        accessToken,
        accessTokenIv,
        `query($id: String!) { issue(id: $id) { id identifier title description url state { id name type } priority estimate updatedAt createdAt } }`,
        { id: issueId },
      );
      return result.issue || null;
    } catch {
      return null;
    }
  }

  /**
   * Add a comment to a Linear issue.
   */
  async addComment(
    accessToken: string,
    accessTokenIv: string,
    issueId: string,
    body: string,
  ): Promise<{ id: string }> {
    const result = await this.query<{
      commentCreate: { success: boolean; comment: { id: string } };
    }>(
      accessToken,
      accessTokenIv,
      `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id } } }`,
      { input: { issueId, body } },
    );
    return result.commentCreate.comment;
  }

  /**
   * Create a webhook subscription in Linear for a team.
   */
  async createWebhook(
    accessToken: string,
    accessTokenIv: string,
    teamId: string,
    callbackUrl: string,
    secret: string,
  ): Promise<{ id: string; enabled: boolean }> {
    const result = await this.query<{
      webhookCreate: { success: boolean; webhook: { id: string; enabled: boolean } };
    }>(
      accessToken,
      accessTokenIv,
      `mutation($input: WebhookCreateInput!) { webhookCreate(input: $input) { success webhook { id enabled } } }`,
      {
        input: {
          url: callbackUrl,
          teamId,
          secret,
          resourceTypes: ['Issue', 'Comment'],
          allPublicTeams: false,
        },
      },
    );
    return result.webhookCreate.webhook;
  }

  /**
   * Delete a webhook subscription in Linear.
   */
  async deleteWebhook(
    accessToken: string,
    accessTokenIv: string,
    webhookId: string,
  ): Promise<void> {
    await this.query(
      accessToken,
      accessTokenIv,
      `mutation($id: String!) { webhookDelete(id: $id) { success } }`,
      { id: webhookId },
    );
  }

  /**
   * Verify the access token is still valid.
   */
  async verifyToken(
    accessToken: string,
    accessTokenIv: string,
  ): Promise<{ valid: boolean; userId?: string; email?: string; error?: string }> {
    try {
      const result = await this.query<{ viewer: { id: string; email: string; name: string } }>(
        accessToken,
        accessTokenIv,
        `query { viewer { id email name } }`,
      );
      return { valid: true, userId: result.viewer.id, email: result.viewer.email };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { valid: false, error: message };
    }
  }

  private async checkRateLimit(integrationId: string): Promise<void> {
    const key = `linear-rate:${integrationId}`;
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    try {
      // Remove expired entries
      await this.redisService.zremrangebyscore(key, 0, windowStart);

      // Count current entries
      const count = await this.redisService.zcard(key);

      if (count >= RATE_LIMIT_MAX) {
        throw new RateLimitError('Linear API rate limit exceeded (1,500/hour)', 60);
      }
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      // If Redis fails, allow the request to proceed
      this.logger.warn('Failed to check rate limit, allowing request');
    }
  }

  private async trackRateLimit(integrationId: string): Promise<void> {
    const key = `linear-rate:${integrationId}`;
    const now = Date.now();

    try {
      await this.redisService.zadd(key, now, `${now}`);
      // Set TTL on the key for cleanup
      await this.redisService.expire(key, 3600);
    } catch {
      this.logger.warn('Failed to track rate limit entry');
    }
  }
}
