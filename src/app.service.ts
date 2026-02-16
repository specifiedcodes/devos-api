import { Injectable } from '@nestjs/common';

/**
 * AppService
 *
 * Note: Health-related Prometheus gauges (devos_health_check_status,
 * devos_uptime_seconds, devos_app_info) and the getHealth() method
 * have been migrated to HealthMetricsService in the HealthModule (Story 14.5).
 */
@Injectable()
export class AppService {
  getHello(): string {
    return 'DevOS API is running!';
  }
}
