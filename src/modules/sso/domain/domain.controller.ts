import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DomainVerificationService } from './domain-verification.service';
import { SsoAuditService } from '../sso-audit.service';
import { RegisterDomainDto, LinkDomainProviderDto, DomainResponseDto, DomainLookupResponseDto } from '../dto/domain.dto';
import { SsoDomain, DomainStatus } from '../../../database/entities/sso-domain.entity';
import { DOMAIN_CONSTANTS } from '../constants/domain.constants';

@ApiTags('SSO - Domains')
@Controller('api/auth/sso/domains')
export class DomainController {
  private readonly logger = new Logger(DomainController.name);

  constructor(
    private readonly domainService: DomainVerificationService,
    private readonly ssoAuditService: SsoAuditService,
  ) {}

  /**
   * GET /api/auth/sso/domains/lookup/:email
   * Look up SSO provider for an email address.
   * Public endpoint (no auth required) for login page auto-routing.
   * MUST be registered BEFORE /:domainId routes to avoid path parameter collision.
   */
  @Get('lookup/:email')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 lookups per IP per minute to prevent email enumeration
  @ApiOperation({ summary: 'Look up SSO provider for email domain' })
  @ApiParam({ name: 'email', type: 'string' })
  @ApiResponse({ status: 200, type: DomainLookupResponseDto })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async lookupByEmail(
    @Param('email') email: string,
  ): Promise<DomainLookupResponseDto> {
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain) {
      return { found: false };
    }

    const result = await this.domainService.lookupDomain(emailDomain);
    if (!result) {
      return { found: false };
    }

    return {
      found: true,
      domain: result.domain,
      providerType: result.providerType,
      providerId: result.providerId,
      providerName: result.providerName,
      workspaceId: result.workspaceId,
    };
  }

  /**
   * POST /api/auth/sso/domains
   * Register a new domain for SSO verification.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Register domain for SSO verification' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 201, type: DomainResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or blocked domain' })
  @ApiResponse({ status: 409, description: 'Domain already claimed' })
  @ApiResponse({ status: 422, description: 'Workspace domain limit exceeded' })
  async registerDomain(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: RegisterDomainDto,
    @Req() req: Request,
  ): Promise<DomainResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    const domain = await this.domainService.registerDomain(workspaceId, dto.domain, userId);
    return this.toResponseDto(domain);
  }

  /**
   * POST /api/auth/sso/domains/:domainId/verify
   * Trigger manual DNS verification check.
   */
  @Post(':domainId/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Trigger domain verification check' })
  @ApiParam({ name: 'domainId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, type: DomainResponseDto })
  @ApiResponse({ status: 404, description: 'Domain not found' })
  async verifyDomain(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: Request,
  ): Promise<DomainResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    const domain = await this.domainService.verifyDomain(workspaceId, domainId, userId);
    return this.toResponseDto(domain);
  }

  /**
   * GET /api/auth/sso/domains
   * List all domains for workspace.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List workspace SSO domains' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiQuery({ name: 'status', required: false, enum: DomainStatus })
  @ApiResponse({ status: 200, type: [DomainResponseDto] })
  async listDomains(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('status') status?: DomainStatus,
  ): Promise<DomainResponseDto[]> {
    const domains = await this.domainService.listDomains(workspaceId, status);
    return domains.map((d) => this.toResponseDto(d));
  }

  /**
   * GET /api/auth/sso/domains/:domainId
   * Get a single domain by ID.
   */
  @Get(':domainId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get domain details' })
  @ApiParam({ name: 'domainId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, type: DomainResponseDto })
  @ApiResponse({ status: 404, description: 'Domain not found' })
  async getDomain(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<DomainResponseDto> {
    const domain = await this.domainService.getDomain(workspaceId, domainId);
    return this.toResponseDto(domain);
  }

  /**
   * PUT /api/auth/sso/domains/:domainId/provider
   * Link a verified domain to a SAML or OIDC provider.
   */
  @Put(':domainId/provider')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Link domain to SSO provider' })
  @ApiParam({ name: 'domainId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, type: DomainResponseDto })
  @ApiResponse({ status: 404, description: 'Domain not found' })
  @ApiResponse({ status: 422, description: 'Domain not verified' })
  async linkProvider(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: LinkDomainProviderDto,
    @Req() req: Request,
  ): Promise<DomainResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    const domain = await this.domainService.linkProvider(
      workspaceId,
      domainId,
      dto.samlConfigId || null,
      dto.oidcConfigId || null,
      userId,
    );
    return this.toResponseDto(domain);
  }

  /**
   * DELETE /api/auth/sso/domains/:domainId
   * Remove a domain.
   */
  @Delete(':domainId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove SSO domain' })
  @ApiParam({ name: 'domainId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 204, description: 'Domain removed' })
  @ApiResponse({ status: 404, description: 'Domain not found' })
  async removeDomain(
    @Param('domainId', ParseUUIDPipe) domainId: string,
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: Request,
  ): Promise<void> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.domainService.removeDomain(workspaceId, domainId, userId);
  }

  private toResponseDto(domain: SsoDomain): DomainResponseDto {
    const dto = new DomainResponseDto();
    dto.id = domain.id;
    dto.workspaceId = domain.workspaceId;
    dto.domain = domain.domain;
    dto.verificationMethod = domain.verificationMethod;
    // Only expose verificationToken for pending domains (needed for DNS setup)
    // Redact for verified/expired/failed domains to avoid unnecessary info leakage
    const isPending = domain.status === DomainStatus.PENDING;
    dto.verificationToken = isPending ? domain.verificationToken : '***REDACTED***';
    dto.status = domain.status;
    dto.verifiedAt = domain.verifiedAt?.toISOString() || null;
    dto.expiresAt = domain.expiresAt?.toISOString() || null;
    dto.lastCheckAt = domain.lastCheckAt?.toISOString() || null;
    dto.lastCheckError = domain.lastCheckError;
    dto.checkCount = domain.checkCount;
    dto.samlConfigId = domain.samlConfigId;
    dto.oidcConfigId = domain.oidcConfigId;
    dto.createdBy = domain.createdBy;
    dto.createdAt = domain.createdAt?.toISOString();
    dto.updatedAt = domain.updatedAt?.toISOString();
    dto.dnsInstruction = isPending
      ? `Add a TXT record to your DNS for ${domain.domain} with value: ${DOMAIN_CONSTANTS.VERIFICATION_TXT_PREFIX}${domain.verificationToken}`
      : `Domain ${domain.domain} is ${domain.status}`;
    return dto;
  }
}
