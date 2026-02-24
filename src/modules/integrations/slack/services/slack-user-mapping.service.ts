/**
 * SlackUserMappingService
 * Story 21.1: Slack OAuth Integration (AC2)
 *
 * Manages user mappings between Slack and DevOS, including auto-mapping
 * by email, manual mapping, and cached lookup for interactive actions.
 */

import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlackUserMapping } from '../../../../database/entities/slack-user-mapping.entity';
import { SlackIntegration } from '../../../../database/entities/slack-integration.entity';
import { User } from '../../../../database/entities/user.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

const CACHE_PREFIX = 'slack-user-map:';
const CACHE_TTL = 300; // 5 minutes

export interface SlackUserInfo {
  slackUserId: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  isBot: boolean;
}

@Injectable()
export class SlackUserMappingService {
  private readonly logger = new Logger(SlackUserMappingService.name);

  constructor(
    @InjectRepository(SlackUserMapping)
    private readonly mappingRepo: Repository<SlackUserMapping>,
    @InjectRepository(SlackIntegration)
    private readonly integrationRepo: Repository<SlackIntegration>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Auto-map Slack users to DevOS users by matching email addresses.
   * Fetches Slack team members via users.list API, matches by email.
   */
  async autoMapByEmail(
    workspaceId: string,
    slackIntegrationId: string,
  ): Promise<{ mapped: number; unmatched: SlackUserInfo[] }> {
    const slackUsers = await this.fetchSlackUsers(workspaceId);
    if (slackUsers.length === 0) {
      return { mapped: 0, unmatched: [] };
    }

    // Filter out bots and users without email
    const humanUsersWithEmail = slackUsers.filter(u => !u.isBot && u.email);

    // Get existing mappings to skip already-mapped users
    const existingMappings = await this.mappingRepo.find({ where: { workspaceId } });
    const mappedSlackIds = new Set(existingMappings.map(m => m.slackUserId));
    const mappedDevosIds = new Set(existingMappings.map(m => m.devosUserId));

    let mapped = 0;
    const unmatched: SlackUserInfo[] = [];

    for (const slackUser of humanUsersWithEmail) {
      // Skip already mapped Slack users
      if (mappedSlackIds.has(slackUser.slackUserId)) {
        continue;
      }

      // Find DevOS user by email (case-insensitive)
      const devosUser = await this.userRepo
        .createQueryBuilder('user')
        .where('LOWER(user.email) = LOWER(:email)', { email: slackUser.email })
        .getOne();

      if (!devosUser || mappedDevosIds.has(devosUser.id)) {
        unmatched.push(slackUser);
        continue;
      }

      try {
        const mapping = this.mappingRepo.create({
          workspaceId,
          slackIntegrationId,
          devosUserId: devosUser.id,
          slackUserId: slackUser.slackUserId,
          slackUsername: slackUser.username,
          slackDisplayName: slackUser.displayName,
          slackEmail: slackUser.email,
          isAutoMapped: true,
          mappedAt: new Date(),
        });

        await this.mappingRepo.save(mapping);
        mappedSlackIds.add(slackUser.slackUserId);
        mappedDevosIds.add(devosUser.id);
        mapped++;
      } catch (error) {
        // Skip on unique constraint violations (race condition)
        this.logger.warn(
          `Failed to auto-map Slack user ${slackUser.slackUserId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        unmatched.push(slackUser);
      }
    }

    // Add non-email users to unmatched
    const noEmailUsers = slackUsers.filter(u => !u.isBot && !u.email);
    unmatched.push(...noEmailUsers);

    return { mapped, unmatched };
  }

  /**
   * Manually map a Slack user to a DevOS user.
   */
  async mapUser(
    workspaceId: string,
    slackIntegrationId: string,
    devosUserId: string,
    slackUserId: string,
  ): Promise<SlackUserMapping> {
    // Validate slackUserId format (Slack user IDs start with U or W)
    if (!slackUserId || !/^[UW][A-Z0-9]+$/.test(slackUserId)) {
      throw new ConflictException('Invalid Slack user ID format');
    }

    // Check if Slack user is already mapped in this workspace
    const existingSlack = await this.mappingRepo.findOne({
      where: { workspaceId, slackUserId },
    });
    if (existingSlack) {
      throw new ConflictException('This Slack user is already mapped to a DevOS user in this workspace');
    }

    // Check if DevOS user is already mapped in this workspace
    const existingDevos = await this.mappingRepo.findOne({
      where: { workspaceId, devosUserId },
    });
    if (existingDevos) {
      throw new ConflictException('This DevOS user is already mapped to a Slack user in this workspace');
    }

    const mapping = this.mappingRepo.create({
      workspaceId,
      slackIntegrationId,
      devosUserId,
      slackUserId,
      isAutoMapped: false,
      mappedAt: new Date(),
    });

    const saved = await this.mappingRepo.save(mapping);

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}:${slackUserId}`);

    return saved;
  }

  /**
   * Remove a user mapping.
   */
  async unmapUser(workspaceId: string, mappingId: string): Promise<void> {
    const mapping = await this.mappingRepo.findOne({
      where: { id: mappingId, workspaceId },
    });

    if (!mapping) {
      throw new NotFoundException('User mapping not found');
    }

    // Invalidate cache before deleting
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}:${mapping.slackUserId}`);

    await this.mappingRepo.remove(mapping);
  }

  /**
   * Get all user mappings for a workspace.
   */
  async getMappings(workspaceId: string): Promise<SlackUserMapping[]> {
    return this.mappingRepo.find({
      where: { workspaceId },
      order: { mappedAt: 'DESC' },
    });
  }

  /**
   * List Slack users from the connected workspace for manual mapping UI.
   * Uses users.list Slack API with decrypted bot token.
   */
  async listSlackUsers(workspaceId: string): Promise<SlackUserInfo[]> {
    return this.fetchSlackUsers(workspaceId);
  }

  /**
   * Find DevOS user by Slack user ID (for interactive action permission checks).
   * Cached in Redis for fast lookup.
   */
  async findDevosUserBySlackId(
    workspaceId: string,
    slackUserId: string,
  ): Promise<string | null> {
    const cacheKey = `${CACHE_PREFIX}${workspaceId}:${slackUserId}`;

    // Check cache first
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return cached === 'null' ? null : cached;
    }

    // Query DB
    const mapping = await this.mappingRepo.findOne({
      where: { workspaceId, slackUserId },
    });

    const devosUserId = mapping?.devosUserId || null;

    // Cache the result (even null to prevent cache stampede)
    await this.redisService.set(cacheKey, devosUserId || 'null', CACHE_TTL);

    return devosUserId;
  }

  /**
   * Fetch Slack users from the Slack API using the bot token.
   */
  private async fetchSlackUsers(workspaceId: string): Promise<SlackUserInfo[]> {
    const integration = await this.integrationRepo.findOne({ where: { workspaceId } });
    if (!integration) {
      return [];
    }

    let token: string;
    try {
      token = this.encryptionService.decrypt(integration.botToken);
    } catch {
      this.logger.error(`Failed to decrypt bot token for workspace ${workspaceId}`);
      return [];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch('https://slack.com/api/users.list', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
        signal: controller.signal,
      });

      const result = await response.json() as any;

      if (!result.ok) {
        this.logger.error(`Slack users.list failed: ${result.error}`);
        return [];
      }

      return (result.members || [])
        .filter((m: any) => !m.deleted)
        .map((m: any) => ({
          slackUserId: m.id,
          username: m.name || '',
          displayName: m.profile?.display_name || m.profile?.real_name || m.name || '',
          email: m.profile?.email,
          avatarUrl: m.profile?.image_72,
          isBot: m.is_bot || m.id === 'USLACKBOT',
        }));
    } catch (error) {
      this.logger.error(
        `Failed to fetch Slack users for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}
