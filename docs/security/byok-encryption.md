# BYOK (Bring Your Own Key) Encryption Architecture

## Overview

DevOS implements a secure BYOK system that allows users to provide their own API keys (Anthropic, OpenAI) while ensuring the keys are encrypted at rest using AES-256-GCM encryption with workspace-scoped key derivation.

## Encryption Specifications

### Algorithm: AES-256-GCM

- **Cipher**: AES-256 (Advanced Encryption Standard, 256-bit key)
- **Mode**: GCM (Galois/Counter Mode) with authentication
- **Key Size**: 256 bits (32 bytes)
- **IV Size**: 128 bits (16 bytes), randomly generated per encryption
- **Authentication Tag**: 128 bits (16 bytes) for integrity verification

### Why AES-256-GCM?

1. **Security**: AES-256 is approved by NIST and meets FIPS 140-2 requirements
2. **Authenticated Encryption**: GCM mode provides both confidentiality and integrity
3. **Performance**: Hardware-accelerated AES instructions (AES-NI) on modern CPUs
4. **Compliance**: Meets SOC2, GDPR, CCPA, and HIPAA encryption requirements

## Architecture

### Envelope Encryption with HKDF

We implement a multi-layer encryption architecture using HKDF (HMAC-based Key Derivation Function):

```
┌──────────────────────────────────────────────────────────────────┐
│ Master Encryption Key (ENCRYPTION_KEY env var)                   │
│ - 256 bits (64 hex characters)                                   │
│ - Stored in environment variables, never in database             │
│ - Rotatable without re-encrypting all data                       │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
       ┌─────────────────────────────┐
       │ HKDF-SHA256 Key Derivation  │
       │ Salt: ENCRYPTION_HKDF_SALT  │
       │ Info: "workspace:{id}"      │
       └────────────┬────────────────┘
                    │
                    ▼
     ┌──────────────────────────────────────┐
     │ Workspace-Specific Encryption Key     │
     │ - Unique per workspace                │
     │ - Derived deterministically           │
     │ - Never stored, computed on-demand    │
     └──────────────┬───────────────────────┘
                    │
                    ▼
        ┌─────────────────────────────┐
        │ AES-256-GCM Encryption       │
        │ - Random IV per encryption   │
        │ - Authentication tag included│
        └──────────┬──────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────────┐
    │ Stored in Database (byok_secrets)    │
    │ - encrypted_key: authTag:ciphertext  │
    │ - encryption_iv: hex-encoded IV      │
    └──────────────────────────────────────┘
```

### Benefits of This Architecture

1. **Workspace Isolation**: Each workspace has a unique encryption key derived from the master key
2. **Cross-Workspace Security**: Workspace A cannot decrypt Workspace B's data even with database access
3. **Key Rotation**: Master key can be rotated by re-deriving workspace keys and re-encrypting data
4. **Performance**: Workspace keys are derived on-demand, not stored
5. **Compliance**: Meets multi-tenant security requirements for SOC2 certification

## Implementation Details

### Environment Variables

```bash
# Master encryption key (32 bytes = 64 hex characters)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=a1b2c3d4e5f6...  # 64 characters

# HKDF salt for workspace key derivation (32 bytes = 64 hex characters)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_HKDF_SALT=f6e5d4c3b2a1...  # 64 characters
```

**⚠️ Security Requirements:**
- Both values MUST be 64 hex characters (32 bytes)
- MUST be stored in environment variables, never in code or database
- MUST use strong random generation (crypto.randomBytes)
- MUST be backed up securely (encrypted backup recommended)
- SHOULD be rotated periodically (every 12-24 months)

### Database Schema

```typescript
// Table: byok_secrets
{
  id: UUID,                    // Primary key
  workspace_id: UUID,          // Workspace identifier (FK)
  key_name: VARCHAR(100),      // User-friendly name
  provider: ENUM,              // 'anthropic' | 'openai'
  encrypted_key: TEXT,         // Format: "authTag:ciphertext" (hex)
  encryption_iv: TEXT,         // Initialization vector (hex)
  created_by_user_id: UUID,    // Creator (FK to users)
  created_at: TIMESTAMP,       // Creation time
  updated_at: TIMESTAMP,       // Last update
  last_used_at: TIMESTAMP,     // Last decryption time
  is_active: BOOLEAN           // Soft delete flag
}

// Indexes
CREATE INDEX idx_byok_secrets_workspace_active
  ON byok_secrets(workspace_id, is_active);

// Foreign keys
FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE;
```

### Encryption Service API

```typescript
class EncryptionService {
  // General encryption (uses master key directly)
  encrypt(plaintext: string): string
  // Returns: "iv:authTag:ciphertext" (hex-encoded)

  decrypt(encryptedData: string): string
  // Expects: "iv:authTag:ciphertext"
  // Returns: plaintext

  // Workspace-scoped encryption (uses derived key)
  encryptWithWorkspaceKey(workspaceId: string, plaintext: string): {
    encryptedData: string,  // "authTag:ciphertext" (hex)
    iv: string              // hex-encoded IV (stored separately)
  }

  decryptWithWorkspaceKey(
    workspaceId: string,
    encryptedData: string,
    ivHex: string
  ): string
  // Returns: plaintext
}
```

### BYOK Service API

```typescript
class BYOKKeyService {
  // Create encrypted key
  async createKey(
    workspaceId: string,
    userId: string,
    dto: { keyName: string, provider: KeyProvider, apiKey: string }
  ): Promise<BYOKKeyResponse>

  // List keys (never returns plaintext)
  async getWorkspaceKeys(workspaceId: string): Promise<BYOKKeyResponse[]>

  // Decrypt key (internal use only)
  async decryptKey(keyId: string, workspaceId: string): Promise<string>

  // Soft delete
  async deleteKey(keyId: string, workspaceId: string, userId: string): Promise<void>
}
```

## Security Features

### 1. Log Redaction

All API keys are automatically redacted from logs and error messages:

```typescript
// Before redaction
"Error: Invalid key sk-ant-api03-abc123xyz"

// After redaction
"Error: Invalid key sk-ant-[REDACTED]"
```

**Redacted Patterns:**
- `sk-ant-*` → `sk-ant-[REDACTED]` (Anthropic keys)
- `sk-proj-*` → `sk-proj-[REDACTED]` (OpenAI project keys)
- `sk-*` → `sk-[REDACTED]` (Legacy OpenAI keys)
- `api_key=*` → `api_key=[REDACTED]`
- `apiKey: "*"` → `apiKey: "[REDACTED]"`

**Implementation:**
```typescript
import { sanitizeLogData } from '@/shared/logging/log-sanitizer';

try {
  // ... operation
} catch (error) {
  // Logs are automatically sanitized
  logger.error('Operation failed', sanitizeLogData(error));
}
```

### 2. Audit Logging

All BYOK operations are logged to the audit trail:

```typescript
// Logged Events
- BYOK_KEY_CREATED: New key added (logs: keyName, provider, keyId)
- BYOK_KEY_ACCESSED: Key decrypted (logs: keyId only, NOT plaintext)
- BYOK_KEY_DELETED: Key soft-deleted (logs: keyId, keyName, provider)

// Audit logs store:
✅ Key ID (UUID)
✅ Key name (user-friendly identifier)
✅ Provider (anthropic/openai)
❌ Plaintext API key (NEVER logged)
❌ Encrypted API key (NEVER logged)
```

### 3. Rate Limiting

Decryption operations are rate-limited to prevent brute-force attacks:

- **Limit**: 100 decryptions per hour per key
- **Scope**: Per workspace, per key
- **Response**: HTTP 429 Too Many Requests with retry-after header

### 4. Workspace Isolation

- Keys are scoped by `workspace_id` at database and encryption levels
- Workspace A cannot access or decrypt Workspace B's keys
- Middleware enforces workspace context from JWT token
- All queries filter by `workspace_id` to prevent cross-workspace access

### 5. Input Validation

API keys are validated before storage:

```typescript
// Anthropic keys
- Must start with: sk-ant-
- Minimum length: 40 characters

// OpenAI keys
- Must start with: sk-
- Minimum length: 40 characters
```

## Compliance & Standards

### SOC2 Type II Requirements

- ✅ Encryption at rest: AES-256-GCM
- ✅ Encryption in transit: TLS 1.3
- ✅ Key management: Separate master key from data
- ✅ Access controls: Workspace-scoped, RBAC-enforced
- ✅ Audit logging: All operations logged
- ✅ Data isolation: Multi-tenant with cryptographic separation

### GDPR Compliance

- ✅ Right to erasure: Soft delete with `is_active=false`
- ✅ Data minimization: Only store encrypted keys, not plaintext
- ✅ Security by design: Encryption-first architecture
- ✅ Data portability: Keys can be exported (encrypted)
- ✅ Access logging: Audit trail for all key access

### CCPA Compliance

- ✅ Data security: Encryption at rest and in transit
- ✅ Access rights: Users can view their keys (metadata only)
- ✅ Deletion rights: Soft delete with audit trail
- ✅ Disclosure: Audit logs show all key access

## Key Rotation Procedure

### Rotating Master Encryption Key

**⚠️ This is a critical operation. Follow these steps carefully.**

1. **Backup Current Keys**
   ```bash
   # Backup current environment variables
   echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" > backup-keys.txt
   echo "ENCRYPTION_HKDF_SALT=$ENCRYPTION_HKDF_SALT" >> backup-keys.txt

   # Encrypt backup
   gpg -c backup-keys.txt
   rm backup-keys.txt
   ```

2. **Generate New Keys**
   ```bash
   # Generate new master key
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

   # Generate new HKDF salt
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Re-encrypt All BYOK Keys**
   ```typescript
   // Run migration script (to be implemented)
   npm run migrate:reencrypt-byok-keys
   ```

4. **Update Environment Variables**
   ```bash
   # Update production environment
   export ENCRYPTION_KEY=new_key_here
   export ENCRYPTION_HKDF_SALT=new_salt_here

   # Restart application
   pm2 restart devos-api
   ```

5. **Verify**
   ```bash
   # Test key decryption
   curl -X GET https://api.devos.com/api/byok/keys \
     -H "Authorization: Bearer $JWT_TOKEN"
   ```

6. **Securely Delete Old Keys**
   ```bash
   # After verification, securely delete old backup
   shred -u backup-keys.txt.gpg
   ```

### Rotating HKDF Salt

Rotating the HKDF salt requires re-deriving all workspace keys and re-encrypting all BYOK keys:

1. Generate new salt
2. For each workspace:
   - Derive new workspace key with new salt
   - Decrypt all keys with old workspace key
   - Re-encrypt all keys with new workspace key
3. Update `ENCRYPTION_HKDF_SALT` environment variable
4. Restart application

**Note**: This is a resource-intensive operation. Plan for maintenance window.

## Disaster Recovery

### Backup Strategy

1. **Environment Variables**
   - Backup `ENCRYPTION_KEY` and `ENCRYPTION_HKDF_SALT`
   - Store encrypted backups in multiple secure locations
   - Use hardware security modules (HSM) for production

2. **Database Backups**
   - Regular database backups include encrypted keys
   - Encrypted keys are useless without master encryption key
   - Test restore procedures regularly

3. **Key Recovery**
   - Without master key, encrypted keys cannot be recovered
   - Users must re-enter API keys if master key is lost
   - Document key recovery procedures

### Recovery Procedures

**Scenario 1: Database Corruption**
1. Restore database from backup
2. Master encryption key remains valid
3. All keys remain accessible

**Scenario 2: Lost Master Encryption Key**
1. Encrypted keys in database cannot be decrypted
2. Users must re-enter all API keys
3. Old encrypted keys should be purged
4. Generate new master key and HKDF salt

**Scenario 3: Compromised Master Key**
1. Generate new master key immediately
2. Re-encrypt all BYOK keys with new key
3. Notify users of security incident (if required by regulations)
4. Review audit logs for unauthorized access

## Testing Requirements

### Unit Tests

- ✅ AES-256-GCM encryption/decryption
- ✅ Workspace-scoped key derivation with HKDF
- ✅ IV randomness (different for each encryption)
- ✅ Authentication tag validation (tamper detection)
- ✅ Cross-workspace isolation
- ✅ Error handling (invalid formats, wrong keys)

### Integration Tests

- ✅ Create encrypted key for workspace
- ✅ Retrieve and decrypt key
- ✅ Cross-workspace access prevention (403 Forbidden)
- ✅ Soft delete functionality
- ✅ Audit logging verification
- ✅ Rate limiting enforcement

### Security Tests

- ✅ Log redaction (keys never in logs)
- ✅ Audit logs never contain plaintext
- ✅ Workspace isolation at encryption level
- ✅ Input validation (key format enforcement)
- ✅ Error messages don't leak sensitive data

## Production Checklist

Before deploying BYOK to production:

- [ ] Generate strong `ENCRYPTION_KEY` (64 hex chars)
- [ ] Generate strong `ENCRYPTION_HKDF_SALT` (64 hex chars)
- [ ] Store keys in secure environment variable system (AWS Secrets Manager, HashiCorp Vault)
- [ ] Test key backup and restore procedures
- [ ] Verify workspace isolation with multiple test workspaces
- [ ] Confirm audit logging captures all operations
- [ ] Verify log redaction works across all log levels
- [ ] Test rate limiting with load testing
- [ ] Run full security test suite
- [ ] Document disaster recovery procedures
- [ ] Schedule key rotation reminder (12-24 months)
- [ ] Configure monitoring/alerting for decryption failures

## Security Contacts

For security concerns related to BYOK encryption:

- **Security Team**: security@devos.com
- **Emergency**: +1-XXX-XXX-XXXX
- **Bug Bounty**: hackerone.com/devos

## References

- [NIST Special Publication 800-38D (GCM)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [RFC 5869: HMAC-based Extract-and-Expand Key Derivation Function (HKDF)](https://www.rfc-editor.org/rfc/rfc5869)
- [SOC2 Trust Service Criteria](https://www.aicpa.org/resources/landing/soc-2-examination-guide)
- [GDPR Article 32: Security of Processing](https://gdpr-info.eu/art-32-gdpr/)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)

---

**Document Version**: 1.0
**Last Updated**: 2026-01-31
**Author**: DevOS Security Team
**Status**: Production Ready
