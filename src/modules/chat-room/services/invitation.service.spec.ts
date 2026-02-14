import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvitationService } from './invitation.service';
import { ChatRoom, ChatRoomType } from '../../../database/entities/chat-room.entity';
import { ChatRoomMember, ChatRoomMemberRole, ChatRoomMemberType } from '../../../database/entities/chat-room-member.entity';
import { ChatRoomInvitation, InvitationStatus } from '../../../database/entities/chat-room-invitation.entity';
import { User } from '../../../database/entities/user.entity';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('InvitationService', () => {
  let service: InvitationService;
  let invitationRepository: jest.Mocked<Repository<ChatRoomInvitation>>;
  let memberRepository: jest.Mocked<Repository<ChatRoomMember>>;
  let roomRepository: jest.Mocked<Repository<ChatRoom>>;
  let userRepository: jest.Mocked<Repository<User>>;

  const mockRoomId = 'room-123';
  const mockInviterId = 'inviter-123';
  const mockInviteeId = 'invitee-123';
  const mockInvitationId = 'invitation-123';

  const mockRoom: ChatRoom = {
    id: mockRoomId,
    workspaceId: 'workspace-123',
    projectId: null,
    name: 'general',
    description: null,
    type: ChatRoomType.GROUP,
    isPrivate: false,
    isLocked: false,
    createdById: mockInviterId,
    settings: {
      allowAgents: true,
      threadingEnabled: false,
      reactionsEnabled: true,
    },
    memberCount: 1,
    lastMessageAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ChatRoom;

  const mockInviterMember: ChatRoomMember = {
    id: 'member-1',
    roomId: mockRoomId,
    userId: mockInviterId,
    agentId: null,
    memberType: ChatRoomMemberType.USER,
    role: ChatRoomMemberRole.ADMIN,
    joinedAt: new Date(),
    lastReadAt: null,
    isMuted: false,
    mutedUntil: null,
  } as ChatRoomMember;

  const mockInvitee: Partial<User> = {
    id: mockInviteeId,
    email: 'invitee@test.com',
    passwordHash: 'hash',
    twoFactorSecret: null,
    twoFactorEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    deletedAt: null,
    currentWorkspaceId: null,
  };

  const mockInvitation: ChatRoomInvitation = {
    id: mockInvitationId,
    roomId: mockRoomId,
    invitedById: mockInviterId,
    invitedUserId: mockInviteeId,
    status: InvitationStatus.PENDING,
    role: ChatRoomMemberRole.MEMBER,
    message: 'Join our room!',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    respondedAt: null,
    createdAt: new Date(),
    room: mockRoom,
    invitedBy: { email: 'inviter@test.com' } as User,
  } as ChatRoomInvitation;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationService,
        {
          provide: getRepositoryToken(ChatRoomInvitation),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn().mockReturnValue({}),
            save: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChatRoomMember),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn().mockReturnValue({}),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChatRoom),
          useValue: {
            findOne: jest.fn(),
            increment: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InvitationService>(InvitationService);
    invitationRepository = module.get(getRepositoryToken(ChatRoomInvitation));
    memberRepository = module.get(getRepositoryToken(ChatRoomMember));
    roomRepository = module.get(getRepositoryToken(ChatRoom));
    userRepository = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendInvitations', () => {
    it('should send invitations successfully', async () => {
      roomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.findOne.mockImplementation(({ where }: any) => {
        if (where.userId === mockInviterId) {
          return Promise.resolve(mockInviterMember);
        }
        return Promise.resolve(null);
      });
      userRepository.findOne.mockResolvedValue(mockInvitee as User);
      invitationRepository.findOne.mockResolvedValue(null);
      invitationRepository.save.mockResolvedValue(mockInvitation);

      const result = await service.sendInvitations(mockRoomId, mockInviterId, {
        userIds: [mockInviteeId],
        message: 'Join us!',
      });

      expect(result).toHaveLength(1);
      expect(invitationRepository.save).toHaveBeenCalled();
    });

    it('should skip users who are already members', async () => {
      roomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.findOne.mockResolvedValue(mockInviterMember);
      userRepository.findOne.mockResolvedValue(mockInvitee as User);

      const result = await service.sendInvitations(mockRoomId, mockInviterId, {
        userIds: [mockInviterId], // Trying to invite self (already member)
      });

      expect(result).toHaveLength(0);
    });

    it('should throw ForbiddenException when inviter lacks permission', async () => {
      roomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.findOne.mockResolvedValue({
        ...mockInviterMember,
        role: ChatRoomMemberRole.READONLY,
      });

      await expect(
        service.sendInvitations(mockRoomId, mockInviterId, { userIds: [mockInviteeId] })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation successfully', async () => {
      invitationRepository.findOne.mockResolvedValue(mockInvitation);
      memberRepository.create.mockReturnValue({} as ChatRoomMember);
      memberRepository.save.mockResolvedValue({} as any);
      roomRepository.increment.mockResolvedValue({} as any);
      invitationRepository.save.mockResolvedValue({
        ...mockInvitation,
        status: InvitationStatus.ACCEPTED,
      });

      await service.acceptInvitation(mockInvitationId, mockInviteeId);

      expect(memberRepository.save).toHaveBeenCalled();
      expect(roomRepository.increment).toHaveBeenCalled();
      expect(invitationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: InvitationStatus.ACCEPTED })
      );
    });

    it('should throw ForbiddenException when invitation is for different user', async () => {
      invitationRepository.findOne.mockResolvedValue(mockInvitation);

      await expect(
        service.acceptInvitation(mockInvitationId, 'other-user')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when invitation already responded', async () => {
      invitationRepository.findOne.mockResolvedValue({
        ...mockInvitation,
        status: InvitationStatus.ACCEPTED,
      });

      await expect(
        service.acceptInvitation(mockInvitationId, mockInviteeId)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when invitation expired', async () => {
      invitationRepository.findOne.mockResolvedValue({
        ...mockInvitation,
        expiresAt: new Date(Date.now() - 60000),
      });
      invitationRepository.save.mockResolvedValue({} as any);

      await expect(
        service.acceptInvitation(mockInvitationId, mockInviteeId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('declineInvitation', () => {
    it('should decline invitation successfully', async () => {
      const pendingInvitation = { ...mockInvitation, status: InvitationStatus.PENDING };
      invitationRepository.findOne.mockResolvedValue(pendingInvitation);
      invitationRepository.save.mockResolvedValue({
        ...pendingInvitation,
        status: InvitationStatus.DECLINED,
      });

      await service.declineInvitation(mockInvitationId, mockInviteeId);

      expect(invitationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: InvitationStatus.DECLINED })
      );
    });

    it('should throw ForbiddenException when invitation is for different user', async () => {
      invitationRepository.findOne.mockResolvedValue(mockInvitation);

      await expect(
        service.declineInvitation(mockInvitationId, 'other-user')
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelInvitation', () => {
    it('should allow inviter to cancel invitation', async () => {
      const pendingInvitation = { ...mockInvitation, status: InvitationStatus.PENDING };
      invitationRepository.findOne.mockResolvedValue(pendingInvitation);
      invitationRepository.remove.mockResolvedValue({} as any);

      await service.cancelInvitation(mockInvitationId, mockInviterId);

      expect(invitationRepository.remove).toHaveBeenCalled();
    });

    it('should allow room admin to cancel invitation', async () => {
      const pendingInvitation = { ...mockInvitation, status: InvitationStatus.PENDING };
      invitationRepository.findOne.mockResolvedValue(pendingInvitation);
      memberRepository.findOne.mockResolvedValue(mockInviterMember);
      invitationRepository.remove.mockResolvedValue({} as any);

      await service.cancelInvitation(mockInvitationId, 'admin-user');

      expect(invitationRepository.remove).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user lacks permission', async () => {
      invitationRepository.findOne.mockResolvedValue(mockInvitation);
      memberRepository.findOne.mockResolvedValue({
        ...mockInviterMember,
        role: ChatRoomMemberRole.MEMBER,
      });

      await expect(
        service.cancelInvitation(mockInvitationId, 'random-user')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when canceling non-pending invitation', async () => {
      invitationRepository.findOne.mockResolvedValue({
        ...mockInvitation,
        status: InvitationStatus.ACCEPTED,
      });

      await expect(
        service.cancelInvitation(mockInvitationId, mockInviterId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyInvitations', () => {
    it('should return pending invitations for user', async () => {
      invitationRepository.find.mockResolvedValue([mockInvitation]);

      const result = await service.getMyInvitations(mockInviteeId);

      expect(result).toHaveLength(1);
      expect(result[0].roomName).toBe('general');
    });

    it('should filter by status when provided', async () => {
      invitationRepository.find.mockResolvedValue([]);

      await service.getMyInvitations(mockInviteeId, InvitationStatus.ACCEPTED);

      expect(invitationRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { invitedUserId: mockInviteeId, status: InvitationStatus.ACCEPTED },
        })
      );
    });
  });

  describe('getInvitationCount', () => {
    it('should return count of pending invitations', async () => {
      invitationRepository.count.mockResolvedValue(5);

      const result = await service.getInvitationCount(mockInviteeId);

      expect(result).toBe(5);
      expect(invitationRepository.count).toHaveBeenCalledWith({
        where: {
          invitedUserId: mockInviteeId,
          status: InvitationStatus.PENDING,
        },
      });
    });
  });
});
