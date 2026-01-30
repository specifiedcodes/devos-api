import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { WorkspacesService } from '../workspaces.service';
import { Workspace } from '../../../database/entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { User } from '../../../database/entities/user.entity';
import { SecurityEvent } from '../../../database/entities/security-event.entity';
import { RedisService } from '../../redis/redis.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('WorkspacesService - switchWorkspace', () => {
  let service: WorkspacesService;
  let workspaceRepository: jest.Mocked<Repository<Workspace>>;
  let workspaceMemberRepository: jest.Mocked<Repository<WorkspaceMember>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let securityEventRepository: jest.Mocked<Repository<SecurityEvent>>;
  let jwtService: jest.Mocked<JwtService>;
  let redisService: jest.Mocked<RedisService>;
  let dataSource: jest.Mocked<DataSource>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    currentWorkspaceId: 'workspace-old',
  };

  const mockWorkspace = {
    id: 'workspace-new',
    name: 'New Workspace',
    description: 'Test workspace',
    schemaName: 'workspace_new',
    ownerUserId: 'user-123',
    createdAt: new Date(),
    deletedAt: null,
  };

  const mockMembership = {
    id: 'member-123',
    userId: 'user-123',
    workspaceId: 'workspace-new',
    role: WorkspaceRole.DEVELOPER,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        {
          provide: getRepositoryToken(Workspace),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SecurityEvent),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            keys: jest.fn(),
            get: jest.fn(),
            set: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
    workspaceRepository = module.get(getRepositoryToken(Workspace));
    workspaceMemberRepository = module.get(getRepositoryToken(WorkspaceMember));
    userRepository = module.get(getRepositoryToken(User));
    securityEventRepository = module.get(getRepositoryToken(SecurityEvent));
    jwtService = module.get(JwtService);
    redisService = module.get(RedisService);
    dataSource = module.get(DataSource);
  });

  it('should switch workspace successfully for valid member', async () => {
    // Arrange
    workspaceRepository.findOne.mockResolvedValue(mockWorkspace as any);
    workspaceMemberRepository.findOne.mockResolvedValue(mockMembership as any);
    userRepository.findOne.mockResolvedValue(mockUser as any);
    userRepository.update.mockResolvedValue({ affected: 1 } as any);
    workspaceMemberRepository.count.mockResolvedValue(3);
    dataSource.query.mockResolvedValue([{ count: 5 }]);
    redisService.keys.mockResolvedValue(['session:user-123:session-1']);
    redisService.get.mockResolvedValue(
      JSON.stringify({
        session_id: 'session-1',
        user_id: 'user-123',
        workspace_id: 'workspace-old',
        access_token_jti: 'jti-123',
        refresh_token_jti: 'jti-456',
        expires_at: new Date(Date.now() + 86400000),
      }),
    );
    redisService.set.mockResolvedValue('OK' as any);
    jwtService.sign.mockReturnValue('mock-token');
    securityEventRepository.create.mockReturnValue({} as any);
    securityEventRepository.save.mockResolvedValue({} as any);

    // Act
    const result = await service.switchWorkspace(
      'user-123',
      'workspace-new',
      'jti-123',
      '127.0.0.1',
      'test-agent',
    );

    // Assert
    expect(result).toHaveProperty('workspace');
    expect(result).toHaveProperty('tokens');
    expect(result.workspace.id).toBe('workspace-new');
    expect(result.workspace.name).toBe('New Workspace');
    expect(result.workspace.isCurrentWorkspace).toBe(true);
    expect(result.tokens).toHaveProperty('access_token');
    expect(result.tokens).toHaveProperty('refresh_token');
    expect(userRepository.update).toHaveBeenCalledWith('user-123', {
      currentWorkspaceId: 'workspace-new',
    });
  });

  it('should throw NotFoundException if workspace does not exist', async () => {
    // Arrange
    workspaceRepository.findOne.mockResolvedValue(null);

    // Act & Assert
    await expect(
      service.switchWorkspace('user-123', 'non-existent', 'jti-123', '127.0.0.1', 'test-agent'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException if user is not member', async () => {
    // Arrange
    workspaceRepository.findOne.mockResolvedValue(mockWorkspace as any);
    workspaceMemberRepository.findOne.mockResolvedValue(null);

    // Act & Assert
    await expect(
      service.switchWorkspace('user-123', 'workspace-new', 'jti-123', '127.0.0.1', 'test-agent'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should update user.currentWorkspaceId in database', async () => {
    // Arrange
    workspaceRepository.findOne.mockResolvedValue(mockWorkspace as any);
    workspaceMemberRepository.findOne.mockResolvedValue(mockMembership as any);
    userRepository.findOne.mockResolvedValue(mockUser as any);
    userRepository.update.mockResolvedValue({ affected: 1 } as any);
    workspaceMemberRepository.count.mockResolvedValue(3);
    dataSource.query.mockResolvedValue([{ count: 5 }]);
    redisService.keys.mockResolvedValue([]);
    redisService.set.mockResolvedValue('OK' as any);
    jwtService.sign.mockReturnValue('mock-token');
    securityEventRepository.create.mockReturnValue({} as any);
    securityEventRepository.save.mockResolvedValue({} as any);

    // Act
    await service.switchWorkspace('user-123', 'workspace-new', 'jti-123', '127.0.0.1', 'test-agent');

    // Assert
    expect(userRepository.update).toHaveBeenCalledWith('user-123', {
      currentWorkspaceId: 'workspace-new',
    });
  });

  it('should generate new tokens with updated workspace_id', async () => {
    // Arrange
    workspaceRepository.findOne.mockResolvedValue(mockWorkspace as any);
    workspaceMemberRepository.findOne.mockResolvedValue(mockMembership as any);
    userRepository.findOne.mockResolvedValue(mockUser as any);
    userRepository.update.mockResolvedValue({ affected: 1 } as any);
    workspaceMemberRepository.count.mockResolvedValue(3);
    dataSource.query.mockResolvedValue([{ count: 5 }]);
    redisService.keys.mockResolvedValue([]);
    redisService.set.mockResolvedValue('OK' as any);
    jwtService.sign.mockReturnValue('mock-token');
    securityEventRepository.create.mockReturnValue({} as any);
    securityEventRepository.save.mockResolvedValue({} as any);

    // Act
    const result = await service.switchWorkspace(
      'user-123',
      'workspace-new',
      'jti-123',
      '127.0.0.1',
      'test-agent',
    );

    // Assert
    expect(jwtService.sign).toHaveBeenCalled();
    const signCalls = (jwtService.sign as jest.Mock).mock.calls;
    const accessTokenCall = signCalls.find((call) => call[0].jti);
    expect(accessTokenCall[0]).toHaveProperty('workspaceId', 'workspace-new');
  });

  it('should log WORKSPACE_SWITCHED security event', async () => {
    // Arrange
    workspaceRepository.findOne.mockResolvedValue(mockWorkspace as any);
    workspaceMemberRepository.findOne.mockResolvedValue(mockMembership as any);
    userRepository.findOne.mockResolvedValue(mockUser as any);
    userRepository.update.mockResolvedValue({ affected: 1 } as any);
    workspaceMemberRepository.count.mockResolvedValue(3);
    dataSource.query.mockResolvedValue([{ count: 5 }]);
    redisService.keys.mockResolvedValue([]);
    redisService.set.mockResolvedValue('OK' as any);
    jwtService.sign.mockReturnValue('mock-token');
    securityEventRepository.create.mockReturnValue({} as any);
    securityEventRepository.save.mockResolvedValue({} as any);

    // Act
    await service.switchWorkspace('user-123', 'workspace-new', 'jti-123', '127.0.0.1', 'test-agent');

    // Assert
    expect(securityEventRepository.save).toHaveBeenCalled();
  });
});
