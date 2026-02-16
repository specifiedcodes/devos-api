import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../guards/super-admin.guard';

export function PlatformAdmin() {
  return applyDecorators(UseGuards(JwtAuthGuard, SuperAdminGuard));
}
