export interface Session {
  session_id: string;
  user_id: string;
  access_token_jti: string;
  refresh_token_jti: string;
  created_at: Date;
  expires_at: Date;
  ip_address: string;
  user_agent: string;
  last_active?: Date;
}
