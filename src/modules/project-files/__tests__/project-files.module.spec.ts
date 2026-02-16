/**
 * ProjectFilesModule Tests
 * Story 16.2: File Upload/Download API (AC6)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ProjectFilesService } from '../project-files.service';
import { ProjectFilesController } from '../project-files.controller';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectFile } from '../../../database/entities/project-file.entity';
import { Project } from '../../../database/entities/project.entity';
import { FileStorageService } from '../../file-storage/file-storage.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';

describe('ProjectFilesModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ProjectFilesService,
        {
          provide: getRepositoryToken(ProjectFile),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            softDelete: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              getOne: jest.fn(),
              getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
              getRawOne: jest.fn().mockResolvedValue({ totalFiles: '0', totalSizeBytes: '0' }),
            }),
          },
        },
        {
          provide: getRepositoryToken(Project),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: FileStorageService,
          useValue: {
            upload: jest.fn(),
            download: jest.fn(),
            getSignedUrl: jest.fn(),
            buildKey: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
      controllers: [ProjectFilesController],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();
  });

  it('should compile the module successfully', () => {
    expect(module).toBeDefined();
  });

  it('should provide ProjectFilesService', () => {
    const service = module.get<ProjectFilesService>(ProjectFilesService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ProjectFilesService);
  });

  it('should register ProjectFilesController', () => {
    const controller = module.get<ProjectFilesController>(ProjectFilesController);
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(ProjectFilesController);
  });

  it('should have ProjectFile repository available', () => {
    const repo = module.get(getRepositoryToken(ProjectFile));
    expect(repo).toBeDefined();
  });

  it('should have Project repository available', () => {
    const repo = module.get(getRepositoryToken(Project));
    expect(repo).toBeDefined();
  });

  it('should have FileStorageService available (from @Global module)', () => {
    const storageService = module.get<FileStorageService>(FileStorageService);
    expect(storageService).toBeDefined();
  });

  it('should have AuditService available', () => {
    const auditService = module.get<AuditService>(AuditService);
    expect(auditService).toBeDefined();
  });
});
