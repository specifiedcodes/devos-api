import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatRoomService } from './chat-room.service';
import { ChatRoom, ChatRoomType } from '../../../database/entities/chat-room.entity';
import { ChatRoomMember, ChatRoomMemberRole, ChatRoomMemberType } from '../../../database/entities/chat-room-member.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('ChatRoomService', () => {
  let service: ChatRoomService;
  let chatRoomRepository: jest.Mocked<Repository<ChatRoom>>;
  let memberRepository: jest.Mocked<Repository<ChatRoomMember>>;
  let workspaceMemberRepository: jest.Mocked<Repository<WorkspaceMember>>;

  const mockWorkspaceId = 'workspace-123';
  const mockUserId = 'user-123';
  const mockRoomId = 'room-123';

  const mockRoom: ChatRoom = {
    id: mockRoomId,
    workspaceId: mockWorkspaceId,
    projectId: null,
    name: 'general',
    description: 'General discussion',
    type: ChatRoomType.GROUP,
    isPrivate: false,
    isLocked: false,
    createdById: mockUserId,
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

  const mockMember: ChatRoomMember = {
    id: 'member-123',
    roomId: mockRoomId,
    userId: mockUserId,
    agentId: null,
    memberType: ChatRoomMemberType.USER,
    role: ChatRoomMemberRole.OWNER,
    joinedAt: new Date(),
    lastReadAt: null,
    isMuted: false,
    mutedUntil: null,
  } as ChatRoomMember;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatRoomService,
        {
          provide: getRepositoryToken(ChatRoom),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChatRoomMember),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChatRoomService>(ChatRoomService);
    chatRoomRepository = module.get(getRepositoryToken(ChatRoom));
    memberRepository = module.get(getRepositoryToken(ChatRoomMember));
    workspaceMemberRepository = module.get(getRepositoryToken(WorkspaceMember));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRoom', () => {
    it('should create a room successfully', async () => {
      chatRoomRepository.findOne.mockResolvedValue(null);
      chatRoomRepository.create.mockReturnValue(mockRoom);
      chatRoomRepository.save.mockResolvedValue(mockRoom);
      memberRepository.create.mockReturnValue(mockMember);
      memberRepository.save.mockResolvedValue(mockMember);

      const result = await service.createRoom(mockWorkspaceId, mockUserId, {
        name: 'general',
        type: ChatRoomType.GROUP,
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('general');
      expect(chatRoomRepository.save).toHaveBeenCalled();
      expect(memberRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException when project room lacks projectId', async () => {
      await expect(
        service.createRoom(mockWorkspaceId, mockUserId, {
          name: 'project-room',
          type: ChatRoomType.PROJECT,
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getRoom', () => {
    it('should return a room when found', async () => {
      chatRoomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.count.mockResolvedValue(1);

      const result = await service.getRoom(mockRoomId, mockUserId);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockRoomId);
    });

    it('should throw NotFoundException when room not found', async () => {
      chatRoomRepository.findOne.mockResolvedValue(null);

      await expect(service.getRoom('invalid-id', mockUserId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw ForbiddenException for private room non-member', async () => {
      const privateRoom = { ...mockRoom, isPrivate: true };
      chatRoomRepository.findOne.mockResolvedValue(privateRoom);
      memberRepository.count.mockResolvedValue(0);

      await expect(service.getRoom(mockRoomId, 'other-user')).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('updateRoom', () => {
    it('should update a room when user has permission', async () => {
      chatRoomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.findOne.mockResolvedValue(mockMember);
      memberRepository.count.mockResolvedValue(1);
      chatRoomRepository.save.mockResolvedValue({
        ...mockRoom,
        name: 'updated-name',
      });

      const result = await service.updateRoom(mockRoomId, mockUserId, {
        name: 'updated-name',
      });

      expect(result.name).toBe('updated-name');
      expect(chatRoomRepository.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user lacks permission', async () => {
      chatRoomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.count.mockResolvedValue(1);
      memberRepository.findOne.mockResolvedValue({
        ...mockMember,
        role: ChatRoomMemberRole.MEMBER,
      });

      await expect(
        service.updateRoom(mockRoomId, mockUserId, { name: 'new-name' })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteRoom', () => {
    it('should delete a room when user is owner', async () => {
      chatRoomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.count.mockResolvedValue(1);
      memberRepository.findOne.mockResolvedValue(mockMember);
      chatRoomRepository.remove.mockResolvedValue(mockRoom);

      await service.deleteRoom(mockRoomId, mockUserId);

      expect(chatRoomRepository.remove).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not owner', async () => {
      chatRoomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.count.mockResolvedValue(1);
      memberRepository.findOne.mockResolvedValue({
        ...mockMember,
        role: ChatRoomMemberRole.ADMIN,
      });

      await expect(service.deleteRoom(mockRoomId, mockUserId)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('addMembers', () => {
    it('should add members successfully', async () => {
      chatRoomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.findOne.mockResolvedValue(mockMember);
      memberRepository.find.mockResolvedValue([]);
      memberRepository.create.mockReturnValue({} as ChatRoomMember);
      memberRepository.save.mockResolvedValue({} as any);
      chatRoomRepository.save.mockResolvedValue(mockRoom);
      workspaceMemberRepository.findOne.mockResolvedValue({
        role: WorkspaceRole.ADMIN,
      } as WorkspaceMember);

      await service.addMembers(mockRoomId, ['user-456'], 'user', mockUserId);

      expect(memberRepository.save).toHaveBeenCalled();
    });

    it('should skip already existing members', async () => {
      chatRoomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.findOne.mockResolvedValue(mockMember);
      memberRepository.find.mockResolvedValue([{ userId: 'user-456' } as ChatRoomMember]);
      workspaceMemberRepository.findOne.mockResolvedValue({
        role: WorkspaceRole.ADMIN,
      } as WorkspaceMember);

      await service.addMembers(mockRoomId, ['user-456'], 'user', mockUserId);

      // save should not be called since member already exists
      expect(memberRepository.save).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ userId: 'user-456' })])
      );
    });
  });

  describe('removeMember', () => {
    it('should remove a member when user has permission', async () => {
      chatRoomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.findOne.mockImplementation(({ where }: any) => {
        if (where.userId === mockUserId) {
          return Promise.resolve(mockMember);
        }
        return Promise.resolve({
          ...mockMember,
          userId: 'user-456',
          role: ChatRoomMemberRole.MEMBER,
        });
      });
      memberRepository.remove.mockResolvedValue({} as any);
      chatRoomRepository.save.mockResolvedValue(mockRoom);

      await service.removeMember(mockRoomId, 'user-456', 'user', mockUserId);

      expect(memberRepository.remove).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when trying to remove owner', async () => {
      chatRoomRepository.findOne.mockResolvedValue(mockRoom);
      memberRepository.findOne.mockResolvedValue(mockMember);

      await expect(
        service.removeMember(mockRoomId, mockUserId, 'user', 'other-user')
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('isMember', () => {
    it('should return true when user is member', async () => {
      memberRepository.count.mockResolvedValue(1);

      const result = await service.isMember(mockRoomId, mockUserId);

      expect(result).toBe(true);
    });

    it('should return false when user is not member', async () => {
      memberRepository.count.mockResolvedValue(0);

      const result = await service.isMember(mockRoomId, 'other-user');

      expect(result).toBe(false);
    });
  });

  describe('isOwner', () => {
    it('should return true when user is owner', async () => {
      memberRepository.findOne.mockResolvedValue(mockMember);

      const result = await service.isOwner(mockRoomId, mockUserId);

      expect(result).toBe(true);
    });

    it('should return false when user is not owner', async () => {
      memberRepository.findOne.mockResolvedValue({
        ...mockMember,
        role: ChatRoomMemberRole.ADMIN,
      });

      const result = await service.isOwner(mockRoomId, mockUserId);

      expect(result).toBe(false);
    });
  });

  describe('updateMemberRole', () => {
    it('should update member role when owner requests', async () => {
      memberRepository.findOne.mockImplementation(({ where }: any) => {
        if (where.userId === mockUserId) {
          return Promise.resolve(mockMember);
        }
        return Promise.resolve({
          ...mockMember,
          userId: 'user-456',
          role: ChatRoomMemberRole.MEMBER,
        });
      });
      memberRepository.save.mockResolvedValue({} as any);

      await service.updateMemberRole(
        mockRoomId,
        'user-456',
        ChatRoomMemberRole.ADMIN,
        mockUserId
      );

      expect(memberRepository.save).toHaveBeenCalled();
    });
  });
});
