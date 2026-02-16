import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../../../database/entities/user.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { ScimConfiguration } from '../../../database/entities/scim-configuration.entity';
import { ScimSyncLog, ScimOperation, ScimResourceType, ScimSyncStatus } from '../../../database/entities/scim-sync-log.entity';
import { ScimGroupMembership } from '../../../database/entities/scim-group-membership.entity';
import { ScimGroup } from '../../../database/entities/scim-group.entity';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { SCIM_CONSTANTS } from '../constants/scim.constants';
import { ScimSyncLogService } from './scim-sync-log.service';
import {
  ScimUserResource,
  ScimListResponse,
  ScimCreateUserRequest,
  ScimPatchRequest,
  ScimErrorResponse,
} from '../dto/scim.dto';

interface ParsedFilter {
  attribute: string;
  operator: string;
  value: string;
}

@Injectable()
export class ScimUserService {
  private readonly logger = new Logger(ScimUserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    @InjectRepository(ScimGroup)
    private readonly scimGroupRepository: Repository<ScimGroup>,
    @InjectRepository(ScimGroupMembership)
    private readonly scimGroupMembershipRepository: Repository<ScimGroupMembership>,
    private readonly ssoAuditService: SsoAuditService,
    private readonly scimSyncLogService: ScimSyncLogService,
  ) {}

  /**
   * List users for a workspace with SCIM filtering, pagination, and sorting.
   */
  async listUsers(
    workspaceId: string,
    filter?: string,
    startIndex?: number,
    count?: number,
    sortBy?: string,
    sortOrder?: 'ascending' | 'descending',
  ): Promise<ScimListResponse<ScimUserResource>> {
    const effectiveStartIndex = Math.max(1, startIndex || SCIM_CONSTANTS.DEFAULT_START_INDEX);
    const effectiveCount = Math.min(
      SCIM_CONSTANTS.MAX_PAGE_SIZE,
      Math.max(1, count || SCIM_CONSTANTS.DEFAULT_PAGE_SIZE),
    );
    const skip = effectiveStartIndex - 1; // SCIM is 1-based

    // Build query
    const qb = this.workspaceMemberRepository
      .createQueryBuilder('member')
      .innerJoinAndSelect('member.user', 'user')
      .where('member.workspaceId = :workspaceId', { workspaceId });

    // Apply filter
    if (filter) {
      try {
        const filters = this.parseFilter(filter);
        for (let i = 0; i < filters.length; i++) {
          const f = filters[i];
          this.applyUserFilter(qb, f, i);
        }
      } catch {
        throw new HttpException(
          {
            schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
            status: '400',
            scimType: SCIM_CONSTANTS.ERROR_TYPES.INVALID_FILTER,
            detail: 'Invalid filter syntax',
          } as ScimErrorResponse,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Get total count (before pagination)
    const totalResults = await qb.getCount();

    // Apply pagination
    qb.skip(skip).take(effectiveCount);

    // Apply sorting
    if (sortBy === 'userName') {
      qb.orderBy('user.email', sortOrder === 'descending' ? 'DESC' : 'ASC');
    } else {
      qb.orderBy('user.createdAt', 'ASC');
    }

    const members = await qb.getMany();

    const resources = members.map((m) =>
      this.toScimUserResource(m.user!, m, workspaceId, ''),
    );

    return {
      schemas: [SCIM_CONSTANTS.SCHEMAS.LIST_RESPONSE],
      totalResults,
      startIndex: effectiveStartIndex,
      itemsPerPage: resources.length,
      Resources: resources,
    };
  }

  /**
   * Get a single user by ID in SCIM format.
   */
  async getUser(workspaceId: string, userId: string): Promise<ScimUserResource> {
    const member = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId },
      relations: ['user'],
    });

    if (!member || !member.user) {
      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '404',
          detail: 'User not found',
        } as ScimErrorResponse,
        HttpStatus.NOT_FOUND,
      );
    }

    return this.toScimUserResource(member.user, member, workspaceId, '');
  }

  /**
   * Create a user via SCIM.
   */
  async createUser(
    workspaceId: string,
    scimRequest: ScimCreateUserRequest,
    scimConfig: ScimConfiguration,
    ipAddress?: string,
  ): Promise<ScimUserResource> {
    // Extract email from userName (SCIM spec: userName is the primary identifier)
    const email = (scimRequest.userName || '').toLowerCase().trim();

    if (!email) {
      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '400',
          scimType: SCIM_CONSTANTS.ERROR_TYPES.INVALID_VALUE,
          detail: 'userName is required',
        } as ScimErrorResponse,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check for existing user
    const existingUser = await this.userRepository.findOne({ where: { email } });

    if (existingUser) {
      // Check if already in workspace
      const existingMember = await this.workspaceMemberRepository.findOne({
        where: { workspaceId, userId: existingUser.id },
      });

      if (existingMember) {
        throw new HttpException(
          {
            schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
            status: '409',
            scimType: SCIM_CONSTANTS.ERROR_TYPES.UNIQUENESS,
            detail: 'User already exists in this workspace',
          } as ScimErrorResponse,
          HttpStatus.CONFLICT,
        );
      }

      // Check if suspended and auto_reactivate
      if (existingUser.suspendedAt && scimConfig.autoReactivate) {
        existingUser.suspendedAt = null;
        existingUser.suspensionReason = null;
      }

      // Update external ID
      if (scimRequest.externalId) {
        existingUser.scimExternalId = scimRequest.externalId;
      }

      // Update profile data
      this.updateProfileFromScim(existingUser, scimRequest);
      await this.userRepository.save(existingUser);

      // Add to workspace
      const member = this.workspaceMemberRepository.create({
        workspaceId,
        userId: existingUser.id,
        role: this.resolveWorkspaceRole(scimConfig.defaultRole),
      });
      await this.workspaceMemberRepository.save(member);

      // Log sync
      void this.scimSyncLogService.log({
        workspaceId,
        operation: ScimOperation.CREATE_USER,
        resourceType: ScimResourceType.USER,
        resourceId: existingUser.id,
        externalId: scimRequest.externalId,
        status: ScimSyncStatus.SUCCESS,
        requestBody: this.sanitizeRequest(scimRequest as unknown as Record<string, unknown>),
        ipAddress,
      });

      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.SCIM_USER_CREATED,
        targetUserId: existingUser.id,
        ipAddress,
        details: { email, action: 'linked_existing' },
      });

      return this.toScimUserResource(existingUser, member, workspaceId, '');
    }

    // Create new user
    let savedUser: User;
    let savedMember: WorkspaceMember;
    try {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      const profileData: Record<string, unknown> = {};
      if (scimRequest.name?.givenName) profileData.firstName = scimRequest.name.givenName;
      if (scimRequest.name?.familyName) profileData.lastName = scimRequest.name.familyName;
      if (scimRequest.displayName) profileData.displayName = scimRequest.displayName;
      if (scimRequest.title) profileData.jobTitle = scimRequest.title;
      if (scimRequest.department) profileData.department = scimRequest.department;

      const user = this.userRepository.create({
        email,
        passwordHash,
        twoFactorEnabled: false,
        scimExternalId: scimRequest.externalId || null,
        ssoProfileData: Object.keys(profileData).length > 0 ? profileData : null,
      });
      savedUser = await this.userRepository.save(user);

      // Create workspace membership
      const member = this.workspaceMemberRepository.create({
        workspaceId,
        userId: savedUser.id,
        role: this.resolveWorkspaceRole(scimConfig.defaultRole),
      });
      savedMember = await this.workspaceMemberRepository.save(member);
    } catch (error) {
      this.logger.error(`Failed to create SCIM user: ${email}`, error);

      void this.scimSyncLogService.log({
        workspaceId,
        operation: ScimOperation.CREATE_USER,
        resourceType: ScimResourceType.USER,
        externalId: scimRequest.externalId,
        status: ScimSyncStatus.FAILURE,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        requestBody: this.sanitizeRequest(scimRequest as unknown as Record<string, unknown>),
        ipAddress,
      });

      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '500',
          detail: 'Failed to create user',
        } as ScimErrorResponse,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Log sync
    void this.scimSyncLogService.log({
      workspaceId,
      operation: ScimOperation.CREATE_USER,
      resourceType: ScimResourceType.USER,
      resourceId: savedUser.id,
      externalId: scimRequest.externalId,
      status: ScimSyncStatus.SUCCESS,
      requestBody: this.sanitizeRequest(scimRequest as unknown as Record<string, unknown>),
      ipAddress,
    });

    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SCIM_USER_CREATED,
      targetUserId: savedUser.id,
      ipAddress,
      details: { email, action: 'created_new' },
    });

    return this.toScimUserResource(savedUser, savedMember, workspaceId, '');
  }

  /**
   * Replace (PUT) a user via SCIM.
   */
  async replaceUser(
    workspaceId: string,
    userId: string,
    scimRequest: ScimCreateUserRequest,
    scimConfig: ScimConfiguration,
    ipAddress?: string,
  ): Promise<ScimUserResource> {
    const member = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId },
      relations: ['user'],
    });

    if (!member || !member.user) {
      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '404',
          detail: 'User not found',
        } as ScimErrorResponse,
        HttpStatus.NOT_FOUND,
      );
    }

    const user = member.user;

    // Update attributes
    if (scimRequest.externalId !== undefined) {
      user.scimExternalId = scimRequest.externalId || null;
    }

    this.updateProfileFromScim(user, scimRequest);

    // Handle active status
    if (scimRequest.active === false && !user.suspendedAt) {
      user.suspendedAt = new Date();
      user.suspensionReason = 'Deactivated via SCIM';

      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.SCIM_USER_DEACTIVATED,
        targetUserId: user.id,
        ipAddress,
        details: { email: user.email },
      });

      void this.scimSyncLogService.log({
        workspaceId,
        operation: ScimOperation.DEACTIVATE_USER,
        resourceType: ScimResourceType.USER,
        resourceId: user.id,
        status: ScimSyncStatus.SUCCESS,
        ipAddress,
      });
    } else if (scimRequest.active === true && user.suspendedAt && scimConfig.autoReactivate) {
      user.suspendedAt = null;
      user.suspensionReason = null;

      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.SCIM_USER_REACTIVATED,
        targetUserId: user.id,
        ipAddress,
        details: { email: user.email },
      });

      void this.scimSyncLogService.log({
        workspaceId,
        operation: ScimOperation.REACTIVATE_USER,
        resourceType: ScimResourceType.USER,
        resourceId: user.id,
        status: ScimSyncStatus.SUCCESS,
        ipAddress,
      });
    }

    await this.userRepository.save(user);

    // Log update sync event
    void this.scimSyncLogService.log({
      workspaceId,
      operation: ScimOperation.UPDATE_USER,
      resourceType: ScimResourceType.USER,
      resourceId: user.id,
      externalId: user.scimExternalId || undefined,
      status: ScimSyncStatus.SUCCESS,
      requestBody: this.sanitizeRequest(scimRequest as unknown as Record<string, unknown>),
      ipAddress,
    });

    return this.toScimUserResource(user, member, workspaceId, '');
  }

  /**
   * Patch a user via SCIM.
   */
  async patchUser(
    workspaceId: string,
    userId: string,
    patchRequest: ScimPatchRequest,
    scimConfig: ScimConfiguration,
    ipAddress?: string,
  ): Promise<ScimUserResource> {
    const member = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId },
      relations: ['user'],
    });

    if (!member || !member.user) {
      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '404',
          detail: 'User not found',
        } as ScimErrorResponse,
        HttpStatus.NOT_FOUND,
      );
    }

    const user = member.user;
    const profileData = { ...(user.ssoProfileData || {}) };

    // Process each operation
    for (const op of patchRequest.Operations || []) {
      const path = op.path || '';
      const value = op.value;

      switch (op.op) {
        case 'replace':
        case 'add': {
          if (path === 'active' || (!path && typeof value === 'object' && value !== null && 'active' in (value as Record<string, unknown>))) {
            const activeValue = path === 'active' ? value : (value as Record<string, unknown>).active;
            if (activeValue === false && !user.suspendedAt) {
              user.suspendedAt = new Date();
              user.suspensionReason = 'Deactivated via SCIM PATCH';

              void this.ssoAuditService.logEvent({
                workspaceId,
                eventType: SsoAuditEventType.SCIM_USER_DEACTIVATED,
                targetUserId: user.id,
                ipAddress,
              });
            } else if (activeValue === true && user.suspendedAt && scimConfig.autoReactivate) {
              user.suspendedAt = null;
              user.suspensionReason = null;

              void this.ssoAuditService.logEvent({
                workspaceId,
                eventType: SsoAuditEventType.SCIM_USER_REACTIVATED,
                targetUserId: user.id,
                ipAddress,
              });
            }
          } else if (path === 'displayName') {
            profileData.displayName = value;
          } else if (path === 'name.givenName') {
            profileData.firstName = value;
          } else if (path === 'name.familyName') {
            profileData.lastName = value;
          } else if (path === 'externalId') {
            user.scimExternalId = value as string || null;
          } else if (path === 'title') {
            profileData.jobTitle = value;
          } else if (path === 'department') {
            profileData.department = value;
          } else if (path === 'userName') {
            // userName maps to email - check for uniqueness before allowing change
            if (typeof value === 'string') {
              const newEmail = value.toLowerCase().trim();
              if (newEmail && newEmail !== user.email) {
                const existingUser = await this.userRepository.findOne({ where: { email: newEmail } });
                if (existingUser && existingUser.id !== user.id) {
                  throw new HttpException(
                    {
                      schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
                      status: '409',
                      scimType: SCIM_CONSTANTS.ERROR_TYPES.UNIQUENESS,
                      detail: `User with email ${newEmail} already exists`,
                    } as ScimErrorResponse,
                    HttpStatus.CONFLICT,
                  );
                }
                user.email = newEmail;
              }
            }
          }
          break;
        }
        case 'remove': {
          if (path === 'title') {
            delete profileData.jobTitle;
          } else if (path === 'department') {
            delete profileData.department;
          } else if (path === 'displayName') {
            delete profileData.displayName;
          } else if (path === 'externalId') {
            user.scimExternalId = null;
          }
          break;
        }
      }
    }

    user.ssoProfileData = Object.keys(profileData).length > 0 ? profileData : null;
    await this.userRepository.save(user);

    // Log sync event
    void this.scimSyncLogService.log({
      workspaceId,
      operation: ScimOperation.UPDATE_USER,
      resourceType: ScimResourceType.USER,
      resourceId: user.id,
      externalId: user.scimExternalId || undefined,
      status: ScimSyncStatus.SUCCESS,
      ipAddress,
    });

    return this.toScimUserResource(user, member, workspaceId, '');
  }

  /**
   * Delete (deactivate) a user via SCIM.
   */
  async deleteUser(
    workspaceId: string,
    userId: string,
    scimConfig: ScimConfiguration,
    ipAddress?: string,
  ): Promise<void> {
    const member = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId },
      relations: ['user'],
    });

    if (!member || !member.user) {
      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '404',
          detail: 'User not found',
        } as ScimErrorResponse,
        HttpStatus.NOT_FOUND,
      );
    }

    const user = member.user;

    // Soft delete: set suspendedAt
    user.suspendedAt = new Date();
    user.suspensionReason = 'Deactivated via SCIM DELETE';
    await this.userRepository.save(user);

    // Remove workspace membership
    if (scimConfig.autoDeactivate) {
      await this.workspaceMemberRepository.remove(member);
    }

    // Log sync event
    void this.scimSyncLogService.log({
      workspaceId,
      operation: ScimOperation.DEACTIVATE_USER,
      resourceType: ScimResourceType.USER,
      resourceId: user.id,
      externalId: user.scimExternalId || undefined,
      status: ScimSyncStatus.SUCCESS,
      ipAddress,
    });

    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SCIM_USER_DEACTIVATED,
      targetUserId: user.id,
      ipAddress,
      details: { email: user.email, action: 'scim_delete' },
    });
  }

  /**
   * Convert internal User + WorkspaceMember to SCIM UserResource format.
   */
  toScimUserResource(
    user: User,
    member: WorkspaceMember,
    workspaceId: string,
    baseUrl: string,
  ): ScimUserResource {
    const profileData = user.ssoProfileData || {};

    return {
      schemas: [SCIM_CONSTANTS.SCHEMAS.USER],
      id: user.id,
      externalId: user.scimExternalId || undefined,
      userName: user.email,
      name: {
        givenName: (profileData.firstName as string) || undefined,
        familyName: (profileData.lastName as string) || undefined,
        formatted: [profileData.firstName, profileData.lastName].filter(Boolean).join(' ') || undefined,
      },
      displayName: (profileData.displayName as string) || undefined,
      active: !user.suspendedAt,
      emails: [
        {
          value: user.email,
          type: 'work',
          primary: true,
        },
      ],
      title: (profileData.jobTitle as string) || undefined,
      department: (profileData.department as string) || undefined,
      meta: {
        resourceType: 'User',
        created: user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt),
        lastModified: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : String(user.updatedAt),
        location: `${baseUrl}/scim/v2/Users/${user.id}`,
      },
    };
  }

  /**
   * Parse a SCIM filter string into structured filter conditions.
   * Supports: attribute op value (e.g., 'userName eq "john@acme.com"')
   * Supports: and logical operator
   */
  parseFilter(filter: string): ParsedFilter[] {
    const filters: ParsedFilter[] = [];

    // Split by ' and ' (case-insensitive)
    const parts = filter.split(/\s+and\s+/i);

    for (const part of parts) {
      const trimmed = part.trim();
      // Match: attribute operator "value" or attribute operator value
      const match = trimmed.match(/^(\S+)\s+(eq|ne|co|sw|ew|gt|ge|lt|le)\s+(?:"([^"]*)"|(true|false|\S+))$/i);

      if (!match) {
        throw new Error(`Invalid filter syntax: ${trimmed}`);
      }

      filters.push({
        attribute: match[1],
        operator: match[2].toLowerCase(),
        value: match[3] !== undefined ? match[3] : match[4],
      });
    }

    return filters;
  }

  /**
   * Apply a parsed filter condition to the query builder.
   */
  private applyUserFilter(
    qb: ReturnType<Repository<WorkspaceMember>['createQueryBuilder']>,
    filter: ParsedFilter,
    index: number,
  ): void {
    const paramName = `filterValue${index}`;

    switch (filter.attribute) {
      case 'userName':
      case 'email': {
        this.applyStringFilter(qb, 'user.email', filter.operator, filter.value, paramName);
        break;
      }
      case 'externalId': {
        this.applyStringFilter(qb, 'user.scimExternalId', filter.operator, filter.value, paramName);
        break;
      }
      case 'displayName': {
        // displayName is in ssoProfileData JSONB
        if (filter.operator === 'eq') {
          qb.andWhere(`user.ssoProfileData->>'displayName' = :${paramName}`, { [paramName]: filter.value });
        } else if (filter.operator === 'co') {
          qb.andWhere(`user.ssoProfileData->>'displayName' ILIKE :${paramName}`, { [paramName]: `%${filter.value}%` });
        } else if (filter.operator === 'sw') {
          qb.andWhere(`user.ssoProfileData->>'displayName' ILIKE :${paramName}`, { [paramName]: `${filter.value}%` });
        }
        break;
      }
      case 'active': {
        const isActive = filter.value === 'true';
        if (filter.operator === 'eq') {
          if (isActive) {
            qb.andWhere('user.suspendedAt IS NULL');
          } else {
            qb.andWhere('user.suspendedAt IS NOT NULL');
          }
        }
        break;
      }
    }
  }

  /**
   * Apply string comparison filter.
   */
  private applyStringFilter(
    qb: ReturnType<Repository<WorkspaceMember>['createQueryBuilder']>,
    column: string,
    operator: string,
    value: string,
    paramName: string,
  ): void {
    switch (operator) {
      case 'eq':
        qb.andWhere(`${column} = :${paramName}`, { [paramName]: value });
        break;
      case 'ne':
        qb.andWhere(`${column} != :${paramName}`, { [paramName]: value });
        break;
      case 'co':
        qb.andWhere(`${column} ILIKE :${paramName}`, { [paramName]: `%${value}%` });
        break;
      case 'sw':
        qb.andWhere(`${column} ILIKE :${paramName}`, { [paramName]: `${value}%` });
        break;
      case 'ew':
        qb.andWhere(`${column} ILIKE :${paramName}`, { [paramName]: `%${value}` });
        break;
    }
  }

  /**
   * Update user profile data from SCIM request.
   */
  private updateProfileFromScim(user: User, scimRequest: ScimCreateUserRequest): void {
    const profileData: Record<string, unknown> = { ...(user.ssoProfileData || {}) };

    if (scimRequest.name?.givenName !== undefined) profileData.firstName = scimRequest.name.givenName;
    if (scimRequest.name?.familyName !== undefined) profileData.lastName = scimRequest.name.familyName;
    if (scimRequest.displayName !== undefined) profileData.displayName = scimRequest.displayName;
    if (scimRequest.title !== undefined) profileData.jobTitle = scimRequest.title;
    if (scimRequest.department !== undefined) profileData.department = scimRequest.department;

    user.ssoProfileData = Object.keys(profileData).length > 0 ? profileData : null;
  }

  /**
   * Resolve and validate the workspace role from SCIM config.
   * Never allows 'owner' role assignment via SCIM. Falls back to 'developer'.
   */
  private resolveWorkspaceRole(configRole: string | undefined): WorkspaceRole {
    const validRoles: readonly string[] = SCIM_CONSTANTS.VALID_ROLES;
    const role = configRole || 'developer';
    if (!validRoles.includes(role)) {
      this.logger.warn(`Invalid SCIM defaultRole "${role}", falling back to "developer"`);
      return WorkspaceRole.DEVELOPER;
    }
    return role as WorkspaceRole;
  }

  /**
   * Sanitize request for logging (remove sensitive fields).
   */
  private sanitizeRequest(body: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...body };
    delete sanitized.password;
    return sanitized;
  }
}
