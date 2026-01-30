import { Logger } from '@nestjs/common';

/**
 * Validates critical environment variables on application startup
 * Prevents application from starting with insecure or missing configuration
 */
export function validateEnvironmentVariables(): void {
  const logger = new Logger('EnvironmentValidation');
  const errors: string[] = [];
  const warnings: string[] = [];

  // Critical: JWT Secret
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    errors.push('JWT_SECRET is not defined. Set a secure random string (min 32 characters).');
  } else if (jwtSecret.length < 32) {
    errors.push(`JWT_SECRET must be at least 32 characters long. Current length: ${jwtSecret.length}`);
  }

  // Critical: Database Password
  const dbPassword = process.env.DATABASE_PASSWORD;
  if (!dbPassword) {
    errors.push('DATABASE_PASSWORD is not defined.');
  } else if (dbPassword === 'devos_password' || dbPassword === 'password' || dbPassword === 'admin') {
    if (process.env.NODE_ENV === 'production') {
      errors.push('DATABASE_PASSWORD uses a default/insecure value in production. Change immediately!');
    } else {
      warnings.push('DATABASE_PASSWORD uses a default value. This is acceptable for development but MUST be changed for production.');
    }
  }

  // Critical: Database Configuration
  if (!process.env.DATABASE_HOST) {
    warnings.push('DATABASE_HOST not set, using default: localhost');
  }
  if (!process.env.DATABASE_NAME) {
    warnings.push('DATABASE_NAME not set, using default: devos_db');
  }
  if (!process.env.DATABASE_USER) {
    warnings.push('DATABASE_USER not set, using default: devos');
  }

  // Production-specific checks
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.CORS_ORIGIN) {
      errors.push('CORS_ORIGIN must be set in production to restrict API access.');
    }

    if (process.env.DATABASE_HOST === 'localhost') {
      warnings.push('DATABASE_HOST is localhost in production. This may be incorrect.');
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    logger.warn('Environment configuration warnings:');
    warnings.forEach((warning, index) => {
      logger.warn(`  ${index + 1}. ${warning}`);
    });
  }

  // Throw errors if any critical issues found
  if (errors.length > 0) {
    logger.error('Environment configuration errors:');
    errors.forEach((error, index) => {
      logger.error(`  ${index + 1}. ${error}`);
    });
    throw new Error(
      `Environment validation failed with ${errors.length} error(s). Application cannot start.`,
    );
  }

  logger.log('Environment validation passed ✓');
}
