# DevOS API

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

4. Ensure PostgreSQL is running and create the database:

```sql
CREATE DATABASE devos_db;
CREATE USER devos WITH PASSWORD 'devos_password';
GRANT ALL PRIVILEGES ON DATABASE devos_db TO devos;
```

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

## Learn More

- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)
- [PostgreSQL Documentation](https://www.postgresql.org/docs)

## License

MIT
