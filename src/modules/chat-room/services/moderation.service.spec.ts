import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModerationService } from './moderation.service';
import { ChatRoom, ChatRoomType } from '../../../database/entities/chat-room.entity';
import { ChatRoomMember, ChatRoomMemberRole, ChatRoomMemberType } from '../../../database/entities/chat-room-member.entity';
import { ChatMessage } from '../../../database/entities/chat-message.entity';
import { ModerationLog, ModerationAction } from '../../../database/entities/moderation-log.entity';
import { PinnedMessage } from '../../../database/entities/pinned-message.entity';
import { UserRoomRestriction, RestrictionType } from '../../../database/entities/user-room-restriction.entity';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('ModerationService', () => {
  let service: ModerationService;
  let roomRepository: jest.Mocked<Repository<ChatRoom>>;
  let memberRepository: jest.Mocked<Repository<ChatRoomMember>>;
  let messageRepository: jest.Mocked<Repository<ChatMessage>>;
  let moderationLogRepository: jest.Mocked<Repository<ModerationLog>>;
  let pinnedMessageRepository: jest.Mocked<Repository<PinnedMessage>>;
  let restrictionRepository: jest.Mocked<Repository<UserRoomRestriction>>;

  const mockRoomId = 'room-123';
  const mockModeratorId = 'moderator-123';
  const mockTargetUserId = 'target-user-123';
  const mockMessageId = 'message-123';

  const mockRoom: ChatRoom = {
    id: mockRoomId,
    workspaceId: 'workspace-123',
    projectId: null,
    name: 'general',
    description: null,
    type: ChatRoomType.GROUP,
    isPrivate: false,
    isLocked: false,
    createdById: mockModeratorId,
    settings: {
      allowAgents: true,
      threadingEnabled: false,
      reactionsEnabled: true,
    },
    memberCount: 2,
    lastMessageAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ChatRoom;

  const mockModeratorMember: ChatRoomMember = {
    id: 'member-mod',
    roomId: mockRoomId,
    userId: mockModeratorId,
    agentId: null,
    memberType: ChatRoomMemberType.USER,
    role: ChatRoomMemberRole.ADMIN,
    joinedAt: new Date(),
    lastReadAt: null,
    isMuted: false,
    mutedUntil: null,
  } as ChatRoomMember;

  const mockTargetMember: ChatRoomMember = {
    id: 'member-target',
    roomId: mockRoomId,
    userId: mockTargetUserId,
    agentId: null,
    memberType: ChatRoomMemberType.USER,
    role: ChatRoomMemberRole.MEMBER,
    joinedAt: new Date(),
    lastReadAt: null,
    isMuted: false,
    mutedUntil: null,
  } as ChatRoomMember;

  const mockMessage: ChatMessage = {
    id: mockMessageId,
    workspaceId: 'workspace-123',
    projectId: null,
    roomId: mockRoomId,
    userId: mockTargetUserId,
    agentId: null,
    text: 'Test message',
    isArchived: false,
    archivedAt: null,
  } as ChatMessage;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModerationService,
        {
          provide: getRepositoryToken(ChatRoom),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            decrement: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChatRoomMember),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ModerationLog),
          useValue: {
            create: jest.fn().mockReturnValue({}),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PinnedMessage),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn().mockReturnValue({}),
            save: jest.fn(),
            remove: jest.fn(),
            delete: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserRoomRestriction),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn().mockReturnValue({}),
            save: jest.fn(),
            remove: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ModerationService>(ModerationService);
    roomRepository = module.get(getRepositoryToken(ChatRoom));
    memberRepository = module.get(getRepositoryToken(ChatRoomMember));
    messageRepository = module.get(getRepositoryToken(ChatMessage));
    moderationLogRepository = module.get(getRepositoryToken(ModerationLog));
    pinnedMessageRepository = module.get(getRepositoryToken(PinnedMessage));
    restrictionRepository = module.get(getRepositoryToken(UserRoomRestriction));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deleteMessage', () => {
    it('should delete a message when moderator has permission', async () => {
      memberRepository.findOne.mockResolvedValue(mockModeratorMember);
      messageRepository.findOne.mockResolvedValue(mockMessage);
      messageRepository.save.mockResolvedValue({ ...mockMessage, isArchived: true });
      pinnedMessageRepository.delete.mockResolvedValue({ affected: 0 } as any);

      await service.deleteMessage(mockRoomId, mockMessageId, mockModeratorId, 'spam');

      expect(messageRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isArchived: true })
      );
      expect(moderationLogRepository.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user lacks permission', async () => {
      memberRepository.findOne.mockResolvedValue({
        ...mockModeratorMember,
        role: ChatRoomMemberRole.MEMBER,
      });

      await expect(
        service.deleteMessage(mockRoomId, mockMessageId, mockModeratorId)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when message not found', async () => {
      memberRepository.findOne.mockResolvedValue(mockModeratorMember);
      messageRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteMessage(mockRoomId, mockMessageId, mockModeratorId)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('pinMessage', () => {
    it('should pin a message successfully', async () => {
      memberRepository.findOne.mockResolvedValue(mockModeratorMember);
      messageRepository.findOne.mockResolvedValue(mockMessage);
      pinnedMessageRepository.findOne.mockResolvedValue(null);

      await service.pinMessage(mockRoomId, mockMessageId, mockModeratorId);

      expect(pinnedMessageRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException when message already pinned', async () => {
      memberRepository.findOne.mockResolvedValue(mockModeratorMember);
      messageRepository.findOne.mockResolvedValue(mockMessage);
      pinnedMessageRepository.findOne.mockResolvedValue({ id: 'pinned-1' } as PinnedMessage);

      await expect(
        service.pinMessage(mockRoomId, mockMessageId, mockModeratorId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('muteUser', () => {
    it('should mute a user successfully', async () => {
      memberRepository.findOne.mockImplementation(({ where }: any) => {
        if (where.userId === mockModeratorId) {
          return Promise.resolve(mockModeratorMember);
        }
        return Promise.resolve(mockTargetMember);
      });
      restrictionRepository.findOne.mockResolvedValue(null);

      await service.muteUser(
        mockRoomId,
        mockTargetUserId,
        mockModeratorId,
        60,
        'disruptive behavior'
      );

      expect(restrictionRepository.save).toHaveBeenCalled();
      expect(memberRepository.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException when moderating self', async () => {
      memberRepository.findOne.mockResolvedValue(mockModeratorMember);

      await expect(
        service.muteUser(mockRoomId, mockModeratorId, mockModeratorId)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when trying to mute owner', async () => {
      memberRepository.findOne.mockImplementation(({ where }: any) => {
        if (where.userId === mockModeratorId) {
          return Promise.resolve(mockModeratorMember);
        }
        return Promise.resolve({
          ...mockTargetMember,
          role: ChatRoomMemberRole.OWNER,
        });
      });

      await expect(
        service.muteUser(mockRoomId, mockTargetUserId, mockModeratorId)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('kickUser', () => {
    it('should kick a user successfully', async () => {
      memberRepository.findOne.mockImplementation(({ where }: any) => {
        if (where.userId === mockModeratorId) {
          return Promise.resolve(mockModeratorMember);
        }
        return Promise.resolve(mockTargetMember);
      });
      memberRepository.remove.mockResolvedValue({} as any);
      roomRepository.decrement.mockResolvedValue({} as any);

      await service.kickUser(mockRoomId, mockTargetUserId, mockModeratorId, 'violation');

      expect(memberRepository.remove).toHaveBeenCalled();
      expect(roomRepository.decrement).toHaveBeenCalled();
    });

    it('should throw NotFoundException when target not a member', async () => {
      memberRepository.findOne.mockImplementation(({ where }: any) => {
        if (where.userId === mockModeratorId) {
          return Promise.resolve(mockModeratorMember);
        }
        return Promise.resolve(null);
      });

      await expect(
        service.kickUser(mockRoomId, mockTargetUserId, mockModeratorId)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('banUser', () => {
    it('should ban a user successfully', async () => {
      memberRepository.findOne.mockImplementation(({ where }: any) => {
        if (where.userId === mockModeratorId) {
          return Promise.resolve(mockModeratorMember);
        }
        return Promise.resolve(mockTargetMember);
      });
      restrictionRepository.findOne.mockResolvedValue(null);
      memberRepository.remove.mockResolvedValue({} as any);
      roomRepository.decrement.mockResolvedValue({} as any);

      await service.banUser(mockRoomId, mockTargetUserId, mockModeratorId, 'severe violation');

      expect(restrictionRepository.save).toHaveBeenCalled();
      expect(memberRepository.remove).toHaveBeenCalled();
    });

    it('should throw BadRequestException when user already banned', async () => {
      memberRepository.findOne.mockImplementation(({ where }: any) => {
        if (where.userId === mockModeratorId) {
          return Promise.resolve(mockModeratorMember);
        }
        return Promise.resolve(mockTargetMember);
      });
      restrictionRepository.findOne.mockResolvedValue({ id: 'ban-1' } as UserRoomRestriction);

      await expect(
        service.banUser(mockRoomId, mockTargetUserId, mockModeratorId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('lockRoom', () => {
    it('should lock a room successfully', async () => {
      memberRepository.findOne.mockResolvedValue(mockModeratorMember);
      roomRepository.findOne.mockResolvedValue(mockRoom);
      roomRepository.save.mockResolvedValue({ ...mockRoom, isLocked: true });

      await service.lockRoom(mockRoomId, mockModeratorId, 'maintenance');

      expect(roomRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isLocked: true })
      );
    });

    it('should throw BadRequestException when room already locked', async () => {
      memberRepository.findOne.mockResolvedValue(mockModeratorMember);
      roomRepository.findOne.mockResolvedValue({ ...mockRoom, isLocked: true });

      await expect(
        service.lockRoom(mockRoomId, mockModeratorId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('isUserMuted', () => {
    it('should return true when user is muted', async () => {
      restrictionRepository.findOne.mockResolvedValue({
        type: RestrictionType.MUTE,
        expiresAt: new Date(Date.now() + 60000),
      } as UserRoomRestriction);

      const result = await service.isUserMuted(mockRoomId, mockTargetUserId);

      expect(result).toBe(true);
    });

    it('should return false when mute has expired', async () => {
      restrictionRepository.findOne.mockResolvedValue({
        type: RestrictionType.MUTE,
        expiresAt: new Date(Date.now() - 60000),
      } as UserRoomRestriction);
      restrictionRepository.remove.mockResolvedValue({} as any);
      memberRepository.update.mockResolvedValue({} as any);

      const result = await service.isUserMuted(mockRoomId, mockTargetUserId);

      expect(result).toBe(false);
      expect(restrictionRepository.remove).toHaveBeenCalled();
    });
  });

  describe('getModerationLog', () => {
    it('should return moderation log entries', async () => {
      const mockLogs = [
        { id: 'log-1', action: ModerationAction.MUTE_USER },
        { id: 'log-2', action: ModerationAction.BAN_USER },
      ];
      moderationLogRepository.find.mockResolvedValue(mockLogs as ModerationLog[]);

      const result = await service.getModerationLog(mockRoomId, { limit: 10 });

      expect(result).toHaveLength(2);
      expect(moderationLogRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roomId: mockRoomId },
          take: 10,
        })
      );
    });
  });
});
