import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatRoom } from '../../../database/entities/chat-room.entity';
import { ChatRoomMember, ChatRoomMemberRole } from '../../../database/entities/chat-room-member.entity';
import { ChatMessage } from '../../../database/entities/chat-message.entity';
import { ModerationLog, ModerationAction } from '../../../database/entities/moderation-log.entity';
import { PinnedMessage } from '../../../database/entities/pinned-message.entity';
import { UserRoomRestriction, RestrictionType } from '../../../database/entities/user-room-restriction.entity';

/**
 * ModerationService
 * Story 9.10: Multi-User Chat
 *
 * Handles chat room moderation actions
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @InjectRepository(ChatRoom)
    private readonly roomRepository: Repository<ChatRoom>,
    @InjectRepository(ChatRoomMember)
    private readonly memberRepository: Repository<ChatRoomMember>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(ModerationLog)
    private readonly moderationLogRepository: Repository<ModerationLog>,
    @InjectRepository(PinnedMessage)
    private readonly pinnedMessageRepository: Repository<PinnedMessage>,
    @InjectRepository(UserRoomRestriction)
    private readonly restrictionRepository: Repository<UserRoomRestriction>,
  ) {}

  // ==================== Message Moderation ====================

  /**
   * Delete a message
   */
  async deleteMessage(
    roomId: string,
    messageId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<void> {
    await this.validateModerator(roomId, moderatorId);

    const message = await this.messageRepository.findOne({
      where: { id: messageId, roomId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Log the action before deleting
    await this.logAction(roomId, moderatorId, ModerationAction.DELETE_MESSAGE, {
      targetMessageId: messageId,
      reason,
      metadata: { originalText: message.text.substring(0, 200) },
    });

    // Mark message as archived instead of hard delete
    message.isArchived = true;
    message.archivedAt = new Date();
    await this.messageRepository.save(message);

    // Remove from pinned if pinned
    await this.pinnedMessageRepository.delete({ messageId });

    this.logger.log(`Message ${messageId} deleted from room ${roomId} by moderator ${moderatorId}`);
  }

  /**
   * Pin a message
   */
  async pinMessage(roomId: string, messageId: string, userId: string): Promise<void> {
    await this.validateModerator(roomId, userId);

    const message = await this.messageRepository.findOne({
      where: { id: messageId, roomId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check if already pinned
    const existing = await this.pinnedMessageRepository.findOne({
      where: { roomId, messageId },
    });

    if (existing) {
      throw new BadRequestException('Message is already pinned');
    }

    const pinnedMessage = this.pinnedMessageRepository.create({
      roomId,
      messageId,
      pinnedById: userId,
    });

    await this.pinnedMessageRepository.save(pinnedMessage);

    await this.logAction(roomId, userId, ModerationAction.PIN_MESSAGE, {
      targetMessageId: messageId,
    });

    this.logger.log(`Message ${messageId} pinned in room ${roomId}`);
  }

  /**
   * Unpin a message
   */
  async unpinMessage(roomId: string, messageId: string, userId: string): Promise<void> {
    await this.validateModerator(roomId, userId);

    const pinnedMessage = await this.pinnedMessageRepository.findOne({
      where: { roomId, messageId },
    });

    if (!pinnedMessage) {
      throw new NotFoundException('Pinned message not found');
    }

    await this.pinnedMessageRepository.remove(pinnedMessage);

    await this.logAction(roomId, userId, ModerationAction.UNPIN_MESSAGE, {
      targetMessageId: messageId,
    });

    this.logger.log(`Message ${messageId} unpinned from room ${roomId}`);
  }

  /**
   * Get pinned messages for a room
   */
  async getPinnedMessages(roomId: string): Promise<ChatMessage[]> {
    const pinnedMessages = await this.pinnedMessageRepository.find({
      where: { roomId },
      relations: ['message'],
      order: { pinnedAt: 'DESC' },
    });

    return pinnedMessages.map(pm => pm.message);
  }

  // ==================== User Moderation ====================

  /**
   * Mute a user in a room
   */
  async muteUser(
    roomId: string,
    targetUserId: string,
    moderatorId: string,
    durationMinutes?: number,
    reason?: string,
  ): Promise<void> {
    await this.validateModerator(roomId, moderatorId);
    await this.validateTarget(roomId, targetUserId, moderatorId);

    // Check for existing mute
    const existingMute = await this.restrictionRepository.findOne({
      where: { roomId, userId: targetUserId, type: RestrictionType.MUTE },
    });

    if (existingMute) {
      // Update existing mute
      existingMute.expiresAt = durationMinutes
        ? new Date(Date.now() + durationMinutes * 60 * 1000)
        : null;
      existingMute.reason = reason || null;
      existingMute.createdById = moderatorId;
      await this.restrictionRepository.save(existingMute);
    } else {
      // Create new mute
      const mute = this.restrictionRepository.create({
        roomId,
        userId: targetUserId,
        type: RestrictionType.MUTE,
        reason: reason || null,
        expiresAt: durationMinutes
          ? new Date(Date.now() + durationMinutes * 60 * 1000)
          : null,
        createdById: moderatorId,
      });
      await this.restrictionRepository.save(mute);
    }

    // Update member muted status
    await this.memberRepository.update(
      { roomId, userId: targetUserId },
      {
        isMuted: true,
        mutedUntil: durationMinutes
          ? new Date(Date.now() + durationMinutes * 60 * 1000)
          : null,
      },
    );

    await this.logAction(roomId, moderatorId, ModerationAction.MUTE_USER, {
      targetUserId,
      reason,
      metadata: { durationMinutes },
    });

    this.logger.log(`User ${targetUserId} muted in room ${roomId} by ${moderatorId}`);
  }

  /**
   * Unmute a user in a room
   */
  async unmuteUser(roomId: string, targetUserId: string, moderatorId: string): Promise<void> {
    await this.validateModerator(roomId, moderatorId);

    // Remove mute restriction
    await this.restrictionRepository.delete({
      roomId,
      userId: targetUserId,
      type: RestrictionType.MUTE,
    });

    // Update member muted status
    await this.memberRepository.update(
      { roomId, userId: targetUserId },
      { isMuted: false, mutedUntil: null },
    );

    await this.logAction(roomId, moderatorId, ModerationAction.UNMUTE_USER, {
      targetUserId,
    });

    this.logger.log(`User ${targetUserId} unmuted in room ${roomId} by ${moderatorId}`);
  }

  /**
   * Kick a user from a room
   */
  async kickUser(
    roomId: string,
    targetUserId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<void> {
    await this.validateModerator(roomId, moderatorId);
    await this.validateTarget(roomId, targetUserId, moderatorId);

    // Remove member from room
    const member = await this.memberRepository.findOne({
      where: { roomId, userId: targetUserId },
    });

    if (!member) {
      throw new NotFoundException('User is not a member of this room');
    }

    await this.memberRepository.remove(member);

    // Decrement member count
    await this.roomRepository.decrement({ id: roomId }, 'memberCount', 1);

    await this.logAction(roomId, moderatorId, ModerationAction.KICK_USER, {
      targetUserId,
      reason,
    });

    this.logger.log(`User ${targetUserId} kicked from room ${roomId} by ${moderatorId}`);
  }

  /**
   * Ban a user from a room
   */
  async banUser(
    roomId: string,
    targetUserId: string,
    moderatorId: string,
    reason?: string,
  ): Promise<void> {
    await this.validateModerator(roomId, moderatorId);
    await this.validateTarget(roomId, targetUserId, moderatorId);

    // Check for existing ban
    const existingBan = await this.restrictionRepository.findOne({
      where: { roomId, userId: targetUserId, type: RestrictionType.BAN },
    });

    if (existingBan) {
      throw new BadRequestException('User is already banned');
    }

    // Create ban
    const ban = this.restrictionRepository.create({
      roomId,
      userId: targetUserId,
      type: RestrictionType.BAN,
      reason: reason || null,
      createdById: moderatorId,
    });
    await this.restrictionRepository.save(ban);

    // Also kick the user if they're a member
    const member = await this.memberRepository.findOne({
      where: { roomId, userId: targetUserId },
    });

    if (member) {
      await this.memberRepository.remove(member);
      await this.roomRepository.decrement({ id: roomId }, 'memberCount', 1);
    }

    await this.logAction(roomId, moderatorId, ModerationAction.BAN_USER, {
      targetUserId,
      reason,
    });

    this.logger.log(`User ${targetUserId} banned from room ${roomId} by ${moderatorId}`);
  }

  /**
   * Unban a user from a room
   */
  async unbanUser(roomId: string, targetUserId: string, moderatorId: string): Promise<void> {
    await this.validateModerator(roomId, moderatorId);

    const ban = await this.restrictionRepository.findOne({
      where: { roomId, userId: targetUserId, type: RestrictionType.BAN },
    });

    if (!ban) {
      throw new NotFoundException('User is not banned from this room');
    }

    await this.restrictionRepository.remove(ban);

    await this.logAction(roomId, moderatorId, ModerationAction.UNBAN_USER, {
      targetUserId,
    });

    this.logger.log(`User ${targetUserId} unbanned from room ${roomId} by ${moderatorId}`);
  }

  /**
   * Check if user is banned from a room
   */
  async isUserBanned(roomId: string, userId: string): Promise<boolean> {
    const ban = await this.restrictionRepository.findOne({
      where: { roomId, userId, type: RestrictionType.BAN },
    });
    return !!ban;
  }

  /**
   * Check if user is muted in a room
   */
  async isUserMuted(roomId: string, userId: string): Promise<boolean> {
    const mute = await this.restrictionRepository.findOne({
      where: { roomId, userId, type: RestrictionType.MUTE },
    });

    if (!mute) return false;

    // Check if mute has expired
    if (mute.expiresAt && mute.expiresAt < new Date()) {
      // Auto-unmute
      await this.restrictionRepository.remove(mute);
      await this.memberRepository.update(
        { roomId, userId },
        { isMuted: false, mutedUntil: null },
      );
      return false;
    }

    return true;
  }

  // ==================== Room Moderation ====================

  /**
   * Lock a room (prevent new messages)
   */
  async lockRoom(roomId: string, moderatorId: string, reason?: string): Promise<void> {
    const isAdmin = await this.validateModerator(roomId, moderatorId);
    if (!isAdmin) {
      throw new ForbiddenException('Only room admins can lock rooms');
    }

    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.isLocked) {
      throw new BadRequestException('Room is already locked');
    }

    room.isLocked = true;
    await this.roomRepository.save(room);

    await this.logAction(roomId, moderatorId, ModerationAction.LOCK_ROOM, {
      reason,
    });

    this.logger.log(`Room ${roomId} locked by ${moderatorId}`);
  }

  /**
   * Unlock a room
   */
  async unlockRoom(roomId: string, moderatorId: string): Promise<void> {
    const isAdmin = await this.validateModerator(roomId, moderatorId);
    if (!isAdmin) {
      throw new ForbiddenException('Only room admins can unlock rooms');
    }

    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (!room.isLocked) {
      throw new BadRequestException('Room is not locked');
    }

    room.isLocked = false;
    await this.roomRepository.save(room);

    await this.logAction(roomId, moderatorId, ModerationAction.UNLOCK_ROOM, {});

    this.logger.log(`Room ${roomId} unlocked by ${moderatorId}`);
  }

  // ==================== Moderation Log ====================

  /**
   * Get moderation log for a room
   */
  async getModerationLog(
    roomId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<ModerationLog[]> {
    const { limit = 50, offset = 0 } = options;

    return this.moderationLogRepository.find({
      where: { roomId },
      relations: ['moderator', 'targetUser'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  // ==================== Helper Methods ====================

  /**
   * Validate that user is a moderator (admin or owner)
   */
  private async validateModerator(roomId: string, userId: string): Promise<boolean> {
    const member = await this.memberRepository.findOne({
      where: { roomId, userId },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this room');
    }

    if (![ChatRoomMemberRole.OWNER, ChatRoomMemberRole.ADMIN].includes(member.role)) {
      throw new ForbiddenException('You do not have moderation permissions');
    }

    return true;
  }

  /**
   * Validate that target can be moderated
   */
  private async validateTarget(
    roomId: string,
    targetUserId: string,
    moderatorId: string,
  ): Promise<void> {
    // Cannot moderate yourself
    if (targetUserId === moderatorId) {
      throw new BadRequestException('Cannot perform this action on yourself');
    }

    // Cannot moderate owners
    const targetMember = await this.memberRepository.findOne({
      where: { roomId, userId: targetUserId },
    });

    if (targetMember?.role === ChatRoomMemberRole.OWNER) {
      throw new ForbiddenException('Cannot moderate the room owner');
    }

    // Admins cannot moderate other admins (only owners can)
    const moderatorMember = await this.memberRepository.findOne({
      where: { roomId, userId: moderatorId },
    });

    if (
      moderatorMember?.role === ChatRoomMemberRole.ADMIN &&
      targetMember?.role === ChatRoomMemberRole.ADMIN
    ) {
      throw new ForbiddenException('Admins cannot moderate other admins');
    }
  }

  /**
   * Log a moderation action
   */
  private async logAction(
    roomId: string,
    moderatorId: string,
    action: ModerationAction,
    options: {
      targetUserId?: string;
      targetMessageId?: string;
      reason?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    const log = this.moderationLogRepository.create({
      roomId,
      moderatorId,
      action,
      targetUserId: options.targetUserId || null,
      targetMessageId: options.targetMessageId || null,
      reason: options.reason || null,
      metadata: options.metadata || null,
    });

    await this.moderationLogRepository.save(log);
  }

  /**
   * Scheduled task to clean up expired mutes
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredMutes(): Promise<void> {
    const expiredMutes = await this.restrictionRepository.find({
      where: {
        type: RestrictionType.MUTE,
        expiresAt: LessThan(new Date()),
      },
    });

    if (expiredMutes.length === 0) return;

    for (const mute of expiredMutes) {
      await this.memberRepository.update(
        { roomId: mute.roomId, userId: mute.userId },
        { isMuted: false, mutedUntil: null },
      );
    }

    await this.restrictionRepository.remove(expiredMutes);

    this.logger.log(`Cleaned up ${expiredMutes.length} expired mutes`);
  }
}
