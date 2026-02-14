import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ChatRoom, ChatRoomType, ChatRoomSettings, DEFAULT_CHAT_ROOM_SETTINGS } from '../../../database/entities/chat-room.entity';
import { ChatRoomMember, ChatRoomMemberRole, ChatRoomMemberType } from '../../../database/entities/chat-room-member.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { CreateChatRoomDto, UpdateChatRoomDto, GetRoomsQueryDto } from '../dto/create-chat-room.dto';

/**
 * ChatRoomService
 * Story 9.10: Multi-User Chat
 *
 * Handles chat room CRUD operations and member management
 */
@Injectable()
export class ChatRoomService {
  private readonly logger = new Logger(ChatRoomService.name);

  constructor(
    @InjectRepository(ChatRoom)
    private readonly chatRoomRepository: Repository<ChatRoom>,
    @InjectRepository(ChatRoomMember)
    private readonly chatRoomMemberRepository: Repository<ChatRoomMember>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
  ) {}

  /**
   * Create a new chat room
   */
  async createRoom(
    workspaceId: string,
    userId: string,
    dto: CreateChatRoomDto,
  ): Promise<ChatRoom> {
    // Validate room type constraints
    if (dto.type === ChatRoomType.PROJECT && !dto.projectId) {
      throw new BadRequestException('Project ID is required for project-type rooms');
    }

    if (dto.type === ChatRoomType.WORKSPACE) {
      // Check if workspace channel already exists
      const existingWorkspaceRoom = await this.chatRoomRepository.findOne({
        where: {
          workspaceId,
          type: ChatRoomType.WORKSPACE,
          name: dto.name,
        },
      });
      if (existingWorkspaceRoom) {
        throw new ConflictException(`Workspace channel "${dto.name}" already exists`);
      }
    }

    // Merge settings with defaults
    const settings: ChatRoomSettings = {
      ...DEFAULT_CHAT_ROOM_SETTINGS,
      ...dto.settings,
    };

    // Create the room
    const room = this.chatRoomRepository.create({
      workspaceId,
      projectId: dto.projectId || null,
      name: dto.name,
      description: dto.description || null,
      type: dto.type,
      isPrivate: dto.isPrivate ?? false,
      createdById: userId,
      settings,
      memberCount: 1, // Creator is first member
    });

    await this.chatRoomRepository.save(room);

    // Add creator as owner
    const ownerMember = this.chatRoomMemberRepository.create({
      roomId: room.id,
      userId,
      memberType: ChatRoomMemberType.USER,
      role: ChatRoomMemberRole.OWNER,
    });
    await this.chatRoomMemberRepository.save(ownerMember);

    // Add initial members if provided
    if (dto.initialMemberIds && dto.initialMemberIds.length > 0) {
      await this.addMembers(room.id, dto.initialMemberIds, 'user', userId);
    }

    // Add initial agents if provided
    if (dto.initialAgentIds && dto.initialAgentIds.length > 0) {
      await this.addMembers(room.id, dto.initialAgentIds, 'agent', userId);
    }

    this.logger.log(`Chat room ${room.id} created by user ${userId} in workspace ${workspaceId}`);

    return room;
  }

  /**
   * Get a chat room by ID
   */
  async getRoom(roomId: string, userId: string): Promise<ChatRoom> {
    const room = await this.chatRoomRepository.findOne({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException(`Chat room ${roomId} not found`);
    }

    // Check if user has access to private rooms
    if (room.isPrivate) {
      const isMember = await this.isMember(roomId, userId);
      if (!isMember) {
        throw new ForbiddenException('You do not have access to this private room');
      }
    }

    return room;
  }

  /**
   * Get rooms for a workspace
   */
  async getRooms(
    workspaceId: string,
    userId: string,
    options: GetRoomsQueryDto = {},
  ): Promise<ChatRoom[]> {
    const { type, projectId, includePrivate = false, limit = 50, offset = 0 } = options;

    const queryBuilder = this.chatRoomRepository
      .createQueryBuilder('room')
      .where('room.workspaceId = :workspaceId', { workspaceId })
      .orderBy('room.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('room.createdAt', 'DESC');

    if (type) {
      queryBuilder.andWhere('room.type = :type', { type });
    }

    if (projectId) {
      queryBuilder.andWhere('room.projectId = :projectId', { projectId });
    }

    // Handle private rooms - only show if user is a member
    if (!includePrivate) {
      queryBuilder.andWhere('room.isPrivate = false');
    } else {
      // Include private rooms where user is a member
      queryBuilder.andWhere(
        `(room.isPrivate = false OR EXISTS (
          SELECT 1 FROM chat_room_members m
          WHERE m.room_id = room.id AND m.user_id = :userId
        ))`,
        { userId },
      );
    }

    queryBuilder.take(limit).skip(offset);

    return queryBuilder.getMany();
  }

  /**
   * Update a chat room
   */
  async updateRoom(
    roomId: string,
    userId: string,
    dto: UpdateChatRoomDto,
  ): Promise<ChatRoom> {
    const room = await this.getRoom(roomId, userId);

    // Check if user can edit settings
    const canEdit = await this.canManageRoom(roomId, userId);
    if (!canEdit) {
      throw new ForbiddenException('You do not have permission to edit this room');
    }

    // Update fields
    if (dto.name !== undefined) {
      room.name = dto.name;
    }
    if (dto.description !== undefined) {
      room.description = dto.description;
    }
    if (dto.isPrivate !== undefined) {
      room.isPrivate = dto.isPrivate;
    }
    if (dto.settings) {
      room.settings = { ...room.settings, ...dto.settings };
    }

    await this.chatRoomRepository.save(room);

    this.logger.log(`Chat room ${roomId} updated by user ${userId}`);

    return room;
  }

  /**
   * Delete a chat room
   */
  async deleteRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.getRoom(roomId, userId);

    // Only owner can delete
    const isOwner = await this.isOwner(roomId, userId);
    if (!isOwner) {
      throw new ForbiddenException('Only the room owner can delete this room');
    }

    await this.chatRoomRepository.remove(room);

    this.logger.log(`Chat room ${roomId} deleted by user ${userId}`);
  }

  /**
   * Archive a chat room (soft delete)
   */
  async archiveRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.getRoom(roomId, userId);

    const canManage = await this.canManageRoom(roomId, userId);
    if (!canManage) {
      throw new ForbiddenException('You do not have permission to archive this room');
    }

    // Lock the room instead of deleting
    room.isLocked = true;
    await this.chatRoomRepository.save(room);

    this.logger.log(`Chat room ${roomId} archived by user ${userId}`);
  }

  /**
   * Add members to a room
   */
  async addMembers(
    roomId: string,
    memberIds: string[],
    memberType: 'user' | 'agent',
    requesterId: string,
  ): Promise<void> {
    const room = await this.chatRoomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException(`Chat room ${roomId} not found`);
    }

    // Check if requester can invite
    const canInvite = await this.canInviteMembers(roomId, requesterId);
    if (!canInvite) {
      throw new ForbiddenException('You do not have permission to add members');
    }

    // Check max members if set
    if (room.settings.maxMembers && room.memberCount + memberIds.length > room.settings.maxMembers) {
      throw new BadRequestException(`Room has a maximum of ${room.settings.maxMembers} members`);
    }

    const type = memberType === 'user' ? ChatRoomMemberType.USER : ChatRoomMemberType.AGENT;
    const existingMembers = await this.chatRoomMemberRepository.find({
      where: {
        roomId,
        ...(memberType === 'user' ? { userId: In(memberIds) } : { agentId: In(memberIds) }),
      },
    });

    const existingIds = new Set(existingMembers.map(m => memberType === 'user' ? m.userId : m.agentId));
    const newMemberIds = memberIds.filter(id => !existingIds.has(id));

    if (newMemberIds.length === 0) {
      return; // All members already exist
    }

    const newMembers = newMemberIds.map(id =>
      this.chatRoomMemberRepository.create({
        roomId,
        userId: memberType === 'user' ? id : null,
        agentId: memberType === 'agent' ? id : null,
        memberType: type,
        role: ChatRoomMemberRole.MEMBER,
      }),
    );

    await this.chatRoomMemberRepository.save(newMembers);

    // Update member count
    room.memberCount += newMemberIds.length;
    await this.chatRoomRepository.save(room);

    this.logger.log(`Added ${newMemberIds.length} ${memberType}s to room ${roomId}`);
  }

  /**
   * Remove a member from a room
   */
  async removeMember(
    roomId: string,
    memberId: string,
    memberType: 'user' | 'agent',
    requesterId: string,
  ): Promise<void> {
    const room = await this.chatRoomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException(`Chat room ${roomId} not found`);
    }

    const member = await this.chatRoomMemberRepository.findOne({
      where: {
        roomId,
        ...(memberType === 'user' ? { userId: memberId } : { agentId: memberId }),
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found in room');
    }

    // Owners cannot be removed
    if (member.role === ChatRoomMemberRole.OWNER) {
      throw new ForbiddenException('Cannot remove the room owner');
    }

    // Check if requester can remove members
    const canRemove = await this.canRemoveMembers(roomId, requesterId);
    const isSelf = memberType === 'user' && memberId === requesterId;

    if (!canRemove && !isSelf) {
      throw new ForbiddenException('You do not have permission to remove members');
    }

    await this.chatRoomMemberRepository.remove(member);

    // Update member count
    room.memberCount = Math.max(0, room.memberCount - 1);
    await this.chatRoomRepository.save(room);

    this.logger.log(`Removed ${memberType} ${memberId} from room ${roomId}`);
  }

  /**
   * Update a member's role
   */
  async updateMemberRole(
    roomId: string,
    memberId: string,
    newRole: ChatRoomMemberRole,
    requesterId: string,
  ): Promise<void> {
    const member = await this.chatRoomMemberRepository.findOne({
      where: { roomId, userId: memberId },
    });

    if (!member) {
      throw new NotFoundException('Member not found in room');
    }

    // Only owners can promote to admin or higher
    if (newRole === ChatRoomMemberRole.OWNER || newRole === ChatRoomMemberRole.ADMIN) {
      const isOwner = await this.isOwner(roomId, requesterId);
      if (!isOwner) {
        throw new ForbiddenException('Only the room owner can assign admin roles');
      }
    }

    // Cannot demote yourself if you're the owner
    if (member.role === ChatRoomMemberRole.OWNER && memberId === requesterId) {
      throw new ForbiddenException('Cannot change your own owner role');
    }

    member.role = newRole;
    await this.chatRoomMemberRepository.save(member);

    this.logger.log(`Updated role for user ${memberId} in room ${roomId} to ${newRole}`);
  }

  /**
   * Get room members
   */
  async getMembers(roomId: string): Promise<ChatRoomMember[]> {
    return this.chatRoomMemberRepository.find({
      where: { roomId },
      relations: ['user', 'agent'],
      order: { joinedAt: 'ASC' },
    });
  }

  /**
   * Get rooms a user is a member of
   */
  async getUserRooms(userId: string, workspaceId: string): Promise<ChatRoom[]> {
    const members = await this.chatRoomMemberRepository.find({
      where: { userId },
      relations: ['room'],
    });

    return members
      .map(m => m.room)
      .filter(room => room.workspaceId === workspaceId)
      .sort((a, b) => {
        const aTime = a.lastMessageAt?.getTime() ?? 0;
        const bTime = b.lastMessageAt?.getTime() ?? 0;
        return bTime - aTime;
      });
  }

  /**
   * Search rooms in a workspace
   */
  async searchRooms(workspaceId: string, query: string, userId: string): Promise<ChatRoom[]> {
    const searchQuery = `%${query.toLowerCase()}%`;

    const rooms = await this.chatRoomRepository
      .createQueryBuilder('room')
      .where('room.workspaceId = :workspaceId', { workspaceId })
      .andWhere(
        `(LOWER(room.name) LIKE :query OR LOWER(room.description) LIKE :query)`,
        { query: searchQuery },
      )
      .andWhere(
        `(room.isPrivate = false OR EXISTS (
          SELECT 1 FROM chat_room_members m
          WHERE m.room_id = room.id AND m.user_id = :userId
        ))`,
        { userId },
      )
      .orderBy('room.memberCount', 'DESC')
      .take(20)
      .getMany();

    return rooms;
  }

  /**
   * Update last message timestamp
   */
  async updateLastMessageAt(roomId: string): Promise<void> {
    await this.chatRoomRepository.update(roomId, {
      lastMessageAt: new Date(),
    });
  }

  /**
   * Auto-create workspace channel
   */
  async createWorkspaceChannel(workspaceId: string, userId: string): Promise<ChatRoom> {
    return this.createRoom(workspaceId, userId, {
      name: 'general',
      description: 'General workspace discussion',
      type: ChatRoomType.WORKSPACE,
      isPrivate: false,
    });
  }

  /**
   * Auto-create project channel
   */
  async createProjectChannel(
    workspaceId: string,
    projectId: string,
    projectName: string,
    userId: string,
  ): Promise<ChatRoom> {
    return this.createRoom(workspaceId, userId, {
      name: projectName,
      description: `Discussion for ${projectName} project`,
      type: ChatRoomType.PROJECT,
      projectId,
      isPrivate: false,
    });
  }

  // ==================== Helper Methods ====================

  /**
   * Check if user is a member of a room
   */
  async isMember(roomId: string, userId: string): Promise<boolean> {
    const count = await this.chatRoomMemberRepository.count({
      where: { roomId, userId },
    });
    return count > 0;
  }

  /**
   * Check if user is the owner of a room
   */
  async isOwner(roomId: string, userId: string): Promise<boolean> {
    const member = await this.chatRoomMemberRepository.findOne({
      where: { roomId, userId },
    });
    return member?.role === ChatRoomMemberRole.OWNER;
  }

  /**
   * Check if user can manage room settings
   */
  async canManageRoom(roomId: string, userId: string): Promise<boolean> {
    const member = await this.chatRoomMemberRepository.findOne({
      where: { roomId, userId },
    });
    return member?.role === ChatRoomMemberRole.OWNER || member?.role === ChatRoomMemberRole.ADMIN;
  }

  /**
   * Check if user can invite members
   */
  async canInviteMembers(roomId: string, userId: string): Promise<boolean> {
    const member = await this.chatRoomMemberRepository.findOne({
      where: { roomId, userId },
    });
    if (!member) return false;

    // Get workspace role for additional permission check
    const room = await this.chatRoomRepository.findOne({ where: { id: roomId } });
    if (!room) return false;

    const workspaceMember = await this.workspaceMemberRepository.findOne({
      where: { workspaceId: room.workspaceId, userId },
    });

    // Workspace owners/admins can always invite
    if (workspaceMember?.role === WorkspaceRole.OWNER || workspaceMember?.role === WorkspaceRole.ADMIN) {
      return true;
    }

    // Room owners, admins, and members with developer+ workspace role can invite
    return [ChatRoomMemberRole.OWNER, ChatRoomMemberRole.ADMIN, ChatRoomMemberRole.MEMBER].includes(member.role);
  }

  /**
   * Check if user can remove members
   */
  async canRemoveMembers(roomId: string, userId: string): Promise<boolean> {
    const member = await this.chatRoomMemberRepository.findOne({
      where: { roomId, userId },
    });
    return member?.role === ChatRoomMemberRole.OWNER || member?.role === ChatRoomMemberRole.ADMIN;
  }

  /**
   * Get member role in room
   */
  async getMemberRole(roomId: string, userId: string): Promise<ChatRoomMemberRole | null> {
    const member = await this.chatRoomMemberRepository.findOne({
      where: { roomId, userId },
    });
    return member?.role ?? null;
  }
}
