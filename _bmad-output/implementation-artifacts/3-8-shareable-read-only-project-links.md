---
story_id: "3-8-shareable-read-only-project-links"
epic_id: "epic-3-cost-tracking"
epic_name: "Cost Tracking & Usage Analytics"
title: "Shareable Read-Only Project Links"
status: "ready-for-dev"
created_at: "2026-01-31"
sprint_id: "sprint-1"
story_points: 8
priority: "high"
---

# Story 3.8: Shareable Read-Only Project Links

## User Story

As a **workspace owner**,
I want to create shareable links,
So that external stakeholders can view projects.

## Business Context

This feature enables workspace owners to share project progress with external stakeholders (clients, investors, team members outside the platform) without requiring them to create accounts or access sensitive data. This improves transparency and collaboration while maintaining security.

## Acceptance Criteria

### AC1: Create Shareable Link UI

**Given** I want to share a project with a client or investor
**When** I navigate to Project Settings → Sharing
**Then** I can:
1. See "Sharing" tab in project settings
2. Click "Create Shareable Link" button
3. Configure link settings:
   - Expiration: 7 days / 30 days / Never (dropdown)
   - Password protection (optional, toggle + input)
   - View permissions (read-only, default)
4. Click "Generate Link"
5. System generates unique URL: `https://devos.com/share/{token}`
6. Copy link to clipboard with one-click button
7. See link in "Active Links" list below

### AC2: Shared Links Table

**Given** we need to persist shareable links
**When** implementing the database schema
**Then** create `shared_links` table with:

```typescript
{
  id: UUID (primary key),
  project_id: UUID (foreign key to projects),
  workspace_id: UUID (foreign key to workspaces, for isolation),
  token: STRING (unique, URL-safe, 32 chars),
  created_by_user_id: UUID (foreign key to users),
  expires_at: TIMESTAMP (nullable),
  password_hash: STRING (nullable, bcrypt),
  is_active: BOOLEAN (default true),
  view_count: INTEGER (default 0),
  last_viewed_at: TIMESTAMP (nullable),
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP
}
```

**And** indexes:
- Unique index on `token`
- Index on `project_id`
- Index on `workspace_id`
- Index on `is_active`
- Composite index on `(token, is_active)` for fast lookups

### AC3: Link Generation API

**Given** user wants to create a shareable link
**When** I call `POST /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links`
**Then** the API:
1. Validates user has Owner/Admin role in workspace
2. Validates project belongs to workspace
3. Generates cryptographically secure random token (32 chars, URL-safe)
4. Hashes password if provided (bcrypt, 10 rounds)
5. Creates record in `shared_links` table
6. Returns response:
```json
{
  "id": "uuid",
  "token": "abc123...",
  "url": "https://devos.com/share/abc123...",
  "expiresAt": "2026-02-07T12:00:00Z",
  "hasPassword": true,
  "createdAt": "2026-01-31T12:00:00Z"
}
```

**And** request body:
```json
{
  "expiresIn": "7days", // "7days" | "30days" | "never"
  "password": "optional-password"
}
```

### AC4: Accessing Shared Link

**Given** someone accesses a shared link
**When** I navigate to `https://devos.com/share/{token}`
**Then** the system:
1. Validates token exists and is active
2. Checks if link has expired (if `expires_at` is set)
3. If password protected:
   - Shows password input form
   - Validates password on submit
   - Sets session cookie on success (30 min TTL)
4. If valid, shows read-only project view
5. Increments `view_count`
6. Updates `last_viewed_at` timestamp

**And** validation error handling:
- Invalid token: 404 "Link not found"
- Expired link: 410 "This link has expired"
- Inactive link: 403 "This link has been revoked"
- Wrong password: 401 "Incorrect password"

### AC5: Read-Only Project View

**Given** user accessed a valid shared link
**When** viewing the shared project
**Then** I see:
1. Simplified project view with:
   - Project name and description
   - Deployment URLs (if available)
   - Project status (Active/Archived)
   - Last updated timestamp
   - "Powered by DevOS" watermark/footer
2. NO access to:
   - API keys or BYOK settings
   - Usage/cost data
   - Project settings or preferences
   - Edit capabilities
   - User information
   - Workspace settings

**And** responsive design:
- Mobile-optimized layout
- Works on all screen sizes
- Clean, professional appearance

### AC6: Link Management API

**Given** I want to manage shared links
**When** I use the link management endpoints
**Then** I can:

1. **List all links for a project:**
   - `GET /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links`
   - Returns array of link metadata (without tokens)
   - Requires Viewer+ role

2. **Revoke a link:**
   - `DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links/:linkId`
   - Sets `is_active = false`
   - Requires Owner/Admin role
   - Returns 204 No Content

3. **Get link details:**
   - `GET /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links/:linkId`
   - Returns full link details including token
   - Requires Owner/Admin role

### AC7: Security & Privacy

**Given** shared links expose project data
**When** implementing the feature
**Then** ensure:

1. **Token security:**
   - Use crypto.randomBytes(24).toString('base64url') for tokens
   - Tokens are unpredictable and unguessable
   - 32+ character length

2. **Password protection:**
   - Bcrypt with cost factor 10
   - No password hints or recovery
   - Rate limit password attempts (5 attempts per 15 min per IP)

3. **Data filtering:**
   - Never expose sensitive fields in shared view
   - Whitelist approach for exposed data
   - Log access attempts in audit log

4. **Workspace isolation:**
   - All queries filter by workspace_id
   - Shared links can only access data from their workspace
   - No cross-workspace information leakage

### AC8: Link Management UI

**Given** I have created shared links
**When** I view Project Settings → Sharing
**Then** I see table of active links with:
- Token (last 8 chars visible: `...abc12345`)
- Full URL (copyable)
- Expires (date or "Never")
- Protected (Yes/No)
- Views count
- Last viewed timestamp
- Actions: Copy URL, Revoke

**And** actions:
- Copy URL button copies to clipboard
- Revoke button shows confirmation modal
- After revoke, link disappears from list (filtered out)
- Empty state: "No active links. Create one to share this project."

## Technical Implementation

### Backend Tasks

1. **Create migration for shared_links table**
   - File: `src/database/migrations/TIMESTAMP-CreateSharedLinksTable.ts`
   - Table schema as per AC2
   - Indexes for performance

2. **Create SharedLink entity**
   - File: `src/database/entities/shared-link.entity.ts`
   - TypeORM entity with relations to Project, Workspace, User

3. **Create SharedLinksService**
   - File: `src/modules/shared-links/services/shared-links.service.ts`
   - Methods:
     - `create(projectId, workspaceId, userId, options)`
     - `findByToken(token)`
     - `findAllByProject(projectId, workspaceId)`
     - `revoke(linkId, workspaceId)`
     - `validateAccess(token, password?)`
     - `incrementViewCount(linkId)`

4. **Create SharedLinksController**
   - File: `src/modules/shared-links/controllers/shared-links.controller.ts`
   - Endpoints as per AC3 & AC6
   - Guards: JwtAuthGuard, RoleGuard for management endpoints
   - No auth required for share view endpoint

5. **Create SharedViewController**
   - File: `src/modules/shared-links/controllers/shared-view.controller.ts`
   - Public endpoint: `GET /share/:token`
   - Password validation
   - Session management for password-protected links
   - Returns sanitized project data

6. **Create DTOs**
   - `CreateSharedLinkDto`: expiration, password
   - `SharedLinkResponseDto`: public-facing link metadata
   - `SharedProjectViewDto`: sanitized project data for public view

7. **Update ProjectsModule**
   - Import SharedLinksModule
   - Add routes for shared link management

8. **Add rate limiting for password attempts**
   - Use @nestjs/throttler
   - 5 attempts per 15 minutes per IP
   - Apply to password validation endpoint

### Frontend Tasks (Future Epic)

1. **Create Sharing tab in Project Settings**
2. **Create SharedLinkManager component**
3. **Create PublicProjectView component**
4. **Add password protection modal**
5. **Add copy-to-clipboard functionality**
6. **Add link expiration countdown**

### Testing Requirements

1. **Unit Tests** (Target: 90% coverage)
   - SharedLinksService: All methods
   - Token generation uniqueness
   - Password hashing/validation
   - Expiration logic
   - View count increment

2. **Integration Tests**
   - Create link flow (with/without password, various expirations)
   - Access link flow (valid, expired, wrong password)
   - Revoke link flow
   - List links flow
   - Workspace isolation (cannot access other workspace links)

3. **E2E Tests**
   - Full workflow: Create → Access → Revoke
   - Password-protected link workflow
   - Expired link handling
   - Security: Token guessing prevention
   - Rate limiting on password attempts

4. **Security Tests**
   - Cannot access sensitive data via shared link
   - Cannot modify project via shared link
   - Token randomness validation
   - Password brute-force protection
   - Workspace isolation verification

## API Endpoints

### Management Endpoints (Authenticated)

```
POST   /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links
GET    /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links
GET    /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links/:linkId
DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links/:linkId
```

### Public Endpoints (Unauthenticated)

```
GET    /share/:token
POST   /share/:token/validate-password
```

## Database Schema

```sql
CREATE TABLE shared_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMP WITH TIME ZONE,
  password_hash VARCHAR(255),
  is_active BOOLEAN DEFAULT true NOT NULL,
  view_count INTEGER DEFAULT 0 NOT NULL,
  last_viewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX idx_shared_links_token ON shared_links(token);
CREATE INDEX idx_shared_links_project_id ON shared_links(project_id);
CREATE INDEX idx_shared_links_workspace_id ON shared_links(workspace_id);
CREATE INDEX idx_shared_links_is_active ON shared_links(is_active);
CREATE INDEX idx_shared_links_token_active ON shared_links(token, is_active);
```

## Security Considerations

1. **Token Security**
   - 256-bit entropy for tokens (32 bytes → 43 chars base64url)
   - Use crypto.randomBytes, not Math.random
   - Constant-time token comparison to prevent timing attacks

2. **Password Protection**
   - Bcrypt with cost factor 10 (configurable via env)
   - Rate limiting: 5 attempts per 15 minutes per IP
   - No password recovery mechanism (by design)

3. **Data Sanitization**
   - Whitelist approach for exposed fields
   - Never expose: API keys, cost data, user emails, workspace settings
   - Expose: Project name, description, deployment URLs, status

4. **Audit Logging**
   - Log shared link creation (who, when, project)
   - Log shared link revocation (who, when)
   - Log access attempts (token, timestamp, IP, success/failure)
   - Log password validation failures

5. **Workspace Isolation**
   - All queries include workspace_id filter
   - Cannot access links from other workspaces
   - Row-level security on shared_links table

## Performance Considerations

1. **Database Indexes**
   - Composite index on (token, is_active) for fast lookups
   - Index on project_id for management queries

2. **Caching**
   - Cache active shared links in Redis (TTL: 5 minutes)
   - Cache key: `shared_link:token:{token}`
   - Invalidate on revoke or expiration

3. **Query Optimization**
   - Use select specific fields, not SELECT *
   - Limit relations loaded in public view
   - Use database-level expiration check

## Error Handling

```typescript
// Custom exceptions
class SharedLinkNotFoundException extends NotFoundException {}
class SharedLinkExpiredException extends GoneException {}
class SharedLinkRevokedException extends ForbiddenException {}
class InvalidPasswordException extends UnauthorizedException {}
class TooManyPasswordAttemptsException extends TooManyRequestsException {}
```

## Environment Variables

```bash
# Shared Links Configuration
SHARED_LINK_TOKEN_LENGTH=32
SHARED_LINK_PASSWORD_BCRYPT_ROUNDS=10
SHARED_LINK_PASSWORD_RATE_LIMIT=5 # attempts per window
SHARED_LINK_PASSWORD_RATE_WINDOW=900 # seconds (15 min)
SHARED_LINK_SESSION_TTL=1800 # seconds (30 min)
```

## Dependencies

- `@nestjs/common` - Already installed
- `@nestjs/typeorm` - Already installed
- `typeorm` - Already installed
- `bcrypt` - Already installed (for user passwords)
- `@nestjs/throttler` - Add for rate limiting
- `crypto` (Node.js built-in) - For token generation

## Files to Create/Modify

### New Files

1. `src/database/migrations/TIMESTAMP-CreateSharedLinksTable.ts`
2. `src/database/entities/shared-link.entity.ts`
3. `src/modules/shared-links/shared-links.module.ts`
4. `src/modules/shared-links/services/shared-links.service.ts`
5. `src/modules/shared-links/services/shared-links.service.spec.ts`
6. `src/modules/shared-links/controllers/shared-links.controller.ts`
7. `src/modules/shared-links/controllers/shared-links.controller.spec.ts`
8. `src/modules/shared-links/controllers/shared-view.controller.ts`
9. `src/modules/shared-links/controllers/shared-view.controller.spec.ts`
10. `src/modules/shared-links/dto/create-shared-link.dto.ts`
11. `src/modules/shared-links/dto/shared-link-response.dto.ts`
12. `src/modules/shared-links/dto/shared-project-view.dto.ts`
13. `src/modules/shared-links/dto/validate-password.dto.ts`
14. `src/modules/shared-links/exceptions/shared-link.exceptions.ts`
15. `test/shared-links.e2e-spec.ts`
16. `test/shared-links-security.e2e-spec.ts`

### Modified Files

1. `src/app.module.ts` - Import SharedLinksModule
2. `src/modules/projects/projects.module.ts` - Add shared-links relation
3. `package.json` - Add @nestjs/throttler if not present

## Definition of Done

- [ ] All acceptance criteria met and verified
- [ ] Database migration created and tested
- [ ] All backend endpoints implemented
- [ ] All DTOs and entities created
- [ ] Unit tests written and passing (90%+ coverage)
- [ ] Integration tests written and passing
- [ ] E2E tests written and passing
- [ ] Security tests passing (workspace isolation, token security, password protection)
- [ ] Rate limiting implemented and tested
- [ ] Audit logging implemented
- [ ] Error handling comprehensive
- [ ] API documentation updated (Swagger)
- [ ] Environment variables documented
- [ ] Code reviewed and approved
- [ ] No console.log statements or debugging code
- [ ] No TypeScript errors or warnings
- [ ] Linting passes (ESLint)
- [ ] Sprint status YAML updated to "review"

## Dependencies & Blockers

**Depends On:**
- Story 3.7: Per-Workspace Cost Isolation (completed) - Provides workspace isolation patterns
- Existing Projects module - Base functionality
- Existing authentication/authorization - Role guards

**Blocks:**
- Frontend implementation of shared links UI (Epic 7)
- Mobile app shared link viewing (Epic 10)

## Estimated Effort

- Story Points: 8
- Estimated Hours: 16-20 hours
- Complexity: Medium-High

**Breakdown:**
- Database schema & migration: 2 hours
- Entity & DTOs: 2 hours
- Service layer: 4 hours
- Controllers: 3 hours
- Rate limiting & security: 3 hours
- Testing (unit + integration + E2E): 6 hours
- Documentation & cleanup: 1 hour

## Success Metrics

- [ ] Can create shareable link with all configuration options
- [ ] Can access shared link without authentication
- [ ] Password-protected links work correctly
- [ ] Expired links return 410 Gone
- [ ] Revoked links return 403 Forbidden
- [ ] View counter increments accurately
- [ ] No sensitive data exposed in shared view
- [ ] Workspace isolation 100% effective
- [ ] Rate limiting blocks brute force attempts
- [ ] All security tests pass
- [ ] 90%+ test coverage

## Notes

- This story focuses on backend API implementation
- Frontend UI will be implemented in Epic 7 (Visual Project Management Dashboard)
- Public shared view will initially show basic project info; can be enhanced in future sprints
- Consider adding analytics for link sharing patterns in future iterations
- Future enhancement: Add granular permission controls (show/hide specific sections)

## References

- Epic 3: Cost Management with BYOK
- Architecture Document: Multi-tenancy & Security sections
- PRD: Shareable Links requirements
- Story 3.7: Workspace isolation patterns
