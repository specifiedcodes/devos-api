export class IntegrationResponseDto {
  id!: string;
  provider!: string;
  status!: string;
  externalUsername?: string;
  externalAvatarUrl?: string;
  scopes?: string[];
  connectedAt!: string;
  lastUsedAt?: string;
}

export class GitHubStatusResponseDto {
  connected!: boolean;
  username?: string;
  avatarUrl?: string;
  scopes?: string[];
  connectedAt?: string;
}

export class AuthorizationUrlResponseDto {
  authorizationUrl!: string;
}

export class DisconnectResponseDto {
  success!: boolean;
  message!: string;
}
