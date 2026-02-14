import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatRoom } from '../../../database/entities/chat-room.entity';
import { ChatRoomMember, ChatRoomMemberRole } from '../../../database/entities/chat-room-member.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { UserRoomRestriction, RestrictionType } from '../../../database/entities/user-room-restriction.entity';

/**
 * Chat permission types
 * Story 9.10: Multi-User Chat
 */
export interface ChatPermissions {
  // Room management
  canCreateRoom: boolean;
  canDeleteRoom: boolean;
  canEditRoomSettings: boolean;

  // Membership management
  canInviteUsers: boolean;
  canRemoveUsers: boolean;
  canPromoteMembers: boolean;

  // Messaging
  canSendMessages: boolean;
  canEditOwnMessages: boolean;
  canDeleteOwnMessages: boolean;
  canDeleteAnyMessage: boolean;

  // Special actions
  canMentionAll: boolean;
  canPinMessages: boolean;
  canStartThread: boolean;
}

/**
 * Permission mappings by workspace role
 */
const WORKSPACE_PERMISSIONS: Record<WorkspaceRole, ChatPermissions> = {
  [WorkspaceRole.OWNER]: {
    canCreateRoom: true,
    canDeleteRoom: true,
    canEditRoomSettings: true,
    canInviteUsers: true,
    canRemoveUsers: true,
    canPromoteMembers: true,
    canSendMessages: true,
    canEditOwnMessages: true,
    canDeleteOwnMessages: true,
    canDeleteAnyMessage: true,
    canMentionAll: true,
    canPinMessages: true,
    canStartThread: true,
  },
  [WorkspaceRole.ADMIN]: {
    canCreateRoom: true,
    canDeleteRoom: false,
    canEditRoomSettings: true,
    canInviteUsers: true,
    canRemoveUsers: true,
    canPromoteMembers: false,
    canSendMessages: true,
    canEditOwnMessages: true,
    canDeleteOwnMessages: true,
    canDeleteAnyMessage: true,
    canMentionAll: true,
    canPinMessages: true,
    canStartThread: true,
  },
  [WorkspaceRole.DEVELOPER]: {
    canCreateRoom: true,
    canDeleteRoom: false,
    canEditRoomSettings: false,
    canInviteUsers: true,
    canRemoveUsers: false,
    canPromoteMembers: false,
    canSendMessages: true,
    canEditOwnMessages: true,
    canDeleteOwnMessages: true,
    canDeleteAnyMessage: false,
    canMentionAll: false,
    canPinMessages: false,
    canStartThread: true,
  },
  [WorkspaceRole.VIEWER]: {
    canCreateRoom: false,
    canDeleteRoom: false,
    canEditRoomSettings: false,
    canInviteUsers: false,
    canRemoveUsers: false,
    canPromoteMembers: false,
    canSendMessages: false,
    canEditOwnMessages: false,
    canDeleteOwnMessages: false,
    canDeleteAnyMessage: false,
    canMentionAll: false,
    canPinMessages: false,
    canStartThread: false,
  },
};

/**
 * Room role permission overrides
 */
const ROOM_ROLE_OVERRIDES: Record<ChatRoomMemberRole, Partial<ChatPermissions>> = {
  [ChatRoomMemberRole.OWNER]: {
    canDeleteRoom: true,
    canEditRoomSettings: true,
    canRemoveUsers: true,
    canPromoteMembers: true,
    canDeleteAnyMessage: true,
    canMentionAll: true,
    canPinMessages: true,
  },
  [ChatRoomMemberRole.ADMIN]: {
    canEditRoomSettings: true,
    canRemoveUsers: true,
    canDeleteAnyMessage: true,
    canMentionAll: true,
    canPinMessages: true,
  },
  [ChatRoomMemberRole.MEMBER]: {
    canSendMessages: true,
    canEditOwnMessages: true,
    canDeleteOwnMessages: true,
    canStartThread: true,
  },
  [ChatRoomMemberRole.READONLY]: {
    canSendMessages: false,
    canEditOwnMessages: false,
    canDeleteOwnMessages: false,
    canStartThread: false,
  },
};

/**
 * Decorator key for required permission
 */
export const CHAT_PERMISSION_KEY = 'chatPermission';

/**
 * Decorator to require a specific chat permission
 */
export const RequireChatPermission = (permission: keyof ChatPermissions) =>
  (target: any, key: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(CHAT_PERMISSION_KEY, permission, descriptor.value);
    return descriptor;
  };

/**
 * ChatPermissionsGuard
 * Story 9.10: Multi-User Chat
 *
 * Guards routes based on chat permissions
 */
@Injectable()
export class ChatPermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(ChatRoom)
    private readonly roomRepository: Repository<ChatRoom>,
    @InjectRepository(ChatRoomMember)
    private readonly memberRepository: Repository<ChatRoomMember>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    @InjectRepository(UserRoomRestriction)
    private readonly restrictionRepository: Repository<UserRoomRestriction>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<keyof ChatPermissions>(
      CHAT_PERMISSION_KEY,
      context.getHandler(),
    );

    if (!requiredPermission) {
      return true; // No permission required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const roomId = request.params.roomId || request.params.id;
    const workspaceId = request.params.workspaceId;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Get permissions for this user
    const permissions = await this.getPermissions(
      user.sub || user.id,
      workspaceId,
      roomId,
    );

    // Check the specific permission
    if (!permissions[requiredPermission]) {
      throw new ForbiddenException(`You do not have permission to: ${requiredPermission}`);
    }

    // Attach permissions to request for controller use
    request.chatPermissions = permissions;

    return true;
  }

  /**
   * Get computed permissions for a user
   */
  async getPermissions(
    userId: string,
    workspaceId?: string,
    roomId?: string,
  ): Promise<ChatPermissions> {
    // Start with default (no permissions)
    let permissions: ChatPermissions = {
      canCreateRoom: false,
      canDeleteRoom: false,
      canEditRoomSettings: false,
      canInviteUsers: false,
      canRemoveUsers: false,
      canPromoteMembers: false,
      canSendMessages: false,
      canEditOwnMessages: false,
      canDeleteOwnMessages: false,
      canDeleteAnyMessage: false,
      canMentionAll: false,
      canPinMessages: false,
      canStartThread: false,
    };

    // Get workspace role
    if (workspaceId) {
      const workspaceMember = await this.workspaceMemberRepository.findOne({
        where: { workspaceId, userId },
      });

      if (workspaceMember) {
        permissions = { ...WORKSPACE_PERMISSIONS[workspaceMember.role] };
      }
    }

    // Apply room-level overrides
    if (roomId) {
      const room = await this.roomRepository.findOne({ where: { id: roomId } });
      if (!room) {
        throw new NotFoundException('Room not found');
      }

      // Use room's workspace if not provided
      const effectiveWorkspaceId = workspaceId || room.workspaceId;

      // Check if user is banned
      const ban = await this.restrictionRepository.findOne({
        where: { roomId, userId, type: RestrictionType.BAN },
      });

      if (ban) {
        // Banned users have no permissions
        return {
          ...permissions,
          canSendMessages: false,
          canEditOwnMessages: false,
          canDeleteOwnMessages: false,
          canInviteUsers: false,
          canStartThread: false,
        };
      }

      // Check if user is muted
      const mute = await this.restrictionRepository.findOne({
        where: { roomId, userId, type: RestrictionType.MUTE },
      });

      if (mute && (!mute.expiresAt || mute.expiresAt > new Date())) {
        permissions.canSendMessages = false;
      }

      // Get room membership
      const roomMember = await this.memberRepository.findOne({
        where: { roomId, userId },
      });

      if (roomMember) {
        // Apply room role overrides - but READONLY should always restrict, not grant
        const roleOverrides = ROOM_ROLE_OVERRIDES[roomMember.role];
        if (roomMember.role === ChatRoomMemberRole.READONLY) {
          // READONLY explicitly denies these permissions, don't merge - override
          permissions.canSendMessages = false;
          permissions.canEditOwnMessages = false;
          permissions.canDeleteOwnMessages = false;
          permissions.canStartThread = false;
        } else {
          // Other roles can grant additional permissions
          permissions = { ...permissions, ...roleOverrides };
        }
      } else if (room.isPrivate) {
        // Non-members can't do anything in private rooms
        return {
          canCreateRoom: permissions.canCreateRoom,
          canDeleteRoom: false,
          canEditRoomSettings: false,
          canInviteUsers: false,
          canRemoveUsers: false,
          canPromoteMembers: false,
          canSendMessages: false,
          canEditOwnMessages: false,
          canDeleteOwnMessages: false,
          canDeleteAnyMessage: false,
          canMentionAll: false,
          canPinMessages: false,
          canStartThread: false,
        };
      }

      // Room locked check
      if (room.isLocked) {
        permissions.canSendMessages = false;
        permissions.canStartThread = false;
      }
    }

    return permissions;
  }
}

/**
 * Helper function to check permissions without guard
 */
export function checkPermission(
  permissions: ChatPermissions,
  action: keyof ChatPermissions,
): boolean {
  return permissions[action] === true;
}
