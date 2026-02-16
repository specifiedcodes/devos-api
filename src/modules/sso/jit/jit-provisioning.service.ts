import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JitProvisioningConfig, ConflictResolution } from '../../../database/entities/jit-provisioning-config.entity';
import { User } from '../../../database/entities/user.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../redis/redis.service';
import { JIT_PROVISIONING_CONSTANTS } from '../constants/jit-provisioning.constants';
import {
  UpdateJitProvisioningConfigDto,
  JitProvisioningResult,
  ExtractedIdpAttributes,
} from '../dto/jit-provisioning.dto';

@Injectable()
export class JitProvisioningService {
  private readonly logger = new Logger(JitProvisioningService.name);

  constructor(
    @InjectRepository(JitProvisioningConfig)
    private readonly jitConfigRepository: Repository<JitProvisioningConfig>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    private readonly ssoAuditService: SsoAuditService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get or create JIT provisioning config for a workspace.
   * Returns existing config or creates a new one with defaults.
   * Cached in Redis for 5 minutes.
   */
  async getConfig(workspaceId: string): Promise<JitProvisioningConfig> {
    // Check Redis cache first
    const cacheKey = `${JIT_PROVISIONING_CONSTANTS.CACHE_KEY_PREFIX}${workspaceId}`;
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      try {
        return JSON.parse(cached) as JitProvisioningConfig;
      } catch {
        this.logger.warn(`Failed to parse cached JIT config for workspace ${workspaceId}`);
      }
    }

    // Look up in database
    let config = await this.jitConfigRepository.findOne({ where: { workspaceId } });

    if (!config) {
      // Create default config
      config = this.jitConfigRepository.create({
        workspaceId,
        jitEnabled: true,
        defaultRole: 'developer',
        autoUpdateProfile: true,
        autoUpdateRoles: false,
        welcomeEmail: true,
        requireEmailDomains: null,
        attributeMapping: { ...JIT_PROVISIONING_CONSTANTS.DEFAULT_SAML_ATTRIBUTE_MAPPING },
        groupRoleMapping: {},
        conflictResolution: ConflictResolution.LINK_EXISTING,
      });
      config = await this.jitConfigRepository.save(config);

      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.JIT_CONFIG_CREATED,
        details: { defaultConfig: true },
      });
    }

    // Cache in Redis
    await this.redisService.set(
      cacheKey,
      JSON.stringify(config),
      JIT_PROVISIONING_CONSTANTS.CACHE_TTL_SECONDS,
    );

    return config;
  }

  /**
   * Update JIT provisioning config for a workspace.
   * Creates config if it doesn't exist yet.
   * Invalidates Redis cache on update.
   * Validates group_role_mapping values against VALID_ROLES.
   * Validates attribute_mapping keys against VALID_PROFILE_FIELDS.
   * Logs audit event.
   */
  async updateConfig(
    workspaceId: string,
    updates: UpdateJitProvisioningConfigDto,
    actorId: string,
  ): Promise<JitProvisioningConfig> {
    // Validate groupRoleMapping values
    if (updates.groupRoleMapping) {
      const entries = Object.entries(updates.groupRoleMapping);
      if (entries.length > JIT_PROVISIONING_CONSTANTS.MAX_GROUP_ROLE_MAPPINGS) {
        throw new BadRequestException(
          `Group role mapping cannot exceed ${JIT_PROVISIONING_CONSTANTS.MAX_GROUP_ROLE_MAPPINGS} entries`,
        );
      }
      for (const [group, role] of entries) {
        if (!(JIT_PROVISIONING_CONSTANTS.VALID_ROLES as readonly string[]).includes(role)) {
          throw new BadRequestException(
            `Invalid role '${role}' for group '${group}'. Must be one of: ${JIT_PROVISIONING_CONSTANTS.VALID_ROLES.join(', ')}`,
          );
        }
      }
    }

    // Validate attributeMapping keys
    if (updates.attributeMapping) {
      for (const key of Object.keys(updates.attributeMapping)) {
        if (!(JIT_PROVISIONING_CONSTANTS.VALID_PROFILE_FIELDS as readonly string[]).includes(key)) {
          throw new BadRequestException(
            `Invalid profile field '${key}'. Must be one of: ${JIT_PROVISIONING_CONSTANTS.VALID_PROFILE_FIELDS.join(', ')}`,
          );
        }
      }
    }

    // Get or create config
    let config = await this.jitConfigRepository.findOne({ where: { workspaceId } });

    if (!config) {
      config = this.jitConfigRepository.create({
        workspaceId,
        jitEnabled: true,
        defaultRole: 'developer',
        autoUpdateProfile: true,
        autoUpdateRoles: false,
        welcomeEmail: true,
        requireEmailDomains: null,
        attributeMapping: { ...JIT_PROVISIONING_CONSTANTS.DEFAULT_SAML_ATTRIBUTE_MAPPING },
        groupRoleMapping: {},
        conflictResolution: ConflictResolution.LINK_EXISTING,
      });
    }

    // Apply updates
    if (updates.jitEnabled !== undefined) config.jitEnabled = updates.jitEnabled;
    if (updates.defaultRole !== undefined) config.defaultRole = updates.defaultRole;
    if (updates.autoUpdateProfile !== undefined) config.autoUpdateProfile = updates.autoUpdateProfile;
    if (updates.autoUpdateRoles !== undefined) config.autoUpdateRoles = updates.autoUpdateRoles;
    if (updates.welcomeEmail !== undefined) config.welcomeEmail = updates.welcomeEmail;
    if (updates.requireEmailDomains !== undefined) config.requireEmailDomains = updates.requireEmailDomains ?? null;
    if (updates.attributeMapping !== undefined) config.attributeMapping = updates.attributeMapping;
    if (updates.groupRoleMapping !== undefined) config.groupRoleMapping = updates.groupRoleMapping;
    if (updates.conflictResolution !== undefined) config.conflictResolution = updates.conflictResolution as ConflictResolution;

    config = await this.jitConfigRepository.save(config);

    // Invalidate Redis cache
    const cacheKey = `${JIT_PROVISIONING_CONSTANTS.CACHE_KEY_PREFIX}${workspaceId}`;
    await this.redisService.del(cacheKey);

    // Log audit event
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.JIT_CONFIG_UPDATED,
      actorId,
      details: { updates },
    });

    return config;
  }

  /**
   * Main provisioning entry point. Called by SamlService and OidcService
   * after successful authentication.
   */
  async provisionUser(
    workspaceId: string,
    idpAttributes: Record<string, unknown>,
    providerType: 'saml' | 'oidc',
    ipAddress?: string,
    userAgent?: string,
  ): Promise<JitProvisioningResult> {
    const config = await this.getConfig(workspaceId);

    // Extract attributes using configured mapping
    const extracted = this.extractAttributes(idpAttributes, config.attributeMapping);
    const email = extracted.email;

    if (!email) {
      throw new BadRequestException('Email attribute is missing from IdP response');
    }

    // Check email domain restrictions
    if (config.requireEmailDomains && config.requireEmailDomains.length > 0) {
      const emailDomain = email.split('@')[1]?.toLowerCase();
      const allowedDomains = config.requireEmailDomains.map((d) => d.toLowerCase());
      if (!emailDomain || !allowedDomains.includes(emailDomain)) {
        void this.ssoAuditService.logEvent({
          workspaceId,
          eventType: SsoAuditEventType.JIT_USER_REJECTED,
          ipAddress,
          userAgent,
          details: { email, reason: 'email_domain_not_allowed', emailDomain, allowedDomains },
        });
        throw new ForbiddenException('Email domain is not in the allowed domains list');
      }
    }

    // Look up existing user
    const existingUser = await this.userRepository.findOne({ where: { email } });

    // Check if user is suspended
    if (existingUser && existingUser.suspendedAt) {
      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.JIT_USER_REJECTED,
        targetUserId: existingUser.id,
        ipAddress,
        userAgent,
        details: { email, reason: 'user_suspended' },
      });
      throw new ForbiddenException('User account is suspended');
    }

    if (!existingUser) {
      // New user flow
      if (!config.jitEnabled) {
        void this.ssoAuditService.logEvent({
          workspaceId,
          eventType: SsoAuditEventType.JIT_USER_REJECTED,
          ipAddress,
          userAgent,
          details: { email, reason: 'jit_disabled' },
        });
        throw new ForbiddenException('JIT provisioning is disabled for this workspace');
      }

      return this.provisionNewUser(workspaceId, config, extracted, providerType, ipAddress, userAgent);
    }

    // Check workspace membership
    const existingMember = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId: existingUser.id },
    });

    if (!existingMember) {
      // Existing user, not in workspace
      if (!config.jitEnabled) {
        void this.ssoAuditService.logEvent({
          workspaceId,
          eventType: SsoAuditEventType.JIT_USER_REJECTED,
          targetUserId: existingUser.id,
          ipAddress,
          userAgent,
          details: { email, reason: 'jit_disabled_not_in_workspace' },
        });
        throw new ForbiddenException('JIT provisioning is disabled for this workspace');
      }

      return this.handleExistingUserNotInWorkspace(
        workspaceId, config, existingUser, extracted, providerType, ipAddress, userAgent,
      );
    }

    // Existing user, in workspace - update profile/role if configured
    return this.handleExistingUserInWorkspace(
      workspaceId, config, existingUser, existingMember, extracted, providerType, ipAddress, userAgent,
    );
  }

  /**
   * Extract and normalize IdP attributes using configured mapping.
   * Handles nested attribute paths (e.g., 'user.profile.email').
   */
  extractAttributes(
    rawAttributes: Record<string, unknown>,
    attributeMapping: Record<string, string>,
  ): ExtractedIdpAttributes {
    const result: ExtractedIdpAttributes = {
      email: '',
      rawAttributes,
    };

    for (const [devosField, idpPath] of Object.entries(attributeMapping)) {
      const value = this.getNestedValue(rawAttributes, idpPath);

      if (value === undefined || value === null) {
        continue;
      }

      switch (devosField) {
        case 'email':
          result.email = String(value).toLowerCase();
          break;
        case 'firstName':
          result.firstName = String(value);
          break;
        case 'lastName':
          result.lastName = String(value);
          break;
        case 'displayName':
          result.displayName = String(value);
          break;
        case 'groups':
          // Always return as string array
          if (Array.isArray(value)) {
            result.groups = value.map(String);
          } else {
            result.groups = [String(value)];
          }
          break;
        case 'department':
          result.department = String(value);
          break;
        case 'jobTitle':
          result.jobTitle = String(value);
          break;
      }
    }

    return result;
  }

  /**
   * Resolve workspace role from IdP groups using group_role_mapping config.
   * Returns first matching role, or defaultRole if no match.
   */
  resolveRole(
    groups: string[] | undefined,
    groupRoleMapping: Record<string, string>,
    defaultRole: string,
  ): string {
    if (!groups || groups.length === 0) {
      return defaultRole;
    }

    const lowerGroups = groups.map((g) => g.toLowerCase());

    for (const [groupName, role] of Object.entries(groupRoleMapping)) {
      if (lowerGroups.includes(groupName.toLowerCase())) {
        // Validate the role
        if ((JIT_PROVISIONING_CONSTANTS.VALID_ROLES as readonly string[]).includes(role)) {
          return role;
        }
      }
    }

    return defaultRole;
  }

  /**
   * Provision a brand new user
   */
  private async provisionNewUser(
    workspaceId: string,
    config: JitProvisioningConfig,
    extracted: ExtractedIdpAttributes,
    providerType: 'saml' | 'oidc',
    ipAddress?: string,
    userAgent?: string,
  ): Promise<JitProvisioningResult> {
    try {
      // Generate random password (SSO users never use it)
      const randomPassword = crypto.randomBytes(JIT_PROVISIONING_CONSTANTS.RANDOM_PASSWORD_BYTES).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, JIT_PROVISIONING_CONSTANTS.BCRYPT_SALT_ROUNDS);

      // Build profile data
      const profileData: Record<string, unknown> = {};
      if (extracted.firstName) profileData.firstName = extracted.firstName;
      if (extracted.lastName) profileData.lastName = extracted.lastName;
      if (extracted.displayName) profileData.displayName = extracted.displayName;
      if (extracted.department) profileData.department = extracted.department;
      if (extracted.jobTitle) profileData.jobTitle = extracted.jobTitle;
      if (extracted.groups) profileData.groups = extracted.groups;

      // Create user
      const user = this.userRepository.create({
        email: extracted.email,
        passwordHash,
        twoFactorEnabled: false,
        ssoProfileData: Object.keys(profileData).length > 0 ? profileData : null,
      });
      const savedUser = await this.userRepository.save(user);

      // Resolve role from groups
      const resolvedRole = this.resolveRole(extracted.groups, config.groupRoleMapping, config.defaultRole);

      // Create workspace membership
      const member = this.workspaceMemberRepository.create({
        workspaceId,
        userId: savedUser.id,
        role: resolvedRole as WorkspaceRole,
      });
      await this.workspaceMemberRepository.save(member);

      // Log audit event
      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.JIT_USER_PROVISIONED,
        targetUserId: savedUser.id,
        ipAddress,
        userAgent,
        details: {
          email: extracted.email,
          providerType,
          role: resolvedRole,
          profileData,
          welcomeEmail: config.welcomeEmail,
        },
      });

      return {
        user: { id: savedUser.id, email: savedUser.email },
        isNewUser: true,
        profileUpdated: false,
        roleUpdated: false,
        newRole: resolvedRole,
        provisioningDetails: {
          role: resolvedRole,
          welcomeEmail: config.welcomeEmail,
          profileData,
        },
      };
    } catch (error) {
      // Re-throw known HTTP exceptions (e.g., from validation) without wrapping
      if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Failed to provision new user: ${extracted.email}`, error);
      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.JIT_PROVISIONING_ERROR,
        ipAddress,
        userAgent,
        details: {
          email: extracted.email,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw new InternalServerErrorException('Failed to provision user');
    }
  }

  /**
   * Handle existing user who is not a member of the workspace
   */
  private async handleExistingUserNotInWorkspace(
    workspaceId: string,
    config: JitProvisioningConfig,
    user: User,
    extracted: ExtractedIdpAttributes,
    providerType: 'saml' | 'oidc',
    ipAddress?: string,
    userAgent?: string,
  ): Promise<JitProvisioningResult> {
    switch (config.conflictResolution) {
      case ConflictResolution.REJECT: {
        void this.ssoAuditService.logEvent({
          workspaceId,
          eventType: SsoAuditEventType.JIT_USER_REJECTED,
          targetUserId: user.id,
          ipAddress,
          userAgent,
          details: {
            email: user.email,
            reason: 'conflict_resolution_reject',
            providerType,
          },
        });
        throw new ForbiddenException('User exists but is not allowed to join this workspace');
      }

      case ConflictResolution.PROMPT_ADMIN: {
        void this.ssoAuditService.logEvent({
          workspaceId,
          eventType: SsoAuditEventType.JIT_USER_REJECTED,
          targetUserId: user.id,
          ipAddress,
          userAgent,
          details: {
            email: user.email,
            reason: 'pending_admin_approval',
            providerType,
          },
        });
        throw new ConflictException('Account requires admin approval to join this workspace');
      }

      case ConflictResolution.LINK_EXISTING:
      default: {
        // Resolve role from groups
        const resolvedRole = this.resolveRole(extracted.groups, config.groupRoleMapping, config.defaultRole);

        // Create workspace membership
        const member = this.workspaceMemberRepository.create({
          workspaceId,
          userId: user.id,
          role: resolvedRole as WorkspaceRole,
        });
        await this.workspaceMemberRepository.save(member);

        // Optionally update profile
        let profileUpdated = false;
        if (config.autoUpdateProfile) {
          profileUpdated = await this.updateUserProfile(user, extracted);
        }

        void this.ssoAuditService.logEvent({
          workspaceId,
          eventType: SsoAuditEventType.JIT_USER_LINKED,
          targetUserId: user.id,
          ipAddress,
          userAgent,
          details: {
            email: user.email,
            providerType,
            role: resolvedRole,
            profileUpdated,
          },
        });

        return {
          user: { id: user.id, email: user.email },
          isNewUser: false,
          profileUpdated,
          roleUpdated: false,
          newRole: resolvedRole,
          conflictResolved: 'linked',
          provisioningDetails: {
            role: resolvedRole,
            linked: true,
            profileUpdated,
          },
        };
      }
    }
  }

  /**
   * Handle existing user already in the workspace
   */
  private async handleExistingUserInWorkspace(
    workspaceId: string,
    config: JitProvisioningConfig,
    user: User,
    member: WorkspaceMember,
    extracted: ExtractedIdpAttributes,
    providerType: 'saml' | 'oidc',
    ipAddress?: string,
    userAgent?: string,
  ): Promise<JitProvisioningResult> {
    let profileUpdated = false;
    let roleUpdated = false;
    let previousRole: string | undefined;
    let newRole: string | undefined;

    // Update profile if configured
    if (config.autoUpdateProfile) {
      profileUpdated = await this.updateUserProfile(user, extracted);
      if (profileUpdated) {
        void this.ssoAuditService.logEvent({
          workspaceId,
          eventType: SsoAuditEventType.JIT_USER_PROFILE_UPDATED,
          targetUserId: user.id,
          ipAddress,
          userAgent,
          details: {
            email: user.email,
            providerType,
          },
        });
      }
    }

    // Update role if configured
    if (config.autoUpdateRoles) {
      const resolvedRole = this.resolveRole(extracted.groups, config.groupRoleMapping, config.defaultRole);

      // Never change owner role
      if (member.role !== WorkspaceRole.OWNER && resolvedRole !== member.role) {
        previousRole = member.role;
        newRole = resolvedRole;
        member.role = resolvedRole as WorkspaceRole;
        await this.workspaceMemberRepository.save(member);
        roleUpdated = true;

        void this.ssoAuditService.logEvent({
          workspaceId,
          eventType: SsoAuditEventType.JIT_USER_ROLE_UPDATED,
          targetUserId: user.id,
          ipAddress,
          userAgent,
          details: {
            email: user.email,
            providerType,
            previousRole,
            newRole,
          },
        });
      }
    }

    return {
      user: { id: user.id, email: user.email },
      isNewUser: false,
      profileUpdated,
      roleUpdated,
      previousRole,
      newRole,
      provisioningDetails: {
        profileUpdated,
        roleUpdated,
      },
    };
  }

  /**
   * Update user profile with extracted IdP attributes
   */
  private async updateUserProfile(user: User, extracted: ExtractedIdpAttributes): Promise<boolean> {
    const profileData: Record<string, unknown> = {};
    if (extracted.firstName) profileData.firstName = extracted.firstName;
    if (extracted.lastName) profileData.lastName = extracted.lastName;
    if (extracted.displayName) profileData.displayName = extracted.displayName;
    if (extracted.department) profileData.department = extracted.department;
    if (extracted.jobTitle) profileData.jobTitle = extracted.jobTitle;
    if (extracted.groups) profileData.groups = extracted.groups;

    if (Object.keys(profileData).length === 0) {
      return false;
    }

    // Check if profile data actually changed (sort keys for stable comparison)
    const currentProfile = user.ssoProfileData || {};
    const sortedStringify = (obj: Record<string, unknown>) =>
      JSON.stringify(obj, Object.keys(obj).sort());
    const hasChanges = sortedStringify(currentProfile) !== sortedStringify(profileData);

    if (!hasChanges) {
      return false;
    }

    user.ssoProfileData = profileData;
    await this.userRepository.save(user);
    return true;
  }

  /**
   * Get nested value from object using dot notation path
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
