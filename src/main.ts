// CRITICAL: Tracing instrumentation MUST be loaded before any other imports
// to ensure OpenTelemetry can monkey-patch HTTP, pg, and ioredis modules.
// Story 14.4: Jaeger Distributed Tracing (AC2)
import './modules/tracing/tracing.instrumentation';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import * as session from 'express-session';
import { AppModule } from './app.module';
import { validateEnvironmentVariables } from './common/config/env.validation';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RetryAfterInterceptor } from './common/interceptors/retry-after.interceptor';
import { LoggingService } from './modules/logging/logging.service';
import { buildSwaggerConfig, swaggerCustomOptions } from './modules/swagger/swagger.config';

async function bootstrap() {
  // Validate environment variables before starting application
  validateEnvironmentVariables();

  // Create Winston-based logger before NestFactory to capture bootstrap logs
  const loggingService = new LoggingService();

  const app = await NestFactory.create(AppModule, {
    logger: loggingService,
  });

  // Enable cookie parsing for JWT token management
  app.use(cookieParser());

  // Configure session for password-protected shared links
  const sessionTTL = parseInt(
    process.env.SHARED_LINK_SESSION_TTL || '1800',
    10,
  ); // 30 minutes default
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'devos-session-secret-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: sessionTTL * 1000, // Convert to milliseconds
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      },
    }),
  );

  // Apply global exception filter for standardized error responses
  app.useGlobalFilters(new HttpExceptionFilter());

  // Apply global interceptor to add Retry-After header to 429 responses
  app.useGlobalInterceptors(new RetryAfterInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Story 16.10: Swagger API Documentation (AC1)
  const swaggerConfig = buildSwaggerConfig();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, swaggerCustomOptions);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  loggingService.log(`DevOS API is running on: http://localhost:${port}`, 'Bootstrap');
  loggingService.log(`Swagger UI available at: http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
