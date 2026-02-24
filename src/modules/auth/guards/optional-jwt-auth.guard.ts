/**
 * OptionalJwtAuthGuard
 *
 * An optional JWT auth guard that allows requests through even without a valid token.
 * Used for endpoints that have different behavior for authenticated vs unauthenticated users.
 *
 * Key difference from JwtAuthGuard:
 * - No token = request proceeds (anonymous access)
 * - Invalid/expired token = request proceeds as anonymous (token is ignored)
 * - Valid token = user is attached to request (authenticated access)
 */
import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(OptionalJwtAuthGuard.name);

  canActivate(context: ExecutionContext): boolean | Observable<boolean> | Promise<boolean> {
    // Extract token from cookie before Passport strategy runs
    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.['access_token'];

    // If no token provided, allow anonymous access immediately
    if (!token) {
      return true;
    }

    // Attach token to headers for Passport strategy
    request.headers.authorization = `Bearer ${token}`;

    // Call the parent canActivate, but catch any errors to allow anonymous access
    // This allows the request to proceed even if the token is invalid/expired
    const result = super.canActivate(context);

    // Handle different return types from super.canActivate()
    if (result === true) {
      return true;
    }

    if (result instanceof Promise) {
      return result.catch(() => {
        this.logger.debug('Optional JWT auth failed, proceeding as anonymous');
        return true;
      });
    }

    if (result instanceof Observable) {
      return result.pipe(
        catchError((error: Error) => {
          this.logger.debug(`Optional JWT auth failed, proceeding as anonymous: ${error.message}`);
          return of(true);
        }),
      );
    }

    return result;
  }

  handleRequest(err: Error | null, user: any) {
    // Return user if available, otherwise return null (anonymous)
    // Never throw errors - this guard is "optional"
    return user || null;
  }
}
