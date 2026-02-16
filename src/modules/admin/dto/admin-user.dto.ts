export interface AdminUserListItemDto {
  id: string;
  email: string;
  isPlatformAdmin: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  status: 'active' | 'suspended' | 'deleted';
  workspaceCount: number;
}

export interface AdminUserWorkspaceDto {
  id: string;
  name: string;
  role: string;
  joinedAt: string;
}

export interface AdminActivitySummaryDto {
  totalLogins: number;
  lastLoginIp: string | null;
  totalSecurityEvents: number;
  recentActions: {
    action: string;
    timestamp: string;
    ipAddress: string | null;
  }[];
}

export interface AdminUserDetailDto {
  id: string;
  email: string;
  isPlatformAdmin: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  status: 'active' | 'suspended' | 'deleted';
  suspendedAt: string | null;
  suspensionReason: string | null;
  workspaces: AdminUserWorkspaceDto[];
  projectCount: number;
  activitySummary: AdminActivitySummaryDto;
  activeSessions: number;
}

export interface PaginationDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedUsersResultDto {
  users: AdminUserListItemDto[];
  pagination: PaginationDto;
}
