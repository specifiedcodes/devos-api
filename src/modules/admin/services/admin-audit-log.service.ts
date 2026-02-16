import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../../database/entities/audit-log.entity';
import { User } from '../../../database/entities/user.entity';
import { AuditSavedSearch } from '../../../database/entities/audit-saved-search.entity';
import {
  AdminAuditLogQueryDto,
  AdminAuditLogStatsDto,
  CreateSavedSearchDto,
  AuditLogEntryDto,
  AuditLogDetailDto,
  AuditLogStatsResponse,
} from '../dto/audit-log.dto';

/**
 * AdminAuditLogService
 * Story 14.10: Audit Log Viewer (AC1, AC3)
 *
 * Platform-wide audit log querying with advanced filtering,
 * aggregation, export, and saved search capabilities.
 */
@Injectable()
export class AdminAuditLogService {
  private readonly logger = new Logger(AdminAuditLogService.name);

  // In-memory cache for action types and resource types
  private actionTypesCache: { data: string[]; expiresAt: number } | null = null;
  private resourceTypesCache: { data: string[]; expiresAt: number } | null = null;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditSavedSearch)
    private readonly savedSearchRepository: Repository<AuditSavedSearch>,
  ) {}

  /**
   * Query audit logs with advanced filtering, pagination, and user email resolution.
   */
  async queryLogs(
    query: AdminAuditLogQueryDto,
    options?: { maxLimit?: number },
  ): Promise<{ items: AuditLogEntryDto[]; total: number }> {
    const page = query.page || 1;
    const maxAllowed = options?.maxLimit || 100;
    const limit = Math.min(query.limit || 50, maxAllowed);
    const skip = (page - 1) * limit;

    const qb = this.auditLogRepository
      .createQueryBuilder('audit')
      .leftJoin('users', 'u', 'u.id::text = audit.userId')
      .select([
        'audit.id AS id',
        'audit.created_at AS timestamp',
        'audit.user_id AS "userId"',
        'u.email AS "userEmail"',
        'audit.workspace_id AS "workspaceId"',
        'audit.action AS action',
        'audit.resource_type AS "resourceType"',
        'audit.resource_id AS "resourceId"',
        'audit.ip_address AS "ipAddress"',
        'audit.user_agent AS "userAgent"',
        'audit.metadata AS metadata',
      ]);

    // Apply filters
    if (query.userId) {
      qb.andWhere('audit.user_id = :userId', { userId: query.userId });
    }

    if (query.userEmail) {
      qb.andWhere('u.email ILIKE :userEmail', {
        userEmail: `%${query.userEmail}%`,
      });
    }

    if (query.workspaceId) {
      qb.andWhere('audit.workspace_id = :workspaceId', {
        workspaceId: query.workspaceId,
      });
    }

    if (query.action) {
      qb.andWhere('audit.action = :action', { action: query.action });
    }

    if (query.actionPrefix) {
      qb.andWhere('audit.action LIKE :actionPrefix', {
        actionPrefix: `${query.actionPrefix}%`,
      });
    }

    if (query.resourceType) {
      qb.andWhere('audit.resource_type = :resourceType', {
        resourceType: query.resourceType,
      });
    }

    if (query.resourceId) {
      qb.andWhere('audit.resource_id = :resourceId', {
        resourceId: query.resourceId,
      });
    }

    if (query.ipAddress) {
      qb.andWhere('audit.ip_address = :ipAddress', {
        ipAddress: query.ipAddress,
      });
    }

    if (query.startDate) {
      qb.andWhere('audit.created_at >= :startDate', {
        startDate: query.startDate,
      });
    }

    if (query.endDate) {
      qb.andWhere('audit.created_at <= :endDate', {
        endDate: query.endDate,
      });
    }

    if (query.search) {
      qb.andWhere(
        '(audit.action ILIKE :search OR audit.resource_type ILIKE :search OR audit.resource_id ILIKE :search OR audit.metadata::text ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    // Get total count
    const countQb = qb.clone();
    const totalResult = await countQb.select('COUNT(*)', 'count').getRawOne();
    const total = parseInt(totalResult?.count || '0', 10);

    // Get paginated results
    const items = await qb
      .orderBy('audit.created_at', 'DESC')
      .limit(limit)
      .offset(skip)
      .getRawMany();

    return {
      items: items.map((item) => ({
        id: item.id,
        timestamp: item.timestamp,
        userId: item.userId,
        userEmail: item.userEmail || null,
        workspaceId: item.workspaceId,
        action: item.action,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        ipAddress: item.ipAddress || null,
        userAgent: item.userAgent || null,
        metadata: item.metadata || null,
      })),
      total,
    };
  }

  /**
   * Get full detail for a single audit log entry.
   */
  async getLogDetail(logId: string): Promise<AuditLogDetailDto> {
    const result = await this.auditLogRepository
      .createQueryBuilder('audit')
      .leftJoin('users', 'u', 'u.id::text = audit.userId')
      .select([
        'audit.id AS id',
        'audit.created_at AS timestamp',
        'audit.user_id AS "userId"',
        'u.email AS "userEmail"',
        'audit.workspace_id AS "workspaceId"',
        'audit.action AS action',
        'audit.resource_type AS "resourceType"',
        'audit.resource_id AS "resourceId"',
        'audit.ip_address AS "ipAddress"',
        'audit.user_agent AS "userAgent"',
        'audit.metadata AS metadata',
      ])
      .where('audit.id = :logId', { logId })
      .getRawOne();

    if (!result) {
      throw new NotFoundException('Audit log entry not found');
    }

    return {
      id: result.id,
      timestamp: result.timestamp,
      userId: result.userId,
      userEmail: result.userEmail || null,
      workspaceId: result.workspaceId,
      action: result.action,
      resourceType: result.resourceType,
      resourceId: result.resourceId,
      ipAddress: result.ipAddress || null,
      userAgent: result.userAgent || null,
      metadata: result.metadata || null,
    };
  }

  /**
   * Get distinct action types from audit logs.
   * Cached for 5 minutes.
   */
  async getActionTypes(): Promise<string[]> {
    const now = Date.now();
    if (this.actionTypesCache && this.actionTypesCache.expiresAt > now) {
      return this.actionTypesCache.data;
    }

    const results = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('DISTINCT audit.action', 'action')
      .orderBy('audit.action', 'ASC')
      .getRawMany();

    const actions = results.map((r) => r.action);
    this.actionTypesCache = {
      data: actions,
      expiresAt: now + AdminAuditLogService.CACHE_TTL_MS,
    };

    return actions;
  }

  /**
   * Get distinct resource types from audit logs.
   * Cached for 5 minutes.
   */
  async getResourceTypes(): Promise<string[]> {
    const now = Date.now();
    if (this.resourceTypesCache && this.resourceTypesCache.expiresAt > now) {
      return this.resourceTypesCache.data;
    }

    const results = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('DISTINCT audit.resource_type', 'resourceType')
      .orderBy('audit.resource_type', 'ASC')
      .getRawMany();

    const types = results.map((r) => r.resourceType);
    this.resourceTypesCache = {
      data: types,
      expiresAt: now + AdminAuditLogService.CACHE_TTL_MS,
    };

    return types;
  }

  /**
   * Export audit logs as CSV or JSON.
   * Max 100,000 records per export.
   */
  async exportLogs(
    query: AdminAuditLogQueryDto,
    format: 'csv' | 'json',
  ): Promise<string> {
    const maxRecords = 100000;
    const allItems: AuditLogEntryDto[] = [];

    // Fetch in batches of 1000 (bypasses normal 100-record API limit)
    let currentPage = 1;
    const batchSize = 1000;
    while (allItems.length < maxRecords) {
      const batchQuery = { ...query, page: currentPage, limit: batchSize };
      const { items, total } = await this.queryLogs(batchQuery, { maxLimit: batchSize });
      allItems.push(...items);

      if (allItems.length >= total || allItems.length >= maxRecords || items.length === 0) {
        break;
      }
      currentPage++;
    }

    // Trim to max
    const exportItems = allItems.slice(0, maxRecords);

    if (format === 'json') {
      return JSON.stringify(exportItems, null, 2);
    }

    // CSV format
    const headers = [
      'Timestamp',
      'User ID',
      'User Email',
      'Workspace ID',
      'Action',
      'Resource Type',
      'Resource ID',
      'IP Address',
      'User Agent',
      'Metadata',
    ];

    const escapeCSV = (field: any): string => {
      if (field === null || field === undefined) return '';

      let value = String(field);

      // CSV injection protection: escape formula characters and always wrap in quotes
      const isFormula =
        value.startsWith('=') ||
        value.startsWith('+') ||
        value.startsWith('-') ||
        value.startsWith('@');

      if (isFormula) {
        value = `'${value}`;
      }

      // Escape quotes and wrap in quotes if contains special characters or is a formula
      if (isFormula || value.includes(',') || value.includes('\n') || value.includes('"')) {
        value = `"${value.replace(/"/g, '""')}"`;
      }

      return value;
    };

    const rows = exportItems.map((item) =>
      [
        item.timestamp instanceof Date ? item.timestamp.toISOString() : String(item.timestamp),
        item.userId,
        item.userEmail || '',
        item.workspaceId,
        item.action,
        item.resourceType,
        item.resourceId,
        item.ipAddress || '',
        item.userAgent || '',
        JSON.stringify(item.metadata || {}),
      ].map(escapeCSV),
    );

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }

  /**
   * Get aggregate audit statistics for a given time range.
   */
  async getAuditStats(
    query: AdminAuditLogStatsDto,
  ): Promise<AuditLogStatsResponse> {
    const { startDate, endDate } = query;

    // Total events
    const totalResult = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('COUNT(*)', 'count')
      .where('audit.created_at >= :startDate', { startDate })
      .andWhere('audit.created_at <= :endDate', { endDate })
      .getRawOne();
    const totalEvents = parseInt(totalResult?.count || '0', 10);

    // Events by action (top 10)
    const actionResults = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('audit.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .where('audit.created_at >= :startDate', { startDate })
      .andWhere('audit.created_at <= :endDate', { endDate })
      .groupBy('audit.action')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();
    const eventsByAction = actionResults.map((r) => ({
      action: r.action,
      count: parseInt(r.count, 10),
    }));

    // Events by resource type
    const resourceResults = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('audit.resource_type', 'resourceType')
      .addSelect('COUNT(*)', 'count')
      .where('audit.created_at >= :startDate', { startDate })
      .andWhere('audit.created_at <= :endDate', { endDate })
      .groupBy('audit.resource_type')
      .orderBy('count', 'DESC')
      .getRawMany();
    const eventsByResourceType = resourceResults.map((r) => ({
      resourceType: r.resourceType,
      count: parseInt(r.count, 10),
    }));

    // Events by user (top 10 with email)
    const userResults = await this.auditLogRepository
      .createQueryBuilder('audit')
      .leftJoin('users', 'u', 'u.id::text = audit.userId')
      .select('audit.user_id', 'userId')
      .addSelect('u.email', 'userEmail')
      .addSelect('COUNT(*)', 'count')
      .where('audit.created_at >= :startDate', { startDate })
      .andWhere('audit.created_at <= :endDate', { endDate })
      .groupBy('audit.user_id')
      .addGroupBy('u.email')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();
    const eventsByUser = userResults.map((r) => ({
      userId: r.userId,
      userEmail: r.userEmail || null,
      count: parseInt(r.count, 10),
    }));

    // Security events count
    const securityResult = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('COUNT(*)', 'count')
      .where('audit.created_at >= :startDate', { startDate })
      .andWhere('audit.created_at <= :endDate', { endDate })
      .andWhere(
        'audit.action IN (:...securityActions)',
        {
          securityActions: [
            'permission_denied',
            'unauthorized_access_attempt',
            'login_failed',
          ],
        },
      )
      .getRawOne();
    const securityEvents = parseInt(securityResult?.count || '0', 10);

    // Admin events count
    const adminResult = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('COUNT(*)', 'count')
      .where('audit.created_at >= :startDate', { startDate })
      .andWhere('audit.created_at <= :endDate', { endDate })
      .andWhere('audit.action LIKE :adminPrefix', { adminPrefix: 'admin.%' })
      .getRawOne();
    const adminEvents = parseInt(adminResult?.count || '0', 10);

    return {
      totalEvents,
      eventsByAction,
      eventsByResourceType,
      eventsByUser,
      securityEvents,
      adminEvents,
    };
  }

  /**
   * Get saved searches for an admin (own + shared).
   */
  async getSavedSearches(adminId: string): Promise<AuditSavedSearch[]> {
    return this.savedSearchRepository
      .createQueryBuilder('search')
      .where('search.created_by = :adminId OR search.is_shared = true', {
        adminId,
      })
      .orderBy('search.updated_at', 'DESC')
      .getMany();
  }

  /**
   * Create a new saved search.
   */
  async createSavedSearch(
    adminId: string,
    dto: CreateSavedSearchDto,
  ): Promise<AuditSavedSearch> {
    // Check name uniqueness per admin
    const existing = await this.savedSearchRepository.findOne({
      where: { name: dto.name, createdBy: adminId },
    });
    if (existing) {
      throw new ConflictException(
        `A saved search with name "${dto.name}" already exists`,
      );
    }

    const savedSearch = this.savedSearchRepository.create({
      name: dto.name,
      createdBy: adminId,
      filters: dto.filters,
      isShared: dto.isShared || false,
    });

    return this.savedSearchRepository.save(savedSearch);
  }

  /**
   * Delete a saved search (only by its creator).
   */
  async deleteSavedSearch(adminId: string, searchId: string): Promise<void> {
    const savedSearch = await this.savedSearchRepository.findOne({
      where: { id: searchId },
    });

    if (!savedSearch) {
      throw new NotFoundException('Saved search not found');
    }

    if (savedSearch.createdBy !== adminId) {
      throw new ForbiddenException(
        'You can only delete your own saved searches',
      );
    }

    await this.savedSearchRepository.remove(savedSearch);
  }
}
