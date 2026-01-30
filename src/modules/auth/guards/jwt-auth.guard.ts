import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Extract token from cookie before Passport strategy runs
    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.['access_token'];

    if (token) {
      // Attach token to headers for Passport strategy
      request.headers.authorization = `Bearer ${token}`;
    }

    return super.canActivate(context);
  }
}
