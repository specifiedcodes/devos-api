/**
 * DiscordUserLinkService
 * Story 21.4: Discord Bot (Optional) (AC3)
 *
 * Service for managing Discord user to DevOS user linking.
 * Follows the same pattern as SlackUserMappingService from Story 21-1.
 * Uses a one-time token flow: Discord user receives a link URL via ephemeral
 * message, clicks it while logged into DevOS to complete the link.
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DiscordUserLink } from '../../../../database/entities/discord-user-link.entity';
import { DiscordIntegration } from '../../../../database/entities/discord-integration.entity';
import { User } from '../../../../database/entities/user.entity';
import { RedisService } from '../../../redis/redis.service';

const CACHE_PREFIX = 'discord-user-link:';
const CACHE_TTL = 600; // 10 minutes
const LINK_TOKEN_EXPIRY_MINUTES = 10;

@Injectable()
export class DiscordUserLinkService {
  private readonly logger = new Logger(DiscordUserLinkService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(DiscordUserLink)
    private readonly linkRepo: Repository<DiscordUserLink>,
    @InjectRepository(DiscordIntegration)
    private readonly integrationRepo: Repository<DiscordIntegration>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  /**
   * Initiate linking flow: generate a one-time token and return a link URL.
   * Token expires in 10 minutes. The Discord user clicks the link in their browser
   * while logged into DevOS to complete the link.
   */
  async initiateLinking(
    workspaceId: string,
    discordUserId: string,
    discordUsername?: string,
    discordDisplayName?: string,
  ): Promise<{ linkUrl: string; expiresAt: Date }> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      throw new NotFoundException('No Discord integration found for workspace');
    }

    // Check if already linked
    const existingLink = await this.linkRepo.findOne({
      where: { workspaceId, discordUserId, status: 'linked' },
    });
    if (existingLink) {
      throw new ConflictException('This Discord account is already linked to a DevOS user');
    }

    // Generate one-time token
    const linkToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + LINK_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    // Check for existing pending link and update, or create new
    const existingPending = await this.linkRepo.findOne({
      where: { workspaceId, discordUserId, status: 'pending' },
    });

    if (existingPending) {
      existingPending.linkToken = linkToken;
      existingPending.linkTokenExpiresAt = expiresAt;
      existingPending.discordUsername = discordUsername;
      existingPending.discordDisplayName = discordDisplayName;
      await this.linkRepo.save(existingPending);
    } else {
      const link = this.linkRepo.create({
        workspaceId,
        discordIntegrationId: integration.id,
        devosUserId: '00000000-0000-0000-0000-000000000000', // Placeholder until link completes
        discordUserId,
        discordUsername,
        discordDisplayName,
        status: 'pending',
        linkToken,
        linkTokenExpiresAt: expiresAt,
      });
      await this.linkRepo.save(link);
    }

    const linkUrl = `${this.frontendUrl}/integrations/discord/link?token=${encodeURIComponent(linkToken)}`;

    return { linkUrl, expiresAt };
  }

  /**
   * Complete linking: user provides the link token from the web UI.
   * Validates token, maps Discord user to DevOS user.
   */
  async completeLinking(linkToken: string, devosUserId: string): Promise<DiscordUserLink> {
    const link = await this.linkRepo.findOne({
      where: { linkToken, status: 'pending' },
    });

    if (!link) {
      throw new BadRequestException('Invalid or expired link token');
    }

    // Check token expiry
    if (link.linkTokenExpiresAt && new Date() > link.linkTokenExpiresAt) {
      throw new BadRequestException('Link token has expired');
    }

    // Check if DevOS user is already linked to another Discord user in this workspace
    const existingDevosLink = await this.linkRepo.findOne({
      where: { workspaceId: link.workspaceId, devosUserId, status: 'linked' },
    });
    if (existingDevosLink) {
      throw new ConflictException('This DevOS account is already linked to a Discord user in this workspace');
    }

    // Check if Discord user is already linked to another DevOS user
    const existingDiscordLink = await this.linkRepo.findOne({
      where: { workspaceId: link.workspaceId, discordUserId: link.discordUserId, status: 'linked' },
    });
    if (existingDiscordLink) {
      throw new ConflictException('This Discord user is already linked to another DevOS account');
    }

    // Complete the link
    link.devosUserId = devosUserId;
    link.status = 'linked';
    link.linkToken = null;
    link.linkTokenExpiresAt = null;
    link.linkedAt = new Date();

    const saved = await this.linkRepo.save(link);

    // Cache the mapping
    await this.cacheUserLink(link.workspaceId, link.discordUserId, devosUserId);

    return saved;
  }

  /**
   * Find DevOS user by Discord user ID for a workspace.
   * Cached in Redis for fast permission lookups.
   */
  async findDevosUserByDiscordId(
    workspaceId: string,
    discordUserId: string,
  ): Promise<string | null> {
    // Check cache
    const cacheKey = `${CACHE_PREFIX}${workspaceId}:discord:${discordUserId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return cached === 'null' ? null : cached;
    }

    const link = await this.linkRepo.findOne({
      where: { workspaceId, discordUserId, status: 'linked' },
    });

    const devosUserId = link ? link.devosUserId : null;

    // Cache the result (including null results to prevent repeated DB lookups)
    await this.redisService.set(cacheKey, devosUserId || 'null', CACHE_TTL);

    return devosUserId;
  }

  /**
   * Find Discord user by DevOS user ID for a workspace.
   */
  async findDiscordUserByDevosId(
    workspaceId: string,
    devosUserId: string,
  ): Promise<string | null> {
    const link = await this.linkRepo.findOne({
      where: { workspaceId, devosUserId, status: 'linked' },
    });

    return link ? link.discordUserId : null;
  }

  /**
   * Unlink a Discord user from a DevOS user.
   */
  async unlinkUser(workspaceId: string, discordUserId: string): Promise<void> {
    const link = await this.linkRepo.findOne({
      where: { workspaceId, discordUserId, status: 'linked' },
    });

    if (!link) {
      throw new NotFoundException('User link not found');
    }

    link.status = 'unlinked';
    link.linkToken = null;
    link.linkTokenExpiresAt = null;
    await this.linkRepo.save(link);

    // Invalidate cache
    await this.invalidateUserLinkCache(workspaceId, discordUserId);
  }

  /**
   * Unlink by link ID (for admin/controller use).
   */
  async unlinkById(workspaceId: string, linkId: string): Promise<void> {
    const link = await this.linkRepo.findOne({
      where: { id: linkId, workspaceId },
    });

    if (!link) {
      throw new NotFoundException('User link not found');
    }

    const discordUserId = link.discordUserId;

    link.status = 'unlinked';
    link.linkToken = null;
    link.linkTokenExpiresAt = null;
    await this.linkRepo.save(link);

    // Invalidate cache
    await this.invalidateUserLinkCache(workspaceId, discordUserId);
  }

  /**
   * List all user links for a workspace.
   */
  async listLinks(workspaceId: string): Promise<DiscordUserLink[]> {
    return this.linkRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Cache a user link mapping in Redis.
   */
  private async cacheUserLink(
    workspaceId: string,
    discordUserId: string,
    devosUserId: string,
  ): Promise<void> {
    const cacheKey = `${CACHE_PREFIX}${workspaceId}:discord:${discordUserId}`;
    await this.redisService.set(cacheKey, devosUserId, CACHE_TTL);
  }

  /**
   * Invalidate user link cache.
   */
  private async invalidateUserLinkCache(
    workspaceId: string,
    discordUserId: string,
  ): Promise<void> {
    const cacheKey = `${CACHE_PREFIX}${workspaceId}:discord:${discordUserId}`;
    await this.redisService.del(cacheKey);
  }
}
