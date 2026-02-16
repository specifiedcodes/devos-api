import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { SuperAdminGuard } from '../guards/super-admin.guard';

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;
  let mockUserRepository: any;

  beforeEach(() => {
    mockUserRepository = {
      findOne: jest.fn(),
    };
    guard = new SuperAdminGuard(mockUserRepository);
  });

  const createMockContext = (user?: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  };

  it('should allow access when user.isPlatformAdmin is true', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-1',
      isPlatformAdmin: true,
    });

    const context = createMockContext({ userId: 'user-1' });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when user.isPlatformAdmin is false', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-1',
      isPlatformAdmin: false,
    });

    const context = createMockContext({ userId: 'user-1' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Platform administrator access required',
    );
  });

  it('should throw ForbiddenException when user not found', async () => {
    mockUserRepository.findOne.mockResolvedValue(null);

    const context = createMockContext({ userId: 'non-existent' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should throw ForbiddenException when no userId in request', async () => {
    const context = createMockContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Authentication required',
    );
  });

  it('should throw ForbiddenException when no user in request', async () => {
    const context = createMockContext(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should support both .userId and .id for extracting userId', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-2',
      isPlatformAdmin: true,
    });

    // Test with .id fallback
    const context = createMockContext({ id: 'user-2' });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should query userRepository with correct userId and select fields', async () => {
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-1',
      isPlatformAdmin: true,
    });

    const context = createMockContext({ userId: 'user-1' });
    await guard.canActivate(context);

    expect(mockUserRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: ['id', 'isPlatformAdmin'],
    });
  });
});
