import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../shared/guards/workspace-access.guard';
import { ChatRoomService } from './services/chat-room.service';
import { InvitationService } from './services/invitation.service';
import { ModerationService } from './services/moderation.service';
import { PresenceService, PresenceStatus } from './services/presence.service';
import {
  CreateChatRoomDto,
  UpdateChatRoomDto,
  AddMembersDto,
  UpdateMemberRoleDto,
  GetRoomsQueryDto,
} from './dto/create-chat-room.dto';
import {
  SendInvitationsDto,
  GetInvitationsQueryDto,
} from './dto/invitation.dto';
import {
  MuteUserDto,
  KickUserDto,
  BanUserDto,
  DeleteMessageDto,
  LockRoomDto,
  GetModerationLogQueryDto,
} from './dto/moderation.dto';

/**
 * ChatRoomController
 * Story 9.10: Multi-User Chat
 *
 * REST API endpoints for chat room management
 */
@Controller('api/v1/workspaces/:workspaceId/chat-rooms')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class ChatRoomController {
  private readonly logger = new Logger(ChatRoomController.name);

  constructor(
    private readonly chatRoomService: ChatRoomService,
    private readonly invitationService: InvitationService,
    private readonly moderationService: ModerationService,
    private readonly presenceService: PresenceService,
  ) {}

  // ==================== Room CRUD ====================

  /**
   * Create a new chat room
   * POST /api/v1/workspaces/:workspaceId/chat-rooms
   */
  @Post()
  async createRoom(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateChatRoomDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const room = await this.chatRoomService.createRoom(workspaceId, userId, dto);
    return { room };
  }

  /**
   * Get rooms in a workspace
   * GET /api/v1/workspaces/:workspaceId/chat-rooms
   */
  @Get()
  async getRooms(
    @Param('workspaceId') workspaceId: string,
    @Query() query: GetRoomsQueryDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const rooms = await this.chatRoomService.getRooms(workspaceId, userId, query);
    return { rooms };
  }

  /**
   * Get a single room
   * GET /api/v1/workspaces/:workspaceId/chat-rooms/:roomId
   */
  @Get(':roomId')
  async getRoom(
    @Param('roomId') roomId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const room = await this.chatRoomService.getRoom(roomId, userId);
    return { room };
  }

  /**
   * Update a room
   * PATCH /api/v1/workspaces/:workspaceId/chat-rooms/:roomId
   */
  @Patch(':roomId')
  async updateRoom(
    @Param('roomId') roomId: string,
    @Body() dto: UpdateChatRoomDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const room = await this.chatRoomService.updateRoom(roomId, userId, dto);
    return { room };
  }

  /**
   * Delete a room
   * DELETE /api/v1/workspaces/:workspaceId/chat-rooms/:roomId
   */
  @Delete(':roomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRoom(
    @Param('roomId') roomId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.chatRoomService.deleteRoom(roomId, userId);
  }

  /**
   * Search rooms
   * GET /api/v1/workspaces/:workspaceId/chat-rooms/search
   */
  @Get('search')
  async searchRooms(
    @Param('workspaceId') workspaceId: string,
    @Query('q') query: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const rooms = await this.chatRoomService.searchRooms(workspaceId, query, userId);
    return { rooms };
  }

  // ==================== Member Management ====================

  /**
   * Get room members
   * GET /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/members
   */
  @Get(':roomId/members')
  async getMembers(@Param('roomId') roomId: string) {
    const members = await this.chatRoomService.getMembers(roomId);
    return { members };
  }

  /**
   * Add members to room
   * POST /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/members
   */
  @Post(':roomId/members')
  async addMembers(
    @Param('roomId') roomId: string,
    @Body() dto: AddMembersDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.chatRoomService.addMembers(roomId, dto.memberIds, dto.memberType, userId);
    return { success: true };
  }

  /**
   * Remove a member from room
   * DELETE /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/members/:memberId
   */
  @Delete(':roomId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('roomId') roomId: string,
    @Param('memberId') memberId: string,
    @Query('type') memberType: 'user' | 'agent' = 'user',
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.chatRoomService.removeMember(roomId, memberId, memberType, userId);
  }

  /**
   * Update member role
   * PATCH /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/members/:memberId/role
   */
  @Patch(':roomId/members/:memberId/role')
  async updateMemberRole(
    @Param('roomId') roomId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.chatRoomService.updateMemberRole(roomId, memberId, dto.role as any, userId);
    return { success: true };
  }

  // ==================== Invitations ====================

  /**
   * Send invitations to a room
   * POST /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/invitations
   */
  @Post(':roomId/invitations')
  async sendInvitations(
    @Param('roomId') roomId: string,
    @Body() dto: SendInvitationsDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const invitations = await this.invitationService.sendInvitations(roomId, userId, dto);
    return { invitations };
  }

  /**
   * Get pending invitations for a room
   * GET /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/invitations
   */
  @Get(':roomId/invitations')
  async getRoomInvitations(@Param('roomId') roomId: string) {
    const invitations = await this.invitationService.getPendingInvitations(roomId);
    return { invitations };
  }

  // ==================== Moderation ====================

  /**
   * Pin a message
   * POST /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/pinned/:messageId
   */
  @Post(':roomId/pinned/:messageId')
  async pinMessage(
    @Param('roomId') roomId: string,
    @Param('messageId') messageId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.moderationService.pinMessage(roomId, messageId, userId);
    return { success: true };
  }

  /**
   * Unpin a message
   * DELETE /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/pinned/:messageId
   */
  @Delete(':roomId/pinned/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unpinMessage(
    @Param('roomId') roomId: string,
    @Param('messageId') messageId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.moderationService.unpinMessage(roomId, messageId, userId);
  }

  /**
   * Get pinned messages
   * GET /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/pinned
   */
  @Get(':roomId/pinned')
  async getPinnedMessages(@Param('roomId') roomId: string) {
    const messages = await this.moderationService.getPinnedMessages(roomId);
    return { messages };
  }

  /**
   * Mute a user
   * POST /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/mute/:targetUserId
   */
  @Post(':roomId/mute/:targetUserId')
  async muteUser(
    @Param('roomId') roomId: string,
    @Param('targetUserId') targetUserId: string,
    @Body() dto: MuteUserDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.moderationService.muteUser(
      roomId,
      targetUserId,
      userId,
      dto.durationMinutes,
      dto.reason,
    );
    return { success: true };
  }

  /**
   * Unmute a user
   * DELETE /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/mute/:targetUserId
   */
  @Delete(':roomId/mute/:targetUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unmuteUser(
    @Param('roomId') roomId: string,
    @Param('targetUserId') targetUserId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.moderationService.unmuteUser(roomId, targetUserId, userId);
  }

  /**
   * Kick a user
   * POST /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/kick/:targetUserId
   */
  @Post(':roomId/kick/:targetUserId')
  async kickUser(
    @Param('roomId') roomId: string,
    @Param('targetUserId') targetUserId: string,
    @Body() dto: KickUserDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.moderationService.kickUser(roomId, targetUserId, userId, dto.reason);
    return { success: true };
  }

  /**
   * Ban a user
   * POST /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/ban/:targetUserId
   */
  @Post(':roomId/ban/:targetUserId')
  async banUser(
    @Param('roomId') roomId: string,
    @Param('targetUserId') targetUserId: string,
    @Body() dto: BanUserDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.moderationService.banUser(roomId, targetUserId, userId, dto.reason);
    return { success: true };
  }

  /**
   * Unban a user
   * DELETE /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/ban/:targetUserId
   */
  @Delete(':roomId/ban/:targetUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unbanUser(
    @Param('roomId') roomId: string,
    @Param('targetUserId') targetUserId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.moderationService.unbanUser(roomId, targetUserId, userId);
  }

  /**
   * Lock a room
   * POST /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/lock
   */
  @Post(':roomId/lock')
  async lockRoom(
    @Param('roomId') roomId: string,
    @Body() dto: LockRoomDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.moderationService.lockRoom(roomId, userId, dto.reason);
    return { success: true };
  }

  /**
   * Unlock a room
   * DELETE /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/lock
   */
  @Delete(':roomId/lock')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlockRoom(
    @Param('roomId') roomId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.moderationService.unlockRoom(roomId, userId);
  }

  /**
   * Get moderation log
   * GET /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/moderation-log
   */
  @Get(':roomId/moderation-log')
  async getModerationLog(
    @Param('roomId') roomId: string,
    @Query() query: GetModerationLogQueryDto,
  ) {
    const logs = await this.moderationService.getModerationLog(roomId, query);
    return { logs };
  }

  // ==================== Presence ====================

  /**
   * Get room presence (who's online)
   * GET /api/v1/workspaces/:workspaceId/chat-rooms/:roomId/presence
   */
  @Get(':roomId/presence')
  async getRoomPresence(
    @Param('workspaceId') workspaceId: string,
    @Param('roomId') roomId: string,
  ) {
    const userIds = await this.presenceService.getRoomPresence(roomId);
    const presenceMap = await this.presenceService.getPresenceMany(workspaceId, userIds);

    const presence = Array.from(presenceMap.values()).map(p => ({
      userId: p.userId,
      status: this.presenceService.getEffectiveStatus(p),
      lastActiveAt: p.lastActiveAt.toISOString(),
      statusMessage: p.statusMessage,
    }));

    return { presence };
  }

  /**
   * Set own presence status
   * POST /api/v1/workspaces/:workspaceId/chat-rooms/presence
   */
  @Post('presence')
  async setPresence(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { status: PresenceStatus; statusMessage?: string; currentRoomId?: string },
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.presenceService.setPresence(workspaceId, userId, body.status, {
      statusMessage: body.statusMessage,
      currentRoomId: body.currentRoomId,
    });
    return { success: true };
  }

  /**
   * Heartbeat to maintain presence
   * POST /api/v1/workspaces/:workspaceId/chat-rooms/heartbeat
   */
  @Post('heartbeat')
  async heartbeat(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { currentRoomId?: string },
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.presenceService.heartbeat(workspaceId, userId, body.currentRoomId);
    return { success: true };
  }
}

/**
 * Invitation-specific controller (user's invitations)
 */
@Controller('api/v1/users/me/chat-invitations')
@UseGuards(JwtAuthGuard)
export class UserInvitationsController {
  constructor(private readonly invitationService: InvitationService) {}

  /**
   * Get my invitations
   * GET /api/v1/users/me/chat-invitations
   */
  @Get()
  async getMyInvitations(
    @Query() query: GetInvitationsQueryDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const invitations = await this.invitationService.getMyInvitations(userId, query.status);
    return { invitations };
  }

  /**
   * Get invitation count
   * GET /api/v1/users/me/chat-invitations/count
   */
  @Get('count')
  async getInvitationCount(@Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    const count = await this.invitationService.getInvitationCount(userId);
    return { count };
  }

  /**
   * Accept an invitation
   * POST /api/v1/users/me/chat-invitations/:invitationId/accept
   */
  @Post(':invitationId/accept')
  async acceptInvitation(
    @Param('invitationId') invitationId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.invitationService.acceptInvitation(invitationId, userId);
    return { success: true };
  }

  /**
   * Decline an invitation
   * POST /api/v1/users/me/chat-invitations/:invitationId/decline
   */
  @Post(':invitationId/decline')
  async declineInvitation(
    @Param('invitationId') invitationId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.invitationService.declineInvitation(invitationId, userId);
    return { success: true };
  }

  /**
   * Cancel an invitation (as inviter)
   * DELETE /api/v1/users/me/chat-invitations/:invitationId
   */
  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelInvitation(
    @Param('invitationId') invitationId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.invitationService.cancelInvitation(invitationId, userId);
  }
}
