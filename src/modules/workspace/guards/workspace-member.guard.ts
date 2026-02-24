/**
 * WorkspaceMemberGuard - ensures user is a member of the workspace
 */
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // Stub: actual implementation would check workspace membership
    return true;
  }
}
