import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SharedLink } from '../../../database/entities/shared-link.entity';
import { Project } from '../../../database/entities/project.entity';
import { CreateSharedLinkDto, ExpirationOption } from '../dto/create-shared-link.dto';
import {
  SharedLinkNotFoundException,
  SharedLinkExpiredException,
  SharedLinkRevokedException,
} from '../exceptions/shared-link.exceptions';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class SharedLinksService {
  constructor(
    @InjectRepository(SharedLink)
    private readonly sharedLinkRepository: Repository<SharedLink>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  /**
   * Create a new shared link for a project
   */
  async create(
    projectId: string,
    workspaceId: string,
    userId: string,
    createDto: CreateSharedLinkDto,
  ): Promise<SharedLink> {
    // Verify project exists and belongs to workspace
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or does not belong to workspace',
      );
    }

    // Generate secure token
    const token = this.generateToken();

    // Calculate expiration date
    const expiresAt = this.calculateExpirationDate(createDto.expiresIn);

    // Hash password if provided
    let passwordHash: string | undefined;
    if (createDto.password) {
      const bcryptRounds = parseInt(
        process.env.SHARED_LINK_PASSWORD_BCRYPT_ROUNDS || '10',
        10,
      );
      passwordHash = await bcrypt.hash(createDto.password, bcryptRounds);
    }

    // Create shared link entity
    const sharedLink = this.sharedLinkRepository.create({
      projectId,
      workspaceId,
      token,
      createdByUserId: userId,
      expiresAt: expiresAt || undefined,
      passwordHash: passwordHash || undefined,
      isActive: true,
      viewCount: 0,
    });

    // Save to database
    const savedLink = await this.sharedLinkRepository.save(sharedLink);

    // Remove password hash from response
    const { passwordHash: _, ...linkWithoutHash } = savedLink;

    return linkWithoutHash as SharedLink;
  }

  /**
   * Find a shared link by token with validation
   */
  async findByToken(token: string): Promise<SharedLink> {
    const sharedLink = await this.sharedLinkRepository.findOne({
      where: { token, isActive: true },
      relations: ['project', 'workspace'],
    });

    if (!sharedLink) {
      throw new SharedLinkNotFoundException(token);
    }

    // Check if link is inactive
    if (!sharedLink.isActive) {
      throw new SharedLinkRevokedException(token);
    }

    // Check if link has expired
    if (sharedLink.expiresAt && new Date() > sharedLink.expiresAt) {
      throw new SharedLinkExpiredException(token);
    }

    return sharedLink;
  }

  /**
   * Find all shared links for a project (workspace isolated)
   */
  async findAllByProject(
    projectId: string,
    workspaceId: string,
  ): Promise<SharedLink[]> {
    return this.sharedLinkRepository.find({
      where: { projectId, workspaceId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find a shared link by ID (workspace isolated)
   */
  async findById(linkId: string, workspaceId: string): Promise<SharedLink> {
    const sharedLink = await this.sharedLinkRepository.findOne({
      where: { id: linkId, workspaceId },
    });

    if (!sharedLink) {
      throw new SharedLinkNotFoundException();
    }

    return sharedLink;
  }

  /**
   * Revoke (deactivate) a shared link
   */
  async revoke(linkId: string, workspaceId: string): Promise<void> {
    // Verify link exists and belongs to workspace
    const sharedLink = await this.findById(linkId, workspaceId);

    if (!sharedLink) {
      throw new SharedLinkNotFoundException();
    }

    // Update isActive to false
    await this.sharedLinkRepository.update(
      { id: linkId, workspaceId },
      { isActive: false },
    );
  }

  /**
   * Validate password for password-protected link
   */
  async validatePassword(
    password: string,
    passwordHash?: string,
  ): Promise<boolean> {
    // If no password hash, link is not password protected
    if (!passwordHash) {
      return true;
    }

    // Compare password with hash using constant-time comparison
    return bcrypt.compare(password, passwordHash);
  }

  /**
   * Increment view count and update last viewed timestamp
   */
  async incrementViewCount(linkId: string): Promise<void> {
    await this.sharedLinkRepository
      .createQueryBuilder()
      .update(SharedLink)
      .set({
        viewCount: () => 'view_count + 1',
        lastViewedAt: new Date(),
      })
      .where('id = :id', { id: linkId })
      .execute();
  }

  /**
   * Generate a cryptographically secure URL-safe token
   */
  private generateToken(): string {
    const tokenLength = parseInt(
      process.env.SHARED_LINK_TOKEN_LENGTH || '32',
      10,
    );

    // Generate random bytes and convert to base64url (URL-safe)
    // 24 bytes = 32 chars in base64url, 32 bytes = 43 chars
    const randomBytes = crypto.randomBytes(tokenLength);
    return randomBytes.toString('base64url');
  }

  /**
   * Calculate expiration date based on option
   */
  private calculateExpirationDate(
    expiresIn: ExpirationOption,
  ): Date | null {
    switch (expiresIn) {
      case ExpirationOption.SEVEN_DAYS:
        return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      case ExpirationOption.THIRTY_DAYS:
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      case ExpirationOption.NEVER:
        return null;
      default:
        return null;
    }
  }
}
