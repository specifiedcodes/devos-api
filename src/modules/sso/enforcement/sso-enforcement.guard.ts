import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { SsoEnforcementService } from './sso-enforcement.service';
import { DomainVerificationService } from '../domain/domain-verification.service';

@Injectable()
export class SsoEnforcementGuard implements CanActivate {
  constructor(
    private readonly ssoEnforcementService: SsoEnforcementService,
    private readonly domainVerificationService: DomainVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { email } = request.body;

    if (!email) {
      return true; // Let validation handle missing email
    }

    // Extract domain from email
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return true; // Let validation handle invalid email format
    }

    // Look up domain to find workspace with SSO enforcement
    const domainLookup = await this.domainVerificationService.lookupDomain(domain);
    if (!domainLookup) {
      return true; // No SSO domain configured - allow password login
    }

    // Check enforcement for the workspace
    const enforcementCheck = await this.ssoEnforcementService.checkLoginEnforcement(
      email.toLowerCase(),
      domainLookup.workspaceId,
    );

    if (!enforcementCheck.allowed) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'SSO_ENFORCEMENT',
        message: enforcementCheck.enforcementMessage || 'SSO login is required for your organization.',
        redirectToSso: enforcementCheck.redirectToSso,
        ssoProviderHint: enforcementCheck.ssoProviderHint,
      });
    }

    return true;
  }
}
