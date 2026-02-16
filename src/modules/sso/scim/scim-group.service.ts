import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScimGroup } from '../../../database/entities/scim-group.entity';
import { ScimGroupMembership } from '../../../database/entities/scim-group-membership.entity';
import { User } from '../../../database/entities/user.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { ScimOperation, ScimResourceType, ScimSyncStatus } from '../../../database/entities/scim-sync-log.entity';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { SCIM_CONSTANTS } from '../constants/scim.constants';
import { ScimSyncLogService } from './scim-sync-log.service';
import {
  ScimGroupResource,
  ScimGroupMember,
  ScimListResponse,
  ScimPatchRequest,
  ScimErrorResponse,
} from '../dto/scim.dto';

@Injectable()
export class ScimGroupService {
  private readonly logger = new Logger(ScimGroupService.name);

  constructor(
    @InjectRepository(ScimGroup)
    private readonly scimGroupRepository: Repository<ScimGroup>,
    @InjectRepository(ScimGroupMembership)
    private readonly scimGroupMembershipRepository: Repository<ScimGroupMembership>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    private readonly ssoAuditService: SsoAuditService,
    private readonly scimSyncLogService: ScimSyncLogService,
  ) {}

  /**
   * List groups for a workspace with SCIM filtering and pagination.
   */
  async listGroups(
    workspaceId: string,
    filter?: string,
    startIndex?: number,
    count?: number,
  ): Promise<ScimListResponse<ScimGroupResource>> {
    const effectiveStartIndex = Math.max(1, startIndex || SCIM_CONSTANTS.DEFAULT_START_INDEX);
    const effectiveCount = Math.min(
      SCIM_CONSTANTS.MAX_PAGE_SIZE,
      Math.max(1, count || SCIM_CONSTANTS.DEFAULT_PAGE_SIZE),
    );
    const skip = effectiveStartIndex - 1;

    const qb = this.scimGroupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.memberships', 'membership')
      .leftJoin('membership.user', 'user')
      .addSelect(['user.id', 'user.email'])
      .where('group.workspaceId = :workspaceId', { workspaceId });

    // Apply filter
    if (filter) {
      const match = filter.match(/^(\S+)\s+(eq|co|sw)\s+(?:"([^"]*)"|([\S]+))$/i);
      if (match) {
        const attr = match[1];
        const op = match[2].toLowerCase();
        const val = match[3] !== undefined ? match[3] : match[4];

        if (attr === 'displayName') {
          if (op === 'eq') {
            qb.andWhere('group.displayName = :filterVal', { filterVal: val });
          } else if (op === 'co') {
            qb.andWhere('group.displayName ILIKE :filterVal', { filterVal: `%${val}%` });
          } else if (op === 'sw') {
            qb.andWhere('group.displayName ILIKE :filterVal', { filterVal: `${val}%` });
          }
        } else if (attr === 'externalId') {
          if (op === 'eq') {
            qb.andWhere('group.externalId = :filterVal', { filterVal: val });
          }
        }
      }
    }

    const totalResults = await qb.getCount();

    qb.skip(skip).take(effectiveCount);
    qb.orderBy('group.createdAt', 'ASC');

    const groups = await qb.getMany();

    const resources = groups.map((g) => this.toScimGroupResource(
      g,
      (g.memberships || []).map((m) => ({
        userId: m.userId,
        email: m.user?.email || '',
      })),
      '',
    ));

    return {
      schemas: [SCIM_CONSTANTS.SCHEMAS.LIST_RESPONSE],
      totalResults,
      startIndex: effectiveStartIndex,
      itemsPerPage: resources.length,
      Resources: resources,
    };
  }

  /**
   * Get a single group by ID in SCIM format.
   */
  async getGroup(workspaceId: string, groupId: string): Promise<ScimGroupResource> {
    const group = await this.scimGroupRepository.findOne({
      where: { id: groupId, workspaceId },
      relations: ['memberships', 'memberships.user'],
    });

    if (!group) {
      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '404',
          detail: 'Group not found',
        } as ScimErrorResponse,
        HttpStatus.NOT_FOUND,
      );
    }

    const members = (group.memberships || []).map((m) => ({
      userId: m.userId,
      email: m.user?.email || '',
    }));

    return this.toScimGroupResource(group, members, '');
  }

  /**
   * Create a group via SCIM.
   */
  async createGroup(
    workspaceId: string,
    body: { schemas: string[]; displayName: string; externalId?: string; members?: ScimGroupMember[] },
    ipAddress?: string,
  ): Promise<ScimGroupResource> {
    if (!body.displayName) {
      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '400',
          scimType: SCIM_CONSTANTS.ERROR_TYPES.INVALID_VALUE,
          detail: 'displayName is required',
        } as ScimErrorResponse,
        HttpStatus.BAD_REQUEST,
      );
    }

    const externalId = body.externalId || body.displayName;

    // Check for duplicate
    const existing = await this.scimGroupRepository.findOne({
      where: { workspaceId, externalId },
    });

    if (existing) {
      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '409',
          scimType: SCIM_CONSTANTS.ERROR_TYPES.UNIQUENESS,
          detail: 'Group with this externalId already exists in workspace',
        } as ScimErrorResponse,
        HttpStatus.CONFLICT,
      );
    }

    const group = this.scimGroupRepository.create({
      workspaceId,
      externalId,
      displayName: body.displayName,
      metadata: {},
    });
    const savedGroup = await this.scimGroupRepository.save(group);

    // Process initial members
    const memberResults: Array<{ userId: string; email: string }> = [];
    if (body.members && body.members.length > 0) {
      for (const memberRef of body.members) {
        try {
          const user = await this.userRepository.findOne({ where: { id: memberRef.value } });
          if (user) {
            const membership = this.scimGroupMembershipRepository.create({
              groupId: savedGroup.id,
              userId: user.id,
            });
            await this.scimGroupMembershipRepository.save(membership);
            memberResults.push({ userId: user.id, email: user.email });
          }
        } catch {
          this.logger.warn(`Failed to add member ${memberRef.value} to group ${savedGroup.id}`);
        }
      }
    }

    // Log sync
    void this.scimSyncLogService.log({
      workspaceId,
      operation: ScimOperation.CREATE_GROUP,
      resourceType: ScimResourceType.GROUP,
      resourceId: savedGroup.id,
      externalId,
      status: ScimSyncStatus.SUCCESS,
      ipAddress,
    });

    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SCIM_GROUP_CREATED,
      details: { groupId: savedGroup.id, displayName: body.displayName, externalId },
    });

    return this.toScimGroupResource(savedGroup, memberResults, '');
  }

  /**
   * Patch a group via SCIM.
   */
  async patchGroup(
    workspaceId: string,
    groupId: string,
    patchRequest: ScimPatchRequest,
    ipAddress?: string,
  ): Promise<ScimGroupResource> {
    const group = await this.scimGroupRepository.findOne({
      where: { id: groupId, workspaceId },
      relations: ['memberships', 'memberships.user'],
    });

    if (!group) {
      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '404',
          detail: 'Group not found',
        } as ScimErrorResponse,
        HttpStatus.NOT_FOUND,
      );
    }

    for (const op of patchRequest.Operations || []) {
      switch (op.op) {
        case 'replace': {
          if (op.path === 'displayName' && typeof op.value === 'string') {
            group.displayName = op.value;
            await this.scimGroupRepository.save(group);
          }
          break;
        }
        case 'add': {
          if (op.path === 'members' && Array.isArray(op.value)) {
            for (const memberRef of op.value as ScimGroupMember[]) {
              try {
                const user = await this.userRepository.findOne({ where: { id: memberRef.value } });
                if (user) {
                  // Check if already a member
                  const existing = await this.scimGroupMembershipRepository.findOne({
                    where: { groupId: group.id, userId: user.id },
                  });
                  if (!existing) {
                    const membership = this.scimGroupMembershipRepository.create({
                      groupId: group.id,
                      userId: user.id,
                    });
                    await this.scimGroupMembershipRepository.save(membership);
                  }
                }
              } catch {
                this.logger.warn(`Failed to add member ${memberRef.value} to group ${group.id}`);
              }
            }
          }
          break;
        }
        case 'remove': {
          if (op.path && op.path.startsWith('members')) {
            // Parse members[value eq "userId"]
            const match = op.path.match(/members\[value\s+eq\s+"([^"]+)"\]/);
            if (match) {
              const memberUserId = match[1];
              // Validate UUID format before querying
              if (this.isValidUuid(memberUserId)) {
                await this.scimGroupMembershipRepository.delete({
                  groupId: group.id,
                  userId: memberUserId,
                });
              } else {
                this.logger.warn(`Invalid UUID in SCIM PATCH remove path: ${memberUserId}`);
              }
            } else if (Array.isArray(op.value)) {
              // Alternative: remove by value array
              for (const memberRef of op.value as ScimGroupMember[]) {
                if (this.isValidUuid(memberRef.value)) {
                  await this.scimGroupMembershipRepository.delete({
                    groupId: group.id,
                    userId: memberRef.value,
                  });
                }
              }
            }
          }
          break;
        }
      }
    }

    // Re-fetch with memberships
    const updated = await this.scimGroupRepository.findOne({
      where: { id: groupId, workspaceId },
      relations: ['memberships', 'memberships.user'],
    });

    const members = (updated?.memberships || []).map((m) => ({
      userId: m.userId,
      email: m.user?.email || '',
    }));

    // Log sync
    void this.scimSyncLogService.log({
      workspaceId,
      operation: ScimOperation.UPDATE_GROUP,
      resourceType: ScimResourceType.GROUP,
      resourceId: group.id,
      externalId: group.externalId,
      status: ScimSyncStatus.SUCCESS,
      ipAddress,
    });

    return this.toScimGroupResource(updated || group, members, '');
  }

  /**
   * Delete a group via SCIM.
   */
  async deleteGroup(
    workspaceId: string,
    groupId: string,
    ipAddress?: string,
  ): Promise<void> {
    const group = await this.scimGroupRepository.findOne({
      where: { id: groupId, workspaceId },
    });

    if (!group) {
      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '404',
          detail: 'Group not found',
        } as ScimErrorResponse,
        HttpStatus.NOT_FOUND,
      );
    }

    await this.scimGroupRepository.remove(group);

    // Log sync
    void this.scimSyncLogService.log({
      workspaceId,
      operation: ScimOperation.DELETE_GROUP,
      resourceType: ScimResourceType.GROUP,
      resourceId: groupId,
      externalId: group.externalId,
      status: ScimSyncStatus.SUCCESS,
      ipAddress,
    });

    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SCIM_GROUP_DELETED,
      details: { groupId, displayName: group.displayName },
    });
  }

  /**
   * Validate UUID format to prevent invalid data in queries.
   */
  private isValidUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  /**
   * Convert internal ScimGroup to SCIM GroupResource format.
   */
  toScimGroupResource(
    group: ScimGroup,
    members: Array<{ userId: string; email: string }>,
    baseUrl: string,
  ): ScimGroupResource {
    return {
      schemas: [SCIM_CONSTANTS.SCHEMAS.GROUP],
      id: group.id,
      externalId: group.externalId || undefined,
      displayName: group.displayName,
      members: members.map((m) => ({
        value: m.userId,
        display: m.email,
        $ref: `${baseUrl}/scim/v2/Users/${m.userId}`,
      })),
      meta: {
        resourceType: 'Group',
        created: group.createdAt instanceof Date ? group.createdAt.toISOString() : String(group.createdAt),
        lastModified: group.updatedAt instanceof Date ? group.updatedAt.toISOString() : String(group.updatedAt),
        location: `${baseUrl}/scim/v2/Groups/${group.id}`,
      },
    };
  }
}
