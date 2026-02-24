/**
 * JiraApiClientService
 * Story 21.6: Jira Two-Way Sync (AC2)
 *
 * Low-level service encapsulating all communication with the Jira REST API v3,
 * handling authentication, token refresh, rate limiting, error handling, and response parsing.
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';
import {
  CreateJiraIssueInput,
  UpdateJiraIssueInput,
  JiraIssue,
} from '../dto/jira-integration.dto';

const RATE_LIMIT_MAX = 90; // Conservative limit (Jira allows ~100/min)
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

export class JiraApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'JiraApiError';
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
export class JiraApiClientService {
  private readonly logger = new Logger(JiraApiClientService.name);

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @InjectRepository(JiraIntegration)
    private readonly integrationRepo: Repository<JiraIntegration>,
  ) {}

  /**
   * Execute a Jira REST API request with decrypted token.
   * Handles token refresh, rate limiting, retry, and error normalization.
   */
  async request<T>(
    integration: JiraIntegration,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    // Check if token needs refresh
    if (this.isTokenExpiringSoon(integration)) {
      await this.refreshAccessToken(integration);
    }

    // Rate limit check
    await this.checkRateLimit(integration.id);

    const decryptedToken = this.encryptionService.decrypt(
      integration.accessToken,
      integration.accessTokenIv,
    );

    const baseUrl = `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3`;
    const url = `${baseUrl}${path}`;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${decryptedToken}`,
            Accept: 'application/json',
          },
        };

        if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);

        if (response.status === 401) {
          // Try token refresh once
          if (attempt === 0) {
            this.logger.warn('Jira API returned 401 - attempting token refresh');
            try {
              await this.refreshAccessToken(integration);
              // Retry with new token
              const newToken = this.encryptionService.decrypt(
                integration.accessToken,
                integration.accessTokenIv,
              );
              (fetchOptions.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
              const retryResponse = await fetch(url, fetchOptions);
              if (retryResponse.status === 401) {
                throw new UnauthorizedException('Jira access token is invalid after refresh');
              }
              await this.trackRateLimit(integration.id);
              if (retryResponse.status === 204) return undefined as T;
              return (await retryResponse.json()) as T;
            } catch (refreshError) {
              if (refreshError instanceof UnauthorizedException) throw refreshError;
              throw new UnauthorizedException('Jira access token is invalid or expired');
            }
          }
          throw new UnauthorizedException('Jira access token is invalid or expired');
        }

        if (response.status === 403) {
          throw new JiraApiError('Jira API permission denied', 403);
        }

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
          throw new RateLimitError('Jira API rate limit exceeded', retryAfter);
        }

        if (response.status === 404) {
          throw new JiraApiError('Jira resource not found', 404);
        }

        if (response.status >= 500) {
          throw new JiraApiError(`Jira API server error: ${response.status}`, response.status);
        }

        // Track rate limit after successful call
        await this.trackRateLimit(integration.id);

        if (response.status === 204) return undefined as T;

        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry auth errors or rate limit errors
        if (error instanceof UnauthorizedException || error instanceof RateLimitError) {
          throw error;
        }

        // Don't retry 403 or 404 errors
        if (error instanceof JiraApiError && (error.statusCode === 403 || error.statusCode === 404)) {
          throw error;
        }

        // Retry on server errors and network errors
        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAYS[attempt] || 4000;
          this.logger.warn(`Jira API request failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new JiraApiError('Jira API request failed after retries');
  }

  /**
   * Fetch accessible Atlassian Cloud sites for the authenticated user.
   */
  async getAccessibleSites(
    accessToken: string,
    accessTokenIv: string,
  ): Promise<Array<{ id: string; url: string; name: string; avatarUrl?: string }>> {
    const decryptedToken = this.encryptionService.decrypt(accessToken, accessTokenIv);

    const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: {
        Authorization: `Bearer ${decryptedToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new JiraApiError(`Failed to fetch accessible sites: ${response.status}`, response.status);
    }

    return response.json();
  }

  /**
   * Fetch projects for a Jira site.
   */
  async getProjects(
    integration: JiraIntegration,
  ): Promise<Array<{ id: string; key: string; name: string; projectTypeKey: string }>> {
    const result = await this.request<{ values: Array<{ id: string; key: string; name: string; projectTypeKey: string }> }>(
      integration,
      'GET',
      '/project/search',
    );
    return result.values || [];
  }

  /**
   * Fetch issue types for a Jira project.
   */
  async getIssueTypes(
    integration: JiraIntegration,
    projectKey: string,
  ): Promise<Array<{ id: string; name: string; subtask: boolean; description?: string }>> {
    const result = await this.request<Array<{ id: string; name: string; subtask: boolean; description?: string }>>(
      integration,
      'GET',
      `/issuetype/project?projectId=${encodeURIComponent(projectKey)}`,
    );
    return Array.isArray(result) ? result : [];
  }

  /**
   * Fetch workflow statuses for a Jira project.
   */
  async getProjectStatuses(
    integration: JiraIntegration,
    projectKey: string,
  ): Promise<Array<{ id: string; name: string; statusCategory: { key: string; name: string } }>> {
    const result = await this.request<Array<{ statuses: Array<{ id: string; name: string; statusCategory: { key: string; name: string } }> }>>(
      integration,
      'GET',
      `/project/${encodeURIComponent(projectKey)}/statuses`,
    );
    // Flatten statuses from all issue types
    const allStatuses: Array<{ id: string; name: string; statusCategory: { key: string; name: string } }> = [];
    const seen = new Set<string>();
    if (Array.isArray(result)) {
      for (const issueType of result) {
        if (Array.isArray(issueType.statuses)) {
          for (const status of issueType.statuses) {
            if (!seen.has(status.id)) {
              seen.add(status.id);
              allStatuses.push(status);
            }
          }
        }
      }
    }
    return allStatuses;
  }

  /**
   * Fetch available workflow transitions for an issue.
   */
  async getIssueTransitions(
    integration: JiraIntegration,
    issueIdOrKey: string,
  ): Promise<Array<{ id: string; name: string; to: { id: string; name: string } }>> {
    const result = await this.request<{ transitions: Array<{ id: string; name: string; to: { id: string; name: string } }> }>(
      integration,
      'GET',
      `/issue/${encodeURIComponent(issueIdOrKey)}/transitions`,
    );
    return result.transitions || [];
  }

  /**
   * Create a Jira issue from a DevOS story.
   */
  async createIssue(
    integration: JiraIntegration,
    input: CreateJiraIssueInput,
  ): Promise<{ id: string; key: string; self: string }> {
    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      issuetype: { name: input.issueType },
      summary: input.summary,
    };

    if (input.description) {
      fields.description = JSON.parse(input.description);
    }

    if (input.priority) {
      fields.priority = input.priority;
    }

    if (input.labels) {
      fields.labels = input.labels;
    }

    return this.request<{ id: string; key: string; self: string }>(
      integration,
      'POST',
      '/issue',
      { fields },
    );
  }

  /**
   * Update a Jira issue (fields only, not status transitions).
   */
  async updateIssue(
    integration: JiraIntegration,
    issueIdOrKey: string,
    input: UpdateJiraIssueInput,
  ): Promise<void> {
    const fields: Record<string, unknown> = {};

    if (input.summary) {
      fields.summary = input.summary;
    }

    if (input.description) {
      fields.description = JSON.parse(input.description);
    }

    if (input.priority) {
      fields.priority = input.priority;
    }

    if (input.labels) {
      fields.labels = input.labels;
    }

    await this.request<void>(
      integration,
      'PUT',
      `/issue/${encodeURIComponent(issueIdOrKey)}`,
      { fields },
    );
  }

  /**
   * Transition a Jira issue to a new status via workflow transition.
   */
  async transitionIssue(
    integration: JiraIntegration,
    issueIdOrKey: string,
    transitionId: string,
  ): Promise<void> {
    await this.request<void>(
      integration,
      'POST',
      `/issue/${encodeURIComponent(issueIdOrKey)}/transitions`,
      { transition: { id: transitionId } },
    );
  }

  /**
   * Get a single Jira issue by ID or key.
   */
  async getIssue(
    integration: JiraIntegration,
    issueIdOrKey: string,
  ): Promise<JiraIssue | null> {
    try {
      return await this.request<JiraIssue>(
        integration,
        'GET',
        `/issue/${encodeURIComponent(issueIdOrKey)}?expand=changelog`,
      );
    } catch (error) {
      // Only return null for 404 (not found) - re-throw auth, rate limit, and other errors
      if (error instanceof JiraApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Add a comment to a Jira issue.
   */
  async addComment(
    integration: JiraIntegration,
    issueIdOrKey: string,
    body: string,
  ): Promise<{ id: string }> {
    const adfBody = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: body }],
        },
      ],
    };

    return this.request<{ id: string }>(
      integration,
      'POST',
      `/issue/${encodeURIComponent(issueIdOrKey)}/comment`,
      { body: adfBody },
    );
  }

  /**
   * Register a webhook in Jira for the project.
   */
  async registerWebhook(
    integration: JiraIntegration,
    callbackUrl: string,
    events: string[],
  ): Promise<{ webhookRegistrationResult: Array<{ createdWebhookId: number }> }> {
    return this.request<{ webhookRegistrationResult: Array<{ createdWebhookId: number }> }>(
      integration,
      'POST',
      '/webhook',
      {
        webhooks: [
          {
            jqlFilter: `project = ${integration.jiraProjectKey}`,
            events,
            url: callbackUrl,
          },
        ],
      },
    );
  }

  /**
   * Delete a webhook registration in Jira.
   */
  async deleteWebhook(
    integration: JiraIntegration,
    webhookId: string,
  ): Promise<void> {
    // Jira REST API v3 webhook deletion requires the webhook IDs in the request body
    await this.request<void>(
      integration,
      'DELETE',
      `/webhook`,
      { webhookIds: [parseInt(webhookId, 10)] },
    );
  }

  /**
   * Verify the access token is still valid by fetching current user.
   */
  async verifyToken(
    integration: JiraIntegration,
  ): Promise<{ valid: boolean; accountId?: string; email?: string; displayName?: string; error?: string }> {
    try {
      const result = await this.request<{ accountId: string; emailAddress: string; displayName: string }>(
        integration,
        'GET',
        '/myself',
      );
      return { valid: true, accountId: result.accountId, email: result.emailAddress, displayName: result.displayName };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { valid: false, error: message };
    }
  }

  /**
   * Refresh the access token using the refresh token.
   * Updates the integration record with new tokens.
   */
  async refreshAccessToken(
    integration: JiraIntegration,
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    // Use Redis lock to prevent concurrent refreshes
    const lockKey = `jira-token-refresh:${integration.id}`;
    const lockAcquired = await this.tryAcquireLock(lockKey, 30);

    if (!lockAcquired) {
      // Another process is refreshing, wait and return
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Reload integration to get updated tokens
      const updated = await this.integrationRepo.findOne({ where: { id: integration.id } });
      if (updated) {
        integration.accessToken = updated.accessToken;
        integration.accessTokenIv = updated.accessTokenIv;
        integration.tokenExpiresAt = updated.tokenExpiresAt;
        if (updated.refreshToken) integration.refreshToken = updated.refreshToken;
        if (updated.refreshTokenIv) integration.refreshTokenIv = updated.refreshTokenIv;
      }
      return { accessToken: integration.accessToken, expiresAt: integration.tokenExpiresAt };
    }

    try {
      const decryptedRefreshToken = this.encryptionService.decrypt(
        integration.refreshToken,
        integration.refreshTokenIv,
      );

      const response = await fetch('https://auth.atlassian.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: this.configService.get<string>('JIRA_CLIENT_ID') || '',
          client_secret: this.configService.get<string>('JIRA_CLIENT_SECRET') || '',
          refresh_token: decryptedRefreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh Jira access token');
      }

      const data = await response.json();
      const newAccessToken = data.access_token;
      const newRefreshToken = data.refresh_token;
      const expiresIn = data.expires_in || 3600;
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      // Encrypt new tokens
      const encryptedAccess = this.encryptionService.encrypt(newAccessToken);
      const encryptedRefresh = this.encryptionService.encrypt(newRefreshToken);

      // Update integration record
      integration.accessToken = encryptedAccess.encrypted;
      integration.accessTokenIv = encryptedAccess.iv;
      integration.refreshToken = encryptedRefresh.encrypted;
      integration.refreshTokenIv = encryptedRefresh.iv;
      integration.tokenExpiresAt = expiresAt;

      await this.integrationRepo.update(integration.id, {
        accessToken: encryptedAccess.encrypted,
        accessTokenIv: encryptedAccess.iv,
        refreshToken: encryptedRefresh.encrypted,
        refreshTokenIv: encryptedRefresh.iv,
        tokenExpiresAt: expiresAt,
      });

      return { accessToken: encryptedAccess.encrypted, expiresAt };
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  private isTokenExpiringSoon(integration: JiraIntegration): boolean {
    if (!integration.tokenExpiresAt) return false;
    return new Date(integration.tokenExpiresAt).getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS;
  }

  private async checkRateLimit(integrationId: string): Promise<void> {
    const key = `jira-rate:${integrationId}`;
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    try {
      // Remove expired entries
      await this.redisService.zremrangebyscore(key, 0, windowStart);

      // Count current entries
      const count = await this.redisService.zcard(key);

      if (count >= RATE_LIMIT_MAX) {
        throw new RateLimitError('Jira API rate limit exceeded (90/min)', 60);
      }
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      // If Redis fails, allow the request to proceed
      this.logger.warn('Failed to check rate limit, allowing request');
    }
  }

  private async trackRateLimit(integrationId: string): Promise<void> {
    const key = `jira-rate:${integrationId}`;
    const now = Date.now();

    try {
      await this.redisService.zadd(key, now, `${now}`);
      await this.redisService.expire(key, 120); // 2 minute TTL for cleanup
    } catch {
      this.logger.warn('Failed to track rate limit entry');
    }
  }

  private async tryAcquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redisService.setnx(key, 'locked', ttlSeconds);
      return result === 'OK';
    } catch {
      return false;
    }
  }

  private async releaseLock(key: string): Promise<void> {
    try {
      await this.redisService.del(key);
    } catch {
      this.logger.warn(`Failed to release lock: ${key}`);
    }
  }
}
