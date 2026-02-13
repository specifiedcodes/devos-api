# Templates Module

## Overview

The Templates Module provides a registry of predefined project templates that users can select during project creation. Templates are stored as TypeScript constants (not in database) for simplicity and performance in the MVP phase.

## Architecture

### Design Pattern: Hardcoded Registry

Templates are defined in `constants/template-registry.constant.ts` as readonly TypeScript objects. This approach offers several advantages:

- **Zero Database Queries**: Templates are loaded from memory (JavaScript constants)
- **Version Controlled**: Templates are versioned with code, easy to track changes
- **Fast Deployment**: No database migrations needed for template changes
- **Type Safety**: Full TypeScript support with compile-time validation
- **Performance**: < 5ms response time for template listing

### Future Migration Path

The current architecture is designed to support future migration to database storage if needed (e.g., for a template marketplace feature). The DTO layer abstracts the data source, making the transition seamless.

## API Endpoints

All endpoints are **public** (no authentication required) as templates are static metadata.

### GET /api/v1/templates

Returns all available templates.

**Response**: Array of `TemplateResponseDto`

**Example**:
```bash
curl http://localhost:3001/api/v1/templates
```

### GET /api/v1/templates/:templateId

Returns a single template by ID.

**Parameters**:
- `templateId` (path): Template identifier (e.g., `nextjs-saas-starter`)

**Response**: `TemplateResponseDto` or 404 if not found

**Example**:
```bash
curl http://localhost:3001/api/v1/templates/nextjs-saas-starter
```

### GET /api/v1/templates/category/:category

Returns templates filtered by category.

**Parameters**:
- `category` (path): Template category (saas, ecommerce, mobile, api)

**Response**: Array of `TemplateResponseDto`

**Example**:
```bash
curl http://localhost:3001/api/v1/templates/category/saas
```

## Available Templates

1. **Next.js SaaS Starter** (recommended)
   - ID: `nextjs-saas-starter`
   - Category: `saas`
   - Tech Stack: Next.js 15, React 19, TypeScript, Tailwind CSS, tRPC, Prisma
   - Use Case: B2B/B2C SaaS products with auth, billing, dashboard

2. **E-commerce Platform**
   - ID: `ecommerce-platform`
   - Category: `ecommerce`
   - Tech Stack: Next.js 15, Stripe, Shopify API, PostgreSQL
   - Use Case: E-commerce with product management, cart, checkout

3. **Mobile App (React Native)**
   - ID: `mobile-app-react-native`
   - Category: `mobile`
   - Tech Stack: React Native, Expo, TypeScript, NativeWind
   - Use Case: Cross-platform mobile apps with API integration

4. **API-Only Backend (NestJS)**
   - ID: `api-backend-nestjs`
   - Category: `api`
   - Tech Stack: NestJS, TypeORM, PostgreSQL, Swagger
   - Use Case: RESTful API backend services

## Data Structure

### ProjectTemplate Interface

```typescript
interface ProjectTemplate {
  id: string;                    // Unique identifier
  name: string;                  // Display name
  description: string;           // Detailed description
  category: TemplateCategory;    // saas | ecommerce | mobile | api
  techStack: TechStack;          // Technology stack details
  defaultPreferences: DefaultPreferences; // Default project preferences
  icon?: string;                 // Icon identifier for UI
  recommended: boolean;          // Featured template flag
  tags: string[];                // Searchable tags
}
```

### TechStack Interface

```typescript
interface TechStack {
  framework: string;      // e.g., "Next.js 15"
  language: string;       // e.g., "TypeScript"
  styling?: string;       // e.g., "Tailwind CSS"
  database?: string;      // e.g., "PostgreSQL"
  orm?: string;           // e.g., "Prisma"
  apiLayer?: string;      // e.g., "tRPC"
  testing: string[];      // e.g., ["Jest", "Playwright"]
  additional?: string[];  // e.g., ["Stripe", "NextAuth.js"]
}
```

### DefaultPreferences Interface

```typescript
interface DefaultPreferences {
  repoStructure: 'monorepo' | 'polyrepo';
  codeStyle: string;          // e.g., "ESLint + Prettier"
  testingStrategy: string;    // e.g., "Jest + RTL"
  cicd?: string;              // e.g., "GitHub Actions"
}
```

## Integration with Project Creation

Templates integrate with the `ProjectsModule` to streamline project creation:

1. User calls `GET /templates` to browse available templates
2. User selects a template (e.g., `nextjs-saas-starter`)
3. Frontend calls `POST /projects` with `templateId` and optional preference overrides
4. `ProjectsService` fetches template via `TemplatesService.getTemplateForProject()`
5. System merges template defaults with user overrides
6. Project is created with merged preferences

### Helper Method for Project Creation

The `TemplatesService` provides a helper method specifically for project creation:

```typescript
getTemplateForProject(templateId: string): {
  techStack: TechStack;
  preferences: DefaultPreferences;
}
```

This method extracts only the data needed for project setup, omitting UI-specific fields.

## Testing

### Unit Tests

- **TemplatesService**: 23 test cases covering all service methods
- **TemplatesController**: 6 test cases covering all endpoints

Run unit tests:
```bash
npm test -- templates.service.spec.ts
npm test -- templates.controller.spec.ts
```

### Integration Tests (E2E)

- **templates.e2e-spec.ts**: 20 test cases covering full HTTP request/response cycle

Run e2e tests:
```bash
npm run test:e2e -- templates.e2e-spec.ts
```

## Swagger Documentation

Access Swagger UI at: `http://localhost:3001/api/docs`

All endpoints are documented with:
- Operation descriptions
- Parameter definitions
- Response schemas with examples
- Error responses

## Adding New Templates

To add a new template to the registry:

1. Open `constants/template-registry.constant.ts`
2. Add new template object to `TEMPLATE_REGISTRY` array
3. Follow the existing template structure
4. Update this README with the new template details
5. Run tests to ensure no breaking changes

**Note**: Only one template should have `recommended: true` at a time.

## Performance Considerations

- **Response Time**: < 5ms for all endpoints (in-memory data)
- **Scalability**: Can handle millions of requests without performance impact
- **Caching**: Not needed - data is already in memory
- **Database Load**: Zero - no database queries

## Security Considerations

- **Public Endpoints**: No authentication required (templates are not sensitive data)
- **Read-Only**: Templates cannot be modified via API (hardcoded in code)
- **Input Validation**: Path parameters are validated to prevent injection attacks
- **Rate Limiting**: Consider adding if template marketplace is introduced

## Future Enhancements

Potential features for future epics:

1. **Template Marketplace**
   - Migrate to database storage
   - Community-contributed templates
   - Template versioning
   - Template ratings and reviews

2. **Template Preview**
   - Screenshot gallery
   - Live demo URLs
   - Code sample viewer

3. **Template Analytics**
   - Usage tracking
   - Popular templates dashboard
   - Conversion metrics

4. **Custom Templates**
   - User-created templates
   - Private workspace templates
   - Template sharing between workspaces
