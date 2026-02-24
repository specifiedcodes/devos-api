/**
 * ApiTokenService Tests
 * Story 20-10: Permission Analytics
 * Target: 18 tests
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ApiTokenService } from '../services/api-token.service';
import { ApiToken } from '../../../database/entities/api-token.entity';
import { RedisService } from '../../redis/redis.service';
import { ApiTokenScope } from '../dto/create-api-token.dto';

describe('ApiTokenService', () => {
  let service: ApiTokenService;
  let tokenRepo: jest.Mocked<Repository<ApiToken>>;
  let redisService: jest.Mocked<RedisService>;
  let mockDataSource: { transaction: jest.Mock };

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockActorId = '22222222-2222-2222-2222-222222222222';
  const mockTokenId = '33333333-3333-3333-3333-333333333333';

  const mockQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  beforeEach(async () => {
    // Mock DataSource.transaction to execute callback with a mock manager
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (manager: any) => Promise<any>) => {
        const manager = {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockImplementation((_entity: any, dto: any) => ({ ...dto, id: mockTokenId })),
          save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: mockTokenId, createdAt: new Date(), updatedAt: new Date() })),
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiTokenService,
        {
          provide: getRepositoryToken(ApiToken),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockImplementation((dto) => ({ ...dto, id: mockTokenId })),
            save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity, id: mockTokenId, createdAt: new Date(), updatedAt: new Date() })),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ApiTokenService>(ApiTokenService);
    tokenRepo = module.get(getRepositoryToken(ApiToken));
    redisService = module.get(RedisService);
  });

  describe('createToken', () => {
    it('generates dvos_ prefixed token', async () => {
      const dto = { name: 'Test Token', scopes: [ApiTokenScope.PERMISSIONS_CHECK] };
      const result = await service.createToken(mockWorkspaceId, dto, mockActorId);

      expect(result.rawToken).toMatch(/^dvos_/);
      expect(result.rawToken.length).toBeGreaterThan(8);
    });

    it('stores bcrypt hash (not plaintext)', async () => {
      const dto = { name: 'Test Token', scopes: [ApiTokenScope.PERMISSIONS_CHECK] };
      const result = await service.createToken(mockWorkspaceId, dto, mockActorId);

      // The transaction callback receives a manager; check the saved entity via transaction
      const transactionCb = mockDataSource.transaction.mock.calls[0][0];
      const mockManager = {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation((_entity: any, dto: any) => dto),
        save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: mockTokenId })),
      };
      await transactionCb(mockManager);
      const savedEntity = mockManager.create.mock.results[0].value;
      expect(savedEntity.tokenHash).not.toBe(result.rawToken);
      expect(savedEntity.tokenHash).toMatch(/^\$2[aby]\$/);
    });

    it('enforces workspace limit of 25', async () => {
      mockDataSource.transaction.mockImplementation(async (cb: (manager: any) => Promise<any>) => {
        const manager = {
          count: jest.fn().mockResolvedValue(25),
          create: jest.fn(),
          save: jest.fn(),
        };
        return cb(manager);
      });
      const dto = { name: 'Test Token', scopes: [ApiTokenScope.PERMISSIONS_CHECK] };

      await expect(service.createToken(mockWorkspaceId, dto, mockActorId))
        .rejects.toThrow(BadRequestException);
    });

    it('validates scopes against enum', async () => {
      const dto = { name: 'Test Token', scopes: ['invalid:scope'] };

      await expect(service.createToken(mockWorkspaceId, dto, mockActorId))
        .rejects.toThrow(BadRequestException);
    });

    it('handles optional expiry', async () => {
      let capturedEntity: any = null;
      mockDataSource.transaction.mockImplementation(async (cb: (manager: any) => Promise<any>) => {
        const manager = {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockImplementation((_entity: any, dto: any) => {
            capturedEntity = dto;
            return dto;
          }),
          save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: mockTokenId, createdAt: new Date(), updatedAt: new Date() })),
        };
        return cb(manager);
      });
      const dto = {
        name: 'Test Token',
        scopes: [ApiTokenScope.PERMISSIONS_CHECK],
        expiresAt: '2027-01-01T00:00:00Z',
      };
      await service.createToken(mockWorkspaceId, dto, mockActorId);

      expect(capturedEntity.expiresAt).toEqual(new Date('2027-01-01T00:00:00Z'));
    });
  });

  describe('listTokens', () => {
    it('returns tokens without tokenHash', async () => {
      const mockToken: Partial<ApiToken> = {
        id: mockTokenId,
        workspaceId: mockWorkspaceId,
        name: 'Test',
        tokenHash: '$2b$12$secret',
        tokenPrefix: 'dvos_abc',
        scopes: ['permissions:check'],
        isActive: true,
        lastUsedAt: null,
        expiresAt: null,
        createdBy: mockActorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tokenRepo.find.mockResolvedValue([mockToken as ApiToken]);

      const result = await service.listTokens(mockWorkspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].tokenHash).toBe('');
    });

    it('orders by createdAt desc', async () => {
      await service.listTokens(mockWorkspaceId);

      expect(tokenRepo.find).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('revokeToken', () => {
    it('deactivates token', async () => {
      const mockToken = {
        id: mockTokenId,
        workspaceId: mockWorkspaceId,
        isActive: true,
      } as ApiToken;
      tokenRepo.findOne.mockResolvedValue(mockToken);

      await service.revokeToken(mockWorkspaceId, mockTokenId, mockActorId);

      expect(tokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('validates workspace ownership', async () => {
      tokenRepo.findOne.mockResolvedValue(null);

      await expect(
        service.revokeToken(mockWorkspaceId, mockTokenId, mockActorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('invalidates Redis validation cache', async () => {
      const mockToken = {
        id: mockTokenId,
        workspaceId: mockWorkspaceId,
        isActive: true,
      } as ApiToken;
      tokenRepo.findOne.mockResolvedValue(mockToken);

      await service.revokeToken(mockWorkspaceId, mockTokenId, mockActorId);

      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('validateToken', () => {
    it('returns token for valid active token', async () => {
      const rawToken = 'dvos_testtoken1234567890abcdef12345678';
      const hash = await bcrypt.hash(rawToken, 4); // Low cost for test speed
      const mockToken = {
        id: mockTokenId,
        workspaceId: mockWorkspaceId,
        tokenHash: hash,
        tokenPrefix: rawToken.slice(0, 8),
        scopes: ['permissions:check'],
        isActive: true,
        expiresAt: null,
        name: 'Test',
      } as ApiToken;
      tokenRepo.find.mockResolvedValue([mockToken]);

      const result = await service.validateToken(rawToken);

      expect(result).not.toBeNull();
      expect(result!.workspaceId).toBe(mockWorkspaceId);
    });

    it('returns null for invalid token', async () => {
      tokenRepo.find.mockResolvedValue([]);

      const result = await service.validateToken('dvos_invalidtoken123456789012345678');

      expect(result).toBeNull();
    });

    it('returns null for expired token', async () => {
      const rawToken = 'dvos_testtoken1234567890abcdef12345678';
      const hash = await bcrypt.hash(rawToken, 4);
      const mockToken = {
        id: mockTokenId,
        workspaceId: mockWorkspaceId,
        tokenHash: hash,
        tokenPrefix: rawToken.slice(0, 8),
        scopes: ['permissions:check'],
        isActive: true,
        expiresAt: new Date('2020-01-01'),
      } as ApiToken;
      tokenRepo.find.mockResolvedValue([mockToken]);

      const result = await service.validateToken(rawToken);

      expect(result).toBeNull();
    });

    it('returns null for non-dvos_ prefixed token', async () => {
      const result = await service.validateToken('jwt_token_here');

      expect(result).toBeNull();
    });

    it('updates lastUsedAt on validation', async () => {
      const rawToken = 'dvos_testtoken1234567890abcdef12345678';
      const hash = await bcrypt.hash(rawToken, 4);
      const mockToken = {
        id: mockTokenId,
        workspaceId: mockWorkspaceId,
        tokenHash: hash,
        tokenPrefix: rawToken.slice(0, 8),
        scopes: ['permissions:check'],
        isActive: true,
        expiresAt: null,
        name: 'Test',
      } as ApiToken;
      tokenRepo.find.mockResolvedValue([mockToken]);

      await service.validateToken(rawToken);

      expect(tokenRepo.update).toHaveBeenCalledWith(
        mockTokenId,
        expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      );
    });

    it('uses cache on repeated validation', async () => {
      const rawToken = 'dvos_testtoken1234567890abcdef12345678';
      const hash = await bcrypt.hash(rawToken, 4);
      const cachedData = JSON.stringify({
        id: mockTokenId,
        workspaceId: mockWorkspaceId,
        tokenHash: hash,
        scopes: ['permissions:check'],
        isActive: true,
        expiresAt: null,
        name: 'Test',
        tokenPrefix: rawToken.slice(0, 8),
      });
      redisService.get.mockResolvedValue(cachedData);

      const result = await service.validateToken(rawToken);

      expect(result).not.toBeNull();
      // Should not query DB when cache hit
      expect(tokenRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('deactivates expired tokens', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 3 });

      const count = await service.cleanupExpiredTokens();

      expect(count).toBe(3);
    });

    it('returns correct count', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 0 });

      const count = await service.cleanupExpiredTokens();

      expect(count).toBe(0);
    });
  });
});
