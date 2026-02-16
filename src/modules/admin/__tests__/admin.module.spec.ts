import { Test, TestingModule } from '@nestjs/testing';
import { AdminUsersController } from '../controllers/admin-users.controller';
import { AdminUsersService } from '../services/admin-users.service';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminBootstrapService } from '../services/admin-bootstrap.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../../database/entities/user.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { Project } from '../../../database/entities/project.entity';
import { SecurityEvent } from '../../../database/entities/security-event.entity';
import { AuditLog } from '../../../database/entities/audit-log.entity';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ConfigService } from '@nestjs/config';

describe('AdminModule', () => {
  let module: TestingModule;

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
    }),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
  };

  const mockRedisService = {
    scanKeys: jest.fn().mockResolvedValue([]),
    del: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [],
      controllers: [AdminUsersController],
      providers: [
        AdminUsersService,
        SuperAdminGuard,
        AdminBootstrapService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(SecurityEvent),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should have AdminUsersController registered', () => {
    const controller = module.get<AdminUsersController>(AdminUsersController);
    expect(controller).toBeDefined();
  });

  it('should have AdminUsersService registered', () => {
    const service = module.get<AdminUsersService>(AdminUsersService);
    expect(service).toBeDefined();
  });

  it('should have SuperAdminGuard registered', () => {
    const guard = module.get<SuperAdminGuard>(SuperAdminGuard);
    expect(guard).toBeDefined();
  });

  it('should have AdminBootstrapService registered', () => {
    const bootstrap = module.get<AdminBootstrapService>(AdminBootstrapService);
    expect(bootstrap).toBeDefined();
  });
});
