import { AdminBootstrapService } from '../services/admin-bootstrap.service';

describe('AdminBootstrapService', () => {
  let service: AdminBootstrapService;
  let mockConfigService: any;
  let mockUserRepository: any;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn(),
    };

    mockUserRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((user) => Promise.resolve(user)),
    };

    service = new AdminBootstrapService(mockConfigService, mockUserRepository);

    // Spy on logger
    logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation();
    jest.spyOn((service as any).logger, 'warn').mockImplementation();
    jest.spyOn((service as any).logger, 'error').mockImplementation();
  });

  it('should promote user to platform admin when PLATFORM_ADMIN_EMAIL is set', async () => {
    mockConfigService.get.mockReturnValue('admin@example.com');
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      isPlatformAdmin: false,
    });

    await service.onModuleInit();

    expect(mockUserRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        isPlatformAdmin: true,
      }),
    );
  });

  it('should do nothing when PLATFORM_ADMIN_EMAIL is not set', async () => {
    mockConfigService.get.mockReturnValue(undefined);

    await service.onModuleInit();

    expect(mockUserRepository.findOne).not.toHaveBeenCalled();
    expect(mockUserRepository.save).not.toHaveBeenCalled();
  });

  it('should do nothing when email not found in database', async () => {
    mockConfigService.get.mockReturnValue('missing@example.com');
    mockUserRepository.findOne.mockResolvedValue(null);

    await service.onModuleInit();

    expect(mockUserRepository.save).not.toHaveBeenCalled();
  });

  it('should be idempotent - does not re-promote already admin user', async () => {
    mockConfigService.get.mockReturnValue('admin@example.com');
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      isPlatformAdmin: true,
    });

    await service.onModuleInit();

    expect(mockUserRepository.save).not.toHaveBeenCalled();
  });

  it('should log promotion action to console', async () => {
    mockConfigService.get.mockReturnValue('admin@example.com');
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      isPlatformAdmin: false,
    });

    await service.onModuleInit();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Promoted admin@example.com to platform admin'),
    );
  });
});
