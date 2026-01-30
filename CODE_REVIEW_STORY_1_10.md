# Code Review: Story 1-10 Session Management & Security Monitoring

**Story Status:** Review
**Epic:** Epic 1 - User Authentication & Account Management
**Reviewer:** Claude Sonnet 4.5
**Review Date:** 2026-01-30
**Review Type:** Comprehensive Security & Implementation Review

---

## Executive Summary

Story 1-10 implements session management and security monitoring features for the DevOS platform. This code review identified **8 issues** requiring attention before merging to production:

- **3 HIGH severity issues** - Must fix before deployment
- **4 MEDIUM severity issues** - Should fix for production quality
- **1 LOW severity issue** - Nice to have improvement

**Overall Assessment:** The implementation covers core requirements but has critical issues with anomaly detection integration, session management consistency, and test failures that must be addressed.

---

## Issues Found

### Issue 1: Missing Anomaly Detection Integration in Login Flow
**Severity:** HIGH
**Category:** Security / Feature Incomplete
**Status:** Not Fixed

**Problem:**
The `AnomalyDetectionService` is implemented but NOT integrated into the actual login flow. The service methods `detectLoginAnomaly()` and `detectMultipleFailedAttempts()` are never called from `AuthService.login()` or `AuthController.login()`.

**Impact:**
- Story acceptance criteria for anomaly detection (AC #2) is NOT met
- New country login detection is not working
- Multiple failed attempt detection and lockout is not working
- Email notifications for suspicious activity are not being sent
- Platform is vulnerable to brute force attacks

**Evidence:**
```typescript
// auth.service.ts - login() method (lines 370-489)
async login(loginDto: LoginDto, ipAddress: string, userAgent: string) {
  // ... login logic ...
  // NO calls to anomalyDetectionService.detectLoginAnomaly()
  // NO calls to anomalyDetectionService.detectMultipleFailedAttempts()
}
```

**Required Fix:**
```typescript
// In AuthService.login(), AFTER password validation fails:
if (!isPasswordValid) {
  // Check for multiple failed attempts BEFORE logging event
  const shouldLock = await this.anomalyDetectionService.detectMultipleFailedAttempts(
    loginDto.email.toLowerCase(),
    ipAddress
  );

  if (shouldLock) {
    throw new UnauthorizedException('Account temporarily locked due to multiple failed attempts');
  }

  // Log failed login event...
  throw new UnauthorizedException('Invalid email or password');
}

// AFTER successful login (before returning):
// Trigger anomaly detection (non-blocking)
this.anomalyDetectionService.detectLoginAnomaly(user.id, ipAddress, user.email)
  .catch(error => this.logger.error('Anomaly detection failed', error));
```

**Files to modify:**
- `/Users/rajatpratapsingh/Desktop/devos/devos-api/src/modules/auth/auth.service.ts`
- `/Users/rajatpratapsingh/Desktop/devos/devos-api/src/modules/auth/auth.module.ts` (inject AnomalyDetectionService)

---

### Issue 2: Incorrect Password Change Endpoint Route
**Severity:** HIGH
**Category:** API Design / Routing

**Problem:**
The password change endpoint is defined as `POST /api/auth/password/change` in the controller (line 393), but tests expect `POST /api/auth/change-password`. This causes 404 errors in tests and will break frontend integration.

**Impact:**
- Test failures: `auth-security-session.e2e-spec.ts` test "should revoke all user tokens on password change" fails with 404
- API documentation (Swagger) will show incorrect endpoint
- Frontend will not be able to call password change functionality

**Evidence:**
```typescript
// auth.controller.ts line 393
@Post('password/change')  // ❌ Wrong route
async changePassword(...)

// test expects: POST /api/auth/change-password (line 253)
await request(app.getHttpServer())
  .post('/api/auth/change-password')  // ❌ Mismatch
```

**Required Fix:**
Change controller route to match standard REST conventions:
```typescript
// Option 1: Match test expectations
@Post('change-password')
async changePassword(...)

// Option 2: Update tests to match current route (less preferred)
// Update all tests to use /api/auth/password/change
```

**Recommendation:** Use `@Post('password/change')` and update tests for better REST naming.

**Files to modify:**
- `/Users/rajatpratapsingh/Desktop/devos/devos-api/src/modules/auth/auth.controller.ts` (line 393) OR
- `/Users/rajatpratapsingh/Desktop/devos/devos-api/test/auth-security-session.e2e-spec.ts` (line 253)

---

### Issue 3: Session Tokens Not Revoked When Deleting Session
**Severity:** HIGH
**Category:** Security / Token Management

**Problem:**
When a user deletes a session via `DELETE /api/auth/sessions/:sessionId`, only the Redis session entry is deleted. The associated access and refresh tokens are NOT added to the blacklist, meaning they can still be used until expiration.

**Impact:**
- Revoked sessions can still access protected endpoints
- Security vulnerability: stolen tokens remain valid after session deletion
- Story requirement "token revocation on session deletion" not fully met

**Evidence:**
```typescript
// auth.service.ts lines 1229-1237
async deleteSession(userId: string, sessionId: string): Promise<void> {
  await this.redisService.del(`session:${userId}:${sessionId}`);
  // ❌ Missing: Get session data and revoke tokens before deleting
  await this.logSecurityEvent({...});
}
```

**Required Fix:**
```typescript
async deleteSession(userId: string, sessionId: string): Promise<void> {
  // 1. Get session data BEFORE deleting
  const sessionData = await this.redisService.get(`session:${userId}:${sessionId}`);

  if (sessionData) {
    const session: Session = JSON.parse(sessionData);

    // 2. Revoke both tokens
    await this.revokeToken(session.access_token_jti, new Date(session.expires_at));
    await this.revokeToken(session.refresh_token_jti, new Date(session.expires_at));
  }

  // 3. Delete session from Redis
  await this.redisService.del(`session:${userId}:${sessionId}`);

  // 4. Log event
  await this.logSecurityEvent({
    user_id: userId,
    event_type: SecurityEventType.SESSION_DELETED,
    metadata: { session_id: sessionId },
  });
}
```

**Files to modify:**
- `/Users/rajatpratapsingh/Desktop/devos/devos-api/src/modules/auth/auth.service.ts` (lines 1229-1237)

---

### Issue 4: Security Event Logging Query Inconsistency
**Severity:** MEDIUM
**Category:** Data Integrity

**Problem:**
Security event queries in tests use `email` column to find events, but not all security events populate the `email` field. For example, `LOGIN_SUCCESS` events after registration use `user_id` but tests query by `email`.

**Impact:**
- Test failures: "should log successful registration event" expects to find event by email but event might not have email set
- Inconsistent security audit trail
- Difficult to track all events for a user

**Evidence:**
```typescript
// Test queries by email (line 43-49)
SELECT * FROM security_events
WHERE email = $1 AND event_type = 'login_success'

// But logSecurityEvent() for registration (line 334-341) may only set user_id:
await this.logSecurityEvent({
  user_id: savedUser.id,
  event_type: SecurityEventType.LOGIN_SUCCESS,
  ip_address: ipAddress,
  user_agent: userAgent,
  metadata: { registration: true },
  // ❌ email not set!
});
```

**Required Fix:**
Ensure ALL security events include both `user_id` AND `email` when available:
```typescript
// In register() method (line 334)
await this.logSecurityEvent({
  user_id: savedUser.id,
  email: savedUser.email,  // ✅ Add this
  event_type: SecurityEventType.LOGIN_SUCCESS,
  ip_address: ipAddress,
  user_agent: userAgent,
  metadata: { registration: true },
});

// In login() method (line 469)
await this.logSecurityEvent({
  user_id: user.id,
  email: user.email,  // ✅ Add this
  event_type: SecurityEventType.LOGIN_SUCCESS,
  ip_address: ipAddress,
  user_agent: userAgent,
});
```

**Files to modify:**
- `/Users/rajatpratapsingh/Desktop/devos/devos-api/src/modules/auth/auth.service.ts` (lines 334, 469, 716, 758, 886, 989)

---

### Issue 5: Refresh Token Endpoint Doesn't Update Session
**Severity:** MEDIUM
**Category:** Session Management

**Problem:**
When a refresh token is used to get new access tokens (`POST /api/auth/refresh`), new tokens are generated with new JTIs, but the session in Redis is NOT updated with the new JTIs. This causes session tracking to become outdated.

**Impact:**
- Session management shows old JTIs that don't match current tokens
- `updateSessionActivity()` won't find the session by JTI after refresh
- Session last_active timestamp won't be updated for refreshed tokens
- User might see stale session information

**Evidence:**
```typescript
// auth.service.ts refreshAccessToken() (lines 539-606)
async refreshAccessToken(refreshToken: string): Promise<AuthResponseDto> {
  // Generates new tokens with new JTIs
  const newAccessToken = this.jwtService.sign(
    { sub: user.id, email: user.email },  // ❌ No JTI!
    { expiresIn: this.ACCESS_TOKEN_EXPIRY },
  );

  const newRefreshToken = this.jwtService.sign(
    { sub: user.id, email: user.email },  // ❌ No JTI!
    { expiresIn: this.REFRESH_TOKEN_EXPIRY },
  );

  // ❌ No session update!
}
```

**Required Fix:**
```typescript
async refreshAccessToken(refreshToken: string): Promise<AuthResponseDto> {
  // 1. Verify refresh token
  const payload = this.jwtService.verify(refreshToken) as { sub: string; jti?: string };

  // 2. Find session by old refresh JTI
  const oldSession = payload.jti
    ? await this.getSessionByTokenJti(payload.sub, payload.jti)
    : null;

  // 3. Generate new tokens with NEW JTIs
  const newAccessJti = uuidv4();
  const newRefreshJti = uuidv4();

  const newAccessToken = this.jwtService.sign(
    { sub: user.id, email: user.email, jti: newAccessJti },
    { expiresIn: this.ACCESS_TOKEN_EXPIRY },
  );

  const newRefreshToken = this.jwtService.sign(
    { sub: user.id, jti: newRefreshJti },
    { expiresIn: this.REFRESH_TOKEN_EXPIRY },
  );

  // 4. Update session with new JTIs
  if (oldSession) {
    oldSession.access_token_jti = newAccessJti;
    oldSession.refresh_token_jti = newRefreshJti;
    oldSession.last_active = new Date();

    const ttl = Math.floor((new Date(oldSession.expires_at).getTime() - Date.now()) / 1000);
    await this.redisService.set(
      `session:${user.id}:${oldSession.session_id}`,
      JSON.stringify(oldSession),
      ttl
    );
  }

  // 5. Blacklist old tokens...
}
```

**Files to modify:**
- `/Users/rajatpratapsingh/Desktop/devos/devos-api/src/modules/auth/auth.service.ts` (lines 539-606)

---

### Issue 6: Missing Email Validation in Anomaly Detection
**Severity:** MEDIUM
**Category:** Data Validation

**Problem:**
The `detectMultipleFailedAttempts()` method queries security events by email without normalizing it to lowercase. Since emails are stored lowercase in the database, queries with mixed-case emails will fail to find matching events.

**Impact:**
- Account lockout won't trigger if attacker uses different case variations
- Example: "User@Example.com" vs "user@example.com" are treated as different
- Security bypass vulnerability

**Evidence:**
```typescript
// anomaly-detection.service.ts line 93
const failedAttempts = await this.securityEventRepository.count({
  where: {
    email,  // ❌ Not normalized to lowercase!
    event_type: SecurityEventType.LOGIN_FAILED,
    ip_address: ipAddress,
    created_at: MoreThanOrEqual(fifteenMinutesAgo),
  },
});
```

**Required Fix:**
```typescript
async detectMultipleFailedAttempts(
  email: string,
  ipAddress: string,
): Promise<boolean> {
  try {
    const normalizedEmail = email.toLowerCase();  // ✅ Normalize
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const failedAttempts = await this.securityEventRepository.count({
      where: {
        email: normalizedEmail,  // ✅ Use normalized
        event_type: SecurityEventType.LOGIN_FAILED,
        ip_address: ipAddress,
        created_at: MoreThanOrEqual(fifteenMinutesAgo),
      },
    });
    // ...
}
```

**Files to modify:**
- `/Users/rajatpratapsingh/Desktop/devos/devos-api/src/modules/auth/services/anomaly-detection.service.ts` (line 86)

---

### Issue 7: Session Routes Don't Handle Invalid Session IDs
**Severity:** MEDIUM
**Category:** Error Handling

**Problem:**
The `DELETE /api/auth/sessions/:sessionId` endpoint doesn't verify that the session actually exists or belongs to the user before attempting to delete it. This could lead to silent failures or attempting to delete non-existent sessions.

**Impact:**
- Poor user experience: no error when trying to delete invalid session
- Security concern: could attempt to delete other users' sessions (though unlikely due to key pattern)
- Inconsistent API behavior

**Evidence:**
```typescript
// auth.controller.ts lines 490-502
@Delete('sessions/:sessionId')
async revokeSession(
  @Req() req: Request & { user: any },
  @Param('sessionId') sessionId: string,
): Promise<{ message: string }> {
  await this.authService.deleteSession(req.user.userId, sessionId);
  // ❌ No check if session exists or belongs to user
  return { message: 'Session revoked successfully' };
}
```

**Required Fix:**
```typescript
async deleteSession(userId: string, sessionId: string): Promise<void> {
  // 1. Verify session exists
  const sessionData = await this.redisService.get(`session:${userId}:${sessionId}`);

  if (!sessionData) {
    throw new NotFoundException(`Session ${sessionId} not found`);
  }

  // 2. Parse and revoke tokens...
  // 3. Delete session...
}
```

**Files to modify:**
- `/Users/rajatpratapsingh/Desktop/devos/devos-api/src/modules/auth/auth.service.ts` (line 1229)

---

### Issue 8: DELETE /sessions/all Route Conflict
**Severity:** LOW
**Category:** API Design

**Problem:**
The route `DELETE /api/auth/sessions/all` could conflict with `DELETE /api/auth/sessions/:sessionId` if Express interprets "all" as a session ID parameter. While this works in NestJS due to route ordering, it's not ideal API design.

**Impact:**
- Potential confusion for API consumers
- Could break if route order changes
- Not RESTful design pattern

**Evidence:**
```typescript
// auth.controller.ts
@Delete('sessions/:sessionId')  // Line 490
async revokeSession(...)

@Delete('sessions/all')  // Line 504 - could match as sessionId="all"
async revokeAllOtherSessions(...)
```

**Recommended Fix:**
Use a more RESTful design:
```typescript
// Option 1: Use action endpoint
@Delete('sessions')  // Deletes all except current
@Delete('sessions/:sessionId')  // Deletes specific

// Option 2: Use query parameter
@Delete('sessions?all=true')  // Deletes all except current
@Delete('sessions/:sessionId')  // Deletes specific
```

**Files to modify:**
- `/Users/rajatpratapsingh/Desktop/devos/devos-api/src/modules/auth/auth.controller.ts` (line 504)

---

## Additional Observations

### Positive Findings ✅

1. **Comprehensive Security Event Types** - Well-defined enum covers all authentication events
2. **Proper Token Blacklisting** - JTI-based revocation with TTL is correctly implemented
3. **Session Data Structure** - Session interface includes all required metadata
4. **Database Indexes** - Proper indexes on security_events table for performance
5. **JWT Strategy Integration** - Token revocation check in JWT strategy is correct
6. **Security Dashboard** - Dashboard metrics are comprehensive and useful
7. **Migration Quality** - Database migration is well-structured with proper indexes

### Code Quality Issues (Non-Blocking)

1. **Missing AnomalyDetectionService Injection** - Need to inject in AuthModule
2. **TODO Comments** - Email service is placeholder (acceptable for now)
3. **Test Data Cleanup** - E2E tests don't clean up test users after run
4. **Hardcoded Values** - Some values (TTLs, lockout thresholds) should be config
5. **Error Logging** - Some error paths log but don't provide enough context

---

## Test Results

**Test File:** `auth-security-session.e2e-spec.ts`

**Results:**
- ✅ 7 tests passing
- ❌ 3 tests failing

**Failing Tests:**
1. "should log successful registration event" - Email field not populated in security event
2. "should log successful login event" - Email field not populated in security event
3. "should revoke all user tokens on password change" - 404 error (wrong endpoint route)

**Root Causes:**
- Issue #4 (Security Event Logging Query Inconsistency)
- Issue #2 (Incorrect Password Change Endpoint Route)

---

## Acceptance Criteria Coverage

| AC # | Requirement | Status | Issues |
|------|-------------|--------|--------|
| AC1 | Security event logging (all types) | ⚠️ Partial | Issue #4 - Email field inconsistency |
| AC2 | Anomaly detection (new country, lockout, API usage) | ❌ Not Met | Issue #1 - Not integrated into login flow |
| AC3 | Security dashboard (admin) | ✅ Complete | None |
| AC4 | Session table in Redis | ✅ Complete | None |
| AC5 | Token revocation system | ⚠️ Partial | Issue #3 - Session deletion doesn't revoke tokens |

**Overall Story Completion: 60%**

---

## Security Assessment

### Critical Security Issues

1. **No Account Lockout** (Issue #1) - Brute force attacks not prevented
2. **No Anomaly Detection** (Issue #1) - Suspicious logins not detected
3. **Session Token Leak** (Issue #3) - Deleted sessions can still be used

### Security Best Practices Followed

✅ JTI-based token revocation
✅ Redis TTL matches token expiration
✅ Comprehensive audit trail
✅ Password verification for sensitive operations
✅ Session metadata tracking (IP, user agent)
✅ Token blacklist checked in JWT strategy

---

## Recommendations

### Must Fix Before Merge (HIGH Priority)

1. **Fix Issue #1** - Integrate anomaly detection into login flow
2. **Fix Issue #2** - Correct password change endpoint route
3. **Fix Issue #3** - Revoke tokens when deleting session
4. **Fix Issue #4** - Add email to all security events

### Should Fix Before Production (MEDIUM Priority)

5. **Fix Issue #5** - Update session on token refresh
6. **Fix Issue #6** - Normalize email in anomaly detection
7. **Fix Issue #7** - Validate session existence before deletion

### Nice to Have (LOW Priority)

8. **Fix Issue #8** - Refactor DELETE /sessions/all route

---

## Estimated Fix Time

- HIGH issues (1-4): **4-6 hours**
- MEDIUM issues (5-7): **2-3 hours**
- LOW issues (8): **30 minutes**

**Total: 6.5 - 9.5 hours**

---

## Auto-Fix Recommendations

The following issues can be auto-fixed with high confidence:

- ✅ Issue #2 (Password endpoint route) - Simple route change
- ✅ Issue #4 (Email field in events) - Add email parameter to calls
- ✅ Issue #6 (Email normalization) - Add toLowerCase()
- ⚠️ Issue #1 (Anomaly integration) - Requires service injection and flow changes
- ⚠️ Issue #3 (Token revocation) - Requires logic addition
- ⚠️ Issue #5 (Session update) - Requires refactoring refresh flow
- ⚠️ Issue #7 (Session validation) - Requires error handling

**Auto-fixable: 3/8 issues**

---

## Next Steps

1. **Developer:** Fix all HIGH severity issues (#1-4)
2. **Developer:** Run E2E tests to verify fixes
3. **Developer:** Fix MEDIUM severity issues (#5-7)
4. **Code Reviewer:** Re-review after fixes
5. **QA:** Perform security testing
6. **DevOps:** Update sprint-status.yaml to 'done' after all fixes

---

## Files Requiring Changes

```
HIGH Priority:
- src/modules/auth/auth.service.ts (Issues #1, #2, #3, #4)
- src/modules/auth/auth.module.ts (Issue #1 - inject AnomalyDetectionService)
- src/modules/auth/auth.controller.ts (Issue #2)

MEDIUM Priority:
- src/modules/auth/auth.service.ts (Issues #5, #7)
- src/modules/auth/services/anomaly-detection.service.ts (Issue #6)

LOW Priority:
- src/modules/auth/auth.controller.ts (Issue #8)
```

---

## Conclusion

Story 1-10 has a solid foundation with well-structured security event logging, session management, and token revocation. However, **critical functionality is missing**: anomaly detection is not integrated, and several security gaps exist that must be addressed before this can be considered production-ready.

**Recommendation:** **DO NOT MERGE** until HIGH priority issues are resolved and tests pass.

---

**Reviewer:** Claude Sonnet 4.5
**Review Completed:** 2026-01-30 14:52 PST
**Next Review:** After developer fixes issues
