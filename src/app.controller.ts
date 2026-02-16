import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

/**
 * AppController
 * Root controller for the DevOS API.
 *
 * Note: The /health endpoint has been moved to HealthController
 * in the HealthModule (Story 14.5).
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
