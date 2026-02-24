/**
 * DiscordUserLinkService Tests
 * Story 21.4: Discord Bot (Optional) (AC10)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscordUserLinkService } from '../services/discord-user-link.service';
import { DiscordUserLink } from '../../../../database/entities/discord-user-link.entity';
import { DiscordIntegration } from '../../../../database/entities/discord-integration.entity';
import { User } from '../../../../database/entities/user.entity';
import { RedisService } from '../../../redis/redis.service';

describe('DiscordUserLinkService', () => {
  let service: DiscordUserLinkService;
  let linkRepo: jest.Mocked<Repository<DiscordUserLink>>;
  let integrationRepo: jest.Mocked<Repository<DiscordIntegration>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let redisService: jest.Mocked<RedisService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockIntegrationId = '22222222-2222-2222-2222-222222222222';
  const mockDevosUserId = '33333333-3333-3333-3333-333333333333';
  const mockDiscordUserId = '987654321098765432';
  const mockLinkToken = 'a'.repeat(64);
  const mockLinkId = '55555555-5555-5555-5555-555555555555';

  const mockIntegration: Partial<DiscordIntegration> = {
    id: mockIntegrationId,
    workspaceId: mockWorkspaceId,
    status: 'active',
  };

  const mockLink: Partial<DiscordUserLink> = {
    id: mockLinkId,
    workspaceId: mockWorkspaceId,
    discordIntegrationId: mockIntegrationId,
    devosUserId: mockDevosUserId,
    discordUserId: mockDiscordUserId,
    discordUsername: 'testuser',
    discordDisplayName: 'Test User',
    status: 'linked',
    linkToken: null,
    linkTokenExpiresAt: null,
    linkedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPendingLink: Partial<DiscordUserLink> = {
    id: mockLinkId,
    workspaceId: mockWorkspaceId,
    discordIntegrationId: mockIntegrationId,
    devosUserId: '00000000-0000-0000-0000-000000000000',
    discordUserId: mockDiscordUserId,
    discordUsername: 'testuser',
    status: 'pending',
    linkToken: mockLinkToken,
    linkTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min from now
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordUserLinkService,
        {
          provide: getRepositoryToken(DiscordUserLink),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(DiscordIntegration),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:3000'),
          },
        },
      ],
    }).compile();

    service = module.get<DiscordUserLinkService>(DiscordUserLinkService);
    linkRepo = module.get(getRepositoryToken(DiscordUserLink));
    integrationRepo = module.get(getRepositoryToken(DiscordIntegration));
    userRepo = module.get(getRepositoryToken(User));
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
  });

  describe('initiateLinking', () => {
    it('generates a unique link token with 10-min expiry', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      linkRepo.findOne
        .mockResolvedValueOnce(null) // No existing linked
        .mockResolvedValueOnce(null); // No existing pending
      linkRepo.create.mockReturnValue({
        ...mockPendingLink,
      } as DiscordUserLink);
      linkRepo.save.mockResolvedValue(mockPendingLink as DiscordUserLink);

      const result = await service.initiateLinking(
        mockWorkspaceId,
        mockDiscordUserId,
        'testuser',
        'Test User',
      );

      expect(result.linkUrl).toContain('token=');
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000 + 1000);
    });

    it('returns a well-formed link URL', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration as DiscordIntegration);
      linkRepo.findOne.mockResolvedValue(null);
      linkRepo.create.mockReturnValue(mockPendingLink as DiscordUserLink);
      linkRepo.save.mockResolvedValue(mockPendingLink as DiscordUserLink);

      const result = await service.initiateLinking(
        mockWorkspaceId,
        mockDiscordUserId,
      );

      expect(result.linkUrl).toMatch(/^http:\/\/localhost:3000\/integrations\/discord\/link\?token=/);
    });
  });

  describe('completeLinking', () => {
    it('validates token and creates link record', async () => {
      linkRepo.findOne
        .mockResolvedValueOnce(mockPendingLink as DiscordUserLink) // find by token
        .mockResolvedValueOnce(null) // no existing devos link
        .mockResolvedValueOnce(null); // no existing discord link

      const saved = { ...mockPendingLink, status: 'linked', devosUserId: mockDevosUserId };
      linkRepo.save.mockResolvedValue(saved as DiscordUserLink);

      const result = await service.completeLinking(mockLinkToken, mockDevosUserId);

      expect(result.status).toBe('linked');
      expect(linkRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          devosUserId: mockDevosUserId,
          status: 'linked',
          linkToken: null,
        }),
      );
    });

    it('rejects expired token', async () => {
      const expiredLink = {
        ...mockPendingLink,
        linkTokenExpiresAt: new Date(Date.now() - 60000), // expired 1 min ago
      };
      linkRepo.findOne.mockResolvedValueOnce(expiredLink as DiscordUserLink);

      await expect(
        service.completeLinking(mockLinkToken, mockDevosUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects already-used token (not found)', async () => {
      linkRepo.findOne.mockResolvedValueOnce(null); // Token not found

      await expect(
        service.completeLinking('invalid-token', mockDevosUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects if Discord user already linked to another DevOS user', async () => {
      linkRepo.findOne
        .mockResolvedValueOnce(mockPendingLink as DiscordUserLink) // find by token
        .mockResolvedValueOnce(null) // no existing devos link
        .mockResolvedValueOnce(mockLink as DiscordUserLink); // existing discord link!

      await expect(
        service.completeLinking(mockLinkToken, mockDevosUserId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findDevosUserByDiscordId', () => {
    it('returns cached result from Redis', async () => {
      redisService.get.mockResolvedValue(mockDevosUserId);

      const result = await service.findDevosUserByDiscordId(mockWorkspaceId, mockDiscordUserId);

      expect(result).toBe(mockDevosUserId);
      expect(linkRepo.findOne).not.toHaveBeenCalled();
    });

    it('falls back to DB and caches result', async () => {
      redisService.get.mockResolvedValue(null);
      linkRepo.findOne.mockResolvedValue(mockLink as DiscordUserLink);

      const result = await service.findDevosUserByDiscordId(mockWorkspaceId, mockDiscordUserId);

      expect(result).toBe(mockDevosUserId);
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining(mockDiscordUserId),
        mockDevosUserId,
        expect.any(Number),
      );
    });

    it('returns null for unknown Discord user', async () => {
      redisService.get.mockResolvedValue(null);
      linkRepo.findOne.mockResolvedValue(null);

      const result = await service.findDevosUserByDiscordId(mockWorkspaceId, 'unknown-id');

      expect(result).toBeNull();
      // Should cache the null result
      expect(redisService.set).toHaveBeenCalledWith(
        expect.any(String),
        'null',
        expect.any(Number),
      );
    });
  });

  describe('unlinkUser', () => {
    it('removes link and invalidates cache', async () => {
      linkRepo.findOne.mockResolvedValue(mockLink as DiscordUserLink);
      linkRepo.save.mockResolvedValue({ ...mockLink, status: 'unlinked' } as DiscordUserLink);

      await service.unlinkUser(mockWorkspaceId, mockDiscordUserId);

      expect(linkRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unlinked' }),
      );
      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('listLinks', () => {
    it('returns all links for workspace', async () => {
      linkRepo.find.mockResolvedValue([mockLink as DiscordUserLink]);

      const result = await service.listLinks(mockWorkspaceId);

      expect(result).toHaveLength(1);
      expect(linkRepo.find).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId },
        order: { createdAt: 'DESC' },
      });
    });
  });
});
