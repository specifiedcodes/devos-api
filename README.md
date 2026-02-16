# DevOS API

![CI](https://github.com/devos-platform/devos-api/actions/workflows/ci.yml/badge.svg)

NestJS backend API for the DevOS platform - an AI-powered development platform with autonomous agent orchestration.

## Technology Stack

- **Framework:** NestJS 11
- **Language:** TypeScript (strict mode)
- **Database:** PostgreSQL with TypeORM
- **Authentication:** JWT with Passport
- **Validation:** class-validator and class-transformer
- **Testing:** Jest

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher
- PostgreSQL 14.x or higher

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Update the `.env` file with your database and JWT configuration.

4. **Generate encryption key for 2FA (CRITICAL):**

```bash
# Generate a secure 256-bit encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and set it as `ENCRYPTION_KEY` in your `.env` file.

5. Ensure PostgreSQL is running and create the database:

```sql
CREATE DATABASE devos_db;
CREATE USER devos WITH PASSWORD 'devos_password';
GRANT ALL PRIVILEGES ON DATABASE devos_db TO devos;
```

6. Run database migrations:

```bash
npm run migration:run
```

This will create all required tables including:
- `users` - User accounts
- `workspaces` - Workspace tenants
- `workspace_members` - Workspace membership
- `backup_codes` - Two-factor authentication backup codes

### Development

Run the development server with hot-reload:

```bash
npm run start:dev
```

The API will be available at [http://localhost:3001](http://localhost:3001)

### Build

Build for production:

```bash
npm run build
```

### Start Production Server

```bash
npm run start:prod
```

### Testing

Run unit tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Run tests with coverage:

```bash
npm run test:cov
```

Run e2e tests:

```bash
npm run test:e2e
```

**IMPORTANT:** E2E tests require a running PostgreSQL database. Before running e2e tests:

1. Ensure PostgreSQL is running
2. Database `devos_db` exists with proper credentials
3. Run migrations to set up schema:
   ```bash
   npm run migration:run
   ```
4. E2E tests will use the same database configured in `.env`

To run e2e tests in isolation with a test database, update your `.env` to use a separate test database (recommended):
```bash
DATABASE_NAME=devos_db_test
```

### Linting

Run ESLint:

```bash
npm run lint
```

Format code:

```bash
npm run format
```

## Project Structure

```
devos-api/
├── src/
│   ├── app.controller.ts    # Main application controller
│   ├── app.module.ts         # Root module
│   ├── app.service.ts        # Main application service
│   └── main.ts               # Application entry point
├── test/                     # E2E tests
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules
├── nest-cli.json             # NestJS CLI configuration
├── package.json              # Dependencies and scripts
└── tsconfig.json             # TypeScript configuration
```

## API Endpoints

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-29T12:00:00.000Z"
}
```

## Environment Variables

See `.env.example` for required environment variables:

- `NODE_ENV` - Application environment (development/production)
- `PORT` - API server port
- `DATABASE_HOST` - PostgreSQL host
- `DATABASE_PORT` - PostgreSQL port
- `DATABASE_USER` - PostgreSQL username
- `DATABASE_PASSWORD` - PostgreSQL password
- `DATABASE_NAME` - PostgreSQL database name
- `JWT_SECRET` - JWT secret key
- `JWT_EXPIRES_IN` - JWT expiration time
- `REFRESH_TOKEN_EXPIRES_IN` - Refresh token expiration time
- `BCRYPT_ROUNDS` - Bcrypt hashing rounds
- `CORS_ORIGIN` - Allowed CORS origin
- `REDIS_HOST` - Redis host for token blacklist
- `REDIS_PORT` - Redis port
- `ENCRYPTION_KEY` - 256-bit key for 2FA secret encryption (64 hex characters)

## Two-Factor Authentication (2FA)

DevOS implements TOTP-based two-factor authentication using industry-standard authenticator apps.

### 2FA Features

- **TOTP Secret Generation**: Uses `speakeasy` library for secure secret generation
- **QR Code Setup**: Easy scanning with Google Authenticator, Authy, 1Password, etc.
- **Backup Codes**: 10 single-use recovery codes (SHA-256 hashed)
- **Encryption**: AES-256-GCM encryption for storing TOTP secrets
- **Password Verification**: Required for disable/regenerate operations

### 2FA Dependencies

The following npm packages are required for 2FA functionality:

```bash
npm install speakeasy qrcode
npm install --save-dev @types/speakeasy @types/qrcode
```

### Testing 2FA Locally

1. Start the API server: `npm run start:dev`
2. Register a new account via `POST /api/auth/register`
3. Navigate to Security Settings in the frontend
4. Click "Enable 2FA" and scan the QR code with your authenticator app
5. Enter the 6-digit verification code
6. Save the 10 backup codes in a secure location

### 2FA Endpoints

- `POST /api/auth/me` - Get current user profile with 2FA status
- `POST /api/auth/2fa/enable` - Initiate 2FA setup (returns QR code and backup codes)
- `POST /api/auth/2fa/verify-setup` - Verify setup with TOTP code
- `POST /api/auth/2fa/disable` - Disable 2FA (requires password)
- `POST /api/auth/2fa/backup-codes/regenerate` - Generate new backup codes

### Security Considerations

- **Never commit** `.env` file with real `ENCRYPTION_KEY`
- **Rotate keys** if exposed (requires re-enabling 2FA for all users)
- **Backup codes** are single-use and hashed with SHA-256
- **TOTP window** is 30 seconds with 1-step clock drift tolerance
- **Rate limiting** on verification endpoint prevents brute force attacks

## Learn More

- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)
- [PostgreSQL Documentation](https://www.postgresql.org/docs)

## License

MIT
