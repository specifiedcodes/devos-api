import {
  Injectable,
  Logger,
  ConflictException,
  BadGatewayException,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  SupabaseProjectResponseDto,
  SupabaseOrganizationListResponseDto,
} from './dto/supabase.dto';

// DEPRECATED: Scheduled for removal. See Epic 28.
// TODO(epic-28-cleanup): Remove after sunset period

/**
 * @deprecated Supabase database provisioning is deprecated. Use Railway instead. See Epic 28.
 * Scheduled for removal after sunset period (90 days from 2026-03-01).
 *
 * SupabaseService
 * Story 6.7: Supabase Database Provisioning
 *
 * Manages Supabase Management REST API interactions for project creation,
 * database provisioning, status polling, API key retrieval, and lifecycle management.
 */
@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly apiBaseUrl = 'https://api.supabase.com';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Execute a REST request against Supabase Management API
   */
  private async executeRequest<T>(
    token: string,
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    data?: any,
  ): Promise<T> {
    try {
      const url = `${this.apiBaseUrl}${path}`;
      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      };

      let response;
      if (method === 'get' || method === 'delete') {
        response = await firstValueFrom(
          this.httpService[method](url, config),
        );
      } else {
        response = await firstValueFrom(
          this.httpService[method](url, data, config),
        );
      }

      return response.data as T;
    } catch (error: any) {
      // Re-throw known exceptions
      if (
        error instanceof ConflictException ||
        error instanceof BadGatewayException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      const status = error?.response?.status;
      const rawMessage =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        'Unknown error';

      // Sanitize error message: strip any potential token/credential leaks
      const message = rawMessage.replace(
        /Bearer\s+\S+/gi,
        'Bearer [REDACTED]',
      );

      this.logger.error(
        `Supabase API request failed: status=${status}, message=${message}`,
      );

      if (status === 429) {
        throw new BadGatewayException(
          'Supabase API rate limit exceeded. Please try again later.',
        );
      }

      if (status === 404) {
        return null as T;
      }

      if (status === 409) {
        throw new ConflictException(
          'Supabase project with this name already exists in the organization',
        );
      }

      throw new BadGatewayException(`Supabase API error: ${message}`);
    }
  }

  /**
   * Map Supabase project status to DevOS status
   */
  private mapProjectStatus(supabaseStatus: string): string {
    const statusMap: Record<string, string> = {
      COMING_UP: 'provisioning',
      ACTIVE_HEALTHY: 'active',
      ACTIVE_UNHEALTHY: 'unhealthy',
      INACTIVE: 'inactive',
      GOING_DOWN: 'shutting_down',
      INIT_FAILED: 'failed',
      REMOVED: 'removed',
      RESTORING: 'restoring',
      UPGRADING: 'upgrading',
      PAUSING: 'pausing',
      PAUSED: 'paused',
    };
    return statusMap[supabaseStatus] || 'unknown';
  }

  /**
   * @deprecated Use Railway database provisioning instead. See Epic 28.
   * TODO(epic-28-cleanup): Remove after sunset period
   *
   * Create a Supabase project (provisions a Postgres database)
   */
  async createProject(
    token: string,
    options: {
      name: string;
      organizationId: string;
      region?: string;
      dbPassword: string;
      plan?: string;
    },
  ): Promise<SupabaseProjectResponseDto> {
    this.logger.log(`Creating Supabase project: ${options.name}`);

    const body = {
      name: options.name,
      organization_id: options.organizationId,
      region: options.region || 'us-east-1',
      db_pass: options.dbPassword,
      plan: options.plan || 'free',
    };

    const result = await this.executeRequest<any>(
      token,
      'post',
      '/v1/projects',
      body,
    );

    return {
      id: result.id,
      name: result.name,
      organizationId: result.organization_id,
      region: result.region,
      status: this.mapProjectStatus(result.status || 'COMING_UP'),
      projectUrl: `https://supabase.com/dashboard/project/${result.id}`,
      createdAt: result.created_at
        ? new Date(result.created_at).toISOString()
        : new Date().toISOString(),
    };
  }

  /**
   * @deprecated Use Railway service status instead. See Epic 28.
   * TODO(epic-28-cleanup): Remove after sunset period
   *
   * Get Supabase project details and status
   * Returns null for not-found errors
   */
  async getProject(
    token: string,
    projectRef: string,
  ): Promise<SupabaseProjectResponseDto | null> {
    this.logger.log(`Getting Supabase project: ${projectRef}`);

    const result = await this.executeRequest<any>(
      token,
      'get',
      `/v1/projects/${projectRef}`,
    );

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      name: result.name,
      organizationId: result.organization_id,
      region: result.region,
      status: this.mapProjectStatus(result.status),
      projectUrl: `https://supabase.com/dashboard/project/${result.id}`,
      database: result.database
        ? {
            host: result.database.host,
            version: result.database.version,
          }
        : undefined,
      createdAt: result.created_at
        ? new Date(result.created_at).toISOString()
        : new Date().toISOString(),
    };
  }

  /**
   * @deprecated Use Railway connection info instead. See Epic 28.
   * TODO(epic-28-cleanup): Remove after sunset period
   *
   * Get API keys for a Supabase project
   */
  async getProjectApiKeys(
    token: string,
    projectRef: string,
  ): Promise<Array<{ name: string; apiKey: string }>> {
    this.logger.log(`Getting API keys for Supabase project: ${projectRef}`);

    const result = await this.executeRequest<any[]>(
      token,
      'get',
      `/v1/projects/${projectRef}/api-keys`,
    );

    if (!result || !Array.isArray(result)) {
      return [];
    }

    return result.map((key: any) => ({
      name: key.name,
      apiKey: key.api_key,
    }));
  }

  /**
   * @deprecated Use Railway project management instead. See Epic 28.
   * TODO(epic-28-cleanup): Remove after sunset period
   *
   * List organizations the authenticated user belongs to
   */
  async listOrganizations(
    token: string,
  ): Promise<SupabaseOrganizationListResponseDto> {
    this.logger.log('Listing Supabase organizations');

    const result = await this.executeRequest<any[]>(
      token,
      'get',
      '/v1/organizations',
    );

    if (!result || !Array.isArray(result)) {
      return { organizations: [] };
    }

    return {
      organizations: result.map((org: any) => ({
        id: org.id,
        name: org.name,
      })),
    };
  }

  /**
   * @deprecated Use Railway service management instead. See Epic 28.
   * TODO(epic-28-cleanup): Remove after sunset period
   *
   * Pause a Supabase project (free tier)
   */
  async pauseProject(token: string, projectRef: string): Promise<void> {
    this.logger.log(`Pausing Supabase project: ${projectRef}`);

    await this.executeRequest<any>(
      token,
      'post',
      `/v1/projects/${projectRef}/pause`,
    );
  }

  /**
   * @deprecated Use Railway service management instead. See Epic 28.
   * TODO(epic-28-cleanup): Remove after sunset period
   *
   * Resume a paused Supabase project
   */
  async resumeProject(token: string, projectRef: string): Promise<void> {
    this.logger.log(`Resuming Supabase project: ${projectRef}`);

    await this.executeRequest<any>(
      token,
      'post',
      `/v1/projects/${projectRef}/resume`,
    );
  }
}
