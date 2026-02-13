import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ServiceAuthGuard
 *
 * Protects internal API endpoints with service-level authentication
 * Verifies Authorization header contains valid service API key
 *
 * Usage: @UseGuards(ServiceAuthGuard)
 *
 * Part of Epic 4 Story 4.7: Auto-Provisioning Status Backend
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing service authorization header');
    }

    // Extract token from "Bearer <token>" format
    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization format');
    }

    // Get service API key from environment
    const serviceApiKey = this.configService.get<string>('SERVICE_API_KEY');

    if (!serviceApiKey) {
      throw new UnauthorizedException('Service API key not configured');
    }

    // Verify token matches service API key
    if (token !== serviceApiKey) {
      throw new UnauthorizedException('Invalid service API key');
    }

    return true;
  }
}
