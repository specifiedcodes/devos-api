import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { validateEnvironmentVariables } from './common/config/env.validation';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RetryAfterInterceptor } from './common/interceptors/retry-after.interceptor';

async function bootstrap() {
  // Validate environment variables before starting application
  validateEnvironmentVariables();

  const app = await NestFactory.create(AppModule);

  // Enable cookie parsing for JWT token management
  app.use(cookieParser());

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

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`DevOS API is running on: http://localhost:${port}`);
}

bootstrap();
