import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatRoom } from '../../../database/entities/chat-room.entity';
import { ChatRoomMember, ChatRoomMemberRole, ChatRoomMemberType } from '../../../database/entities/chat-room-member.entity';
import { ChatRoomInvitation, InvitationStatus } from '../../../database/entities/chat-room-invitation.entity';
import { User } from '../../../database/entities/user.entity';
import { SendInvitationsDto, InvitationResponseDto } from '../dto/invitation.dto';

/**
 * InvitationService
 * Story 9.10: Multi-User Chat
 *
 * Handles chat room invitations
 */
@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);
  private static readonly INVITATION_EXPIRY_HOURS = 24;

  constructor(
    @InjectRepository(ChatRoomInvitation)
    private readonly invitationRepository: Repository<ChatRoomInvitation>,
    @InjectRepository(ChatRoomMember)
    private readonly memberRepository: Repository<ChatRoomMember>,
    @InjectRepository(ChatRoom)
    private readonly roomRepository: Repository<ChatRoom>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Send invitations to users
   */
  async sendInvitations(
    roomId: string,
    inviterId: string,
    dto: SendInvitationsDto,
  ): Promise<ChatRoomInvitation[]> {
    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException(`Chat room ${roomId} not found`);
    }

    // Check if inviter is a member with invite permissions
    const inviterMember = await this.memberRepository.findOne({
      where: { roomId, userId: inviterId },
    });

    if (!inviterMember || inviterMember.role === ChatRoomMemberRole.READONLY) {
      throw new ForbiddenException('You do not have permission to invite users');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + InvitationService.INVITATION_EXPIRY_HOURS);

    const invitations: ChatRoomInvitation[] = [];

    for (const userId of dto.userIds) {
      // Check if user exists
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        this.logger.warn(`User ${userId} not found, skipping invitation`);
        continue;
      }

      // Check if user is already a member
      const existingMember = await this.memberRepository.findOne({
        where: { roomId, userId },
      });
      if (existingMember) {
        this.logger.warn(`User ${userId} is already a member, skipping invitation`);
        continue;
      }

      // Check for pending invitation
      const existingInvitation = await this.invitationRepository.findOne({
        where: {
          roomId,
          invitedUserId: userId,
          status: InvitationStatus.PENDING,
        },
      });
      if (existingInvitation) {
        // Update existing invitation
        existingInvitation.invitedById = inviterId;
        existingInvitation.expiresAt = expiresAt;
        existingInvitation.role = dto.role || ChatRoomMemberRole.MEMBER;
        existingInvitation.message = dto.message || null;
        await this.invitationRepository.save(existingInvitation);
        invitations.push(existingInvitation);
        continue;
      }

      // Create new invitation
      const invitation = this.invitationRepository.create({
        roomId,
        invitedById: inviterId,
        invitedUserId: userId,
        role: dto.role || ChatRoomMemberRole.MEMBER,
        message: dto.message || null,
        expiresAt,
        status: InvitationStatus.PENDING,
      });

      await this.invitationRepository.save(invitation);
      invitations.push(invitation);
    }

    this.logger.log(`Sent ${invitations.length} invitations for room ${roomId}`);

    return invitations;
  }

  /**
   * Accept an invitation
   */
  async acceptInvitation(invitationId: string, userId: string): Promise<void> {
    const invitation = await this.invitationRepository.findOne({
      where: { id: invitationId },
      relations: ['room'],
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.invitedUserId !== userId) {
      throw new ForbiddenException('This invitation is not for you');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`Invitation has already been ${invitation.status}`);
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = InvitationStatus.EXPIRED;
      await this.invitationRepository.save(invitation);
      throw new BadRequestException('Invitation has expired');
    }

    // Add user as member
    const member = this.memberRepository.create({
      roomId: invitation.roomId,
      userId,
      memberType: ChatRoomMemberType.USER,
      role: invitation.role,
    });

    await this.memberRepository.save(member);

    // Update room member count
    await this.roomRepository.increment({ id: invitation.roomId }, 'memberCount', 1);

    // Update invitation status
    invitation.status = InvitationStatus.ACCEPTED;
    invitation.respondedAt = new Date();
    await this.invitationRepository.save(invitation);

    this.logger.log(`User ${userId} accepted invitation to room ${invitation.roomId}`);
  }

  /**
   * Decline an invitation
   */
  async declineInvitation(invitationId: string, userId: string): Promise<void> {
    const invitation = await this.invitationRepository.findOne({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.invitedUserId !== userId) {
      throw new ForbiddenException('This invitation is not for you');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`Invitation has already been ${invitation.status}`);
    }

    invitation.status = InvitationStatus.DECLINED;
    invitation.respondedAt = new Date();
    await this.invitationRepository.save(invitation);

    this.logger.log(`User ${userId} declined invitation to room ${invitation.roomId}`);
  }

  /**
   * Cancel an invitation (by inviter or admin)
   */
  async cancelInvitation(invitationId: string, requesterId: string): Promise<void> {
    const invitation = await this.invitationRepository.findOne({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Check if requester is the inviter or room admin
    if (invitation.invitedById !== requesterId) {
      const requesterMember = await this.memberRepository.findOne({
        where: { roomId: invitation.roomId, userId: requesterId },
      });

      if (!requesterMember || ![ChatRoomMemberRole.OWNER, ChatRoomMemberRole.ADMIN].includes(requesterMember.role)) {
        throw new ForbiddenException('You do not have permission to cancel this invitation');
      }
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`Cannot cancel a ${invitation.status} invitation`);
    }

    await this.invitationRepository.remove(invitation);

    this.logger.log(`Invitation ${invitationId} cancelled by ${requesterId}`);
  }

  /**
   * Get pending invitations for a user
   */
  async getMyInvitations(userId: string, status?: InvitationStatus): Promise<InvitationResponseDto[]> {
    const where: any = { invitedUserId: userId };
    if (status) {
      where.status = status;
    } else {
      where.status = InvitationStatus.PENDING;
    }

    const invitations = await this.invitationRepository.find({
      where,
      relations: ['room', 'invitedBy'],
      order: { createdAt: 'DESC' },
    });

    return invitations.map(inv => ({
      id: inv.id,
      roomId: inv.roomId,
      roomName: inv.room.name,
      invitedById: inv.invitedById,
      invitedByName: inv.invitedBy?.email || 'Unknown',
      role: inv.role,
      message: inv.message,
      status: inv.status,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    }));
  }

  /**
   * Get pending invitations for a room
   */
  async getPendingInvitations(roomId: string): Promise<ChatRoomInvitation[]> {
    return this.invitationRepository.find({
      where: { roomId, status: InvitationStatus.PENDING },
      relations: ['invitedUser', 'invitedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get invitation count for a user (badge)
   */
  async getInvitationCount(userId: string): Promise<number> {
    return this.invitationRepository.count({
      where: {
        invitedUserId: userId,
        status: InvitationStatus.PENDING,
      },
    });
  }

  /**
   * Scheduled task to expire old invitations
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireOldInvitations(): Promise<void> {
    const result = await this.invitationRepository.update(
      {
        status: InvitationStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
      { status: InvitationStatus.EXPIRED },
    );

    if (result.affected && result.affected > 0) {
      this.logger.log(`Expired ${result.affected} old invitations`);
    }
  }
}
