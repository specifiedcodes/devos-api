export interface Session {
  session_id: string;
  user_id: string;
  workspace_id: string; // Current workspace context for this session
  access_token_jti: string;
  refresh_token_jti: string;
  created_at: Date;
  expires_at: Date;
  ip_address: string;
  user_agent: string;
  last_active?: Date;
}
