/**
 * WorkspaceId decorator - extracts workspace ID from request headers
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const WorkspaceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers['x-workspace-id'] as string;
  },
);
