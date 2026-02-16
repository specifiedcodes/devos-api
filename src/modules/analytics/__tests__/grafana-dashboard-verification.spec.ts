import * as fs from 'fs';
import * as path from 'path';

/**
 * Grafana Dashboard Data Verification
 * Story 16.8: Frontend Analytics Data Verification
 *
 * Verifies that Grafana dashboard JSON files reference valid Prometheus metrics
 * and data sources that exist in the MetricsService registry.
 */

// Known metrics registered by MetricsService and sub-services (Story 14.1, 14.3, 14.5)
const KNOWN_PROMETHEUS_METRICS = [
  // Default Node.js metrics (prefixed with devos_)
  'devos_process_cpu_user_seconds_total',
  'devos_process_cpu_system_seconds_total',
  'devos_process_cpu_seconds_total',
  'devos_process_start_time_seconds',
  'devos_process_resident_memory_bytes',
  'devos_nodejs_eventloop_lag_seconds',
  'devos_nodejs_eventloop_lag_mean_seconds',
  'devos_nodejs_eventloop_lag_stddev_seconds',
  'devos_nodejs_active_handles_total',
  'devos_nodejs_active_requests_total',
  'devos_nodejs_heap_size_total_bytes',
  'devos_nodejs_heap_size_used_bytes',
  'devos_nodejs_external_memory_bytes',
  'devos_nodejs_gc_duration_seconds',
  // HTTP metrics (HttpMetricsInterceptor)
  'devos_http_requests_total',
  'devos_http_request_duration_seconds',
  'devos_http_request_duration_seconds_bucket',
  'devos_http_request_size_bytes',
  'devos_http_response_size_bytes',
  // Health check metrics (HealthMetricsService)
  'devos_health_check_status',
  'devos_dependency_up',
  'devos_active_websocket_connections',
  // Auth metrics (AuthMetricsService)
  'devos_auth_login_total',
  'devos_auth_login_failed_total',
  'devos_auth_registration_total',
  'devos_auth_token_refresh_total',
  'devos_auth_2fa_verification_total',
  'devos_auth_active_sessions_total',
  'devos_auth_attempts_total',
  // Business metrics (BusinessMetricsService)
  'devos_workspaces_total',
  'devos_projects_total',
  'devos_projects_created_total',
  'devos_users_total',
  'devos_stories_total',
  'devos_agents_total',
  'devos_deployments_total',
  'devos_ai_api_cost_total',
  'devos_ai_api_cost_usd_total',
  'devos_ai_api_requests_total',
  'devos_ai_spend_cap_usage_ratio',
  'devos_spend_cap_events_total',
  // Queue metrics (QueueMetricsService)
  'devos_queue_jobs_total',
  'devos_queue_jobs_active',
  'devos_queue_jobs_waiting',
  'devos_queue_jobs_completed_total',
  'devos_queue_jobs_failed_total',
  'devos_queue_job_duration_seconds',
  'devos_bullmq_jobs_processed_total',
  'devos_bullmq_job_duration_seconds_bucket',
  // Database metrics (DatabaseMetricsService)
  'devos_db_query_duration_seconds',
  'devos_db_pool_active_connections',
  'devos_db_pool_idle_connections',
  'devos_db_pool_total_connections',
  'devos_database_pool_active',
  'devos_database_query_duration_seconds_bucket',
  // Redis metrics (RedisMetricsService)
  'devos_redis_commands_total',
  'devos_redis_commands_processed_total',
  'devos_redis_command_duration_seconds',
  'devos_redis_connected_clients',
  'devos_redis_memory_used_bytes',
  'devos_redis_keyspace_hits_total',
  'devos_redis_keyspace_misses_total',
];

// Infrastructure metrics from external exporters (node_exporter, redis_exporter, postgres_exporter)
const KNOWN_INFRASTRUCTURE_METRICS = [
  'node_cpu_seconds_total',
  'node_memory_MemTotal_bytes',
  'node_memory_MemAvailable_bytes',
  'node_filesystem_size_bytes',
  'node_filesystem_avail_bytes',
  'node_network_receive_bytes_total',
  'node_network_transmit_bytes_total',
  'redis_connected_clients',
  'redis_used_memory',
  'redis_commands_processed_total',
  'pg_stat_activity_count',
  'pg_stat_database_tup_returned',
  'pg_stat_database_tup_fetched',
  'pg_stat_database_tup_inserted',
  'pg_stat_database_tup_updated',
  'pg_stat_database_tup_deleted',
];

const ALL_KNOWN_METRICS = [...KNOWN_PROMETHEUS_METRICS, ...KNOWN_INFRASTRUCTURE_METRICS];

const DASHBOARD_DIR = path.resolve(__dirname, '../../../../../grafana/dashboards');

/**
 * Extract metric names from a PromQL expression
 */
function extractMetricNames(expr: string): string[] {
  // Match metric names in PromQL (word characters before { or [ or space)
  const metricPattern = /\b([a-zA-Z_:][a-zA-Z0-9_:]*)\s*[{[\s(]/g;
  const metrics: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = metricPattern.exec(expr)) !== null) {
    const name = match[1];
    // Filter out PromQL functions and keywords
    const promqlKeywords = [
      'rate', 'sum', 'avg', 'max', 'min', 'count', 'increase', 'histogram_quantile',
      'irate', 'delta', 'deriv', 'predict_linear', 'label_replace', 'label_join',
      'absent', 'absent_over_time', 'ceil', 'floor', 'round', 'clamp_max', 'clamp_min',
      'changes', 'resets', 'sort', 'sort_desc', 'time', 'vector', 'group', 'on',
      'ignoring', 'by', 'without', 'and', 'or', 'unless', 'topk', 'bottomk',
      'quantile', 'stddev', 'stdvar', 'count_values', 'group_left', 'group_right',
    ];
    if (!promqlKeywords.includes(name)) {
      metrics.push(name);
    }
  }

  return [...new Set(metrics)];
}

/**
 * Parse all PromQL targets from a Grafana dashboard JSON
 */
function extractDashboardMetrics(dashboardJson: any): { panelTitle: string; metrics: string[] }[] {
  const results: { panelTitle: string; metrics: string[] }[] = [];

  function traversePanels(panels: any[]) {
    for (const panel of panels) {
      if (panel.panels && Array.isArray(panel.panels)) {
        traversePanels(panel.panels);
      }
      if (panel.targets && Array.isArray(panel.targets)) {
        const panelMetrics: string[] = [];
        for (const target of panel.targets) {
          if (target.expr) {
            panelMetrics.push(...extractMetricNames(target.expr));
          }
        }
        if (panelMetrics.length > 0) {
          results.push({
            panelTitle: panel.title || 'Unknown Panel',
            metrics: [...new Set(panelMetrics)],
          });
        }
      }
    }
  }

  if (dashboardJson.panels) {
    traversePanels(dashboardJson.panels);
  }

  return results;
}

describe('Grafana Dashboard Data Verification', () => {
  const dashboardFiles = [
    'application-overview.json',
    'business-metrics.json',
    'ai-operations.json',
    'infrastructure.json',
    'log-exploration.json',
    'tracing-overview.json',
  ];

  it('should verify all dashboard JSON files exist', () => {
    for (const file of dashboardFiles) {
      const filePath = path.join(DASHBOARD_DIR, file);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  it('should verify all dashboard files are valid JSON', () => {
    for (const file of dashboardFiles) {
      const filePath = path.join(DASHBOARD_DIR, file);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    }
  });

  it('should verify application-overview dashboard queries reference known Prometheus metrics', () => {
    const filePath = path.join(DASHBOARD_DIR, 'application-overview.json');
    if (!fs.existsSync(filePath)) return;
    const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const panelMetrics = extractDashboardMetrics(dashboard);

    expect(panelMetrics.length).toBeGreaterThan(0);

    for (const panel of panelMetrics) {
      for (const metric of panel.metrics) {
        expect(ALL_KNOWN_METRICS).toContain(metric);
      }
    }
  });

  it('should verify business-metrics dashboard queries reference valid data sources', () => {
    const filePath = path.join(DASHBOARD_DIR, 'business-metrics.json');
    if (!fs.existsSync(filePath)) return;
    const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const panelMetrics = extractDashboardMetrics(dashboard);

    expect(panelMetrics.length).toBeGreaterThan(0);

    for (const panel of panelMetrics) {
      for (const metric of panel.metrics) {
        expect(ALL_KNOWN_METRICS).toContain(metric);
      }
    }
  });

  it('should verify ai-operations dashboard queries match agent metrics', () => {
    const filePath = path.join(DASHBOARD_DIR, 'ai-operations.json');
    if (!fs.existsSync(filePath)) return;
    const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const panelMetrics = extractDashboardMetrics(dashboard);

    expect(panelMetrics.length).toBeGreaterThan(0);

    for (const panel of panelMetrics) {
      for (const metric of panel.metrics) {
        expect(ALL_KNOWN_METRICS).toContain(metric);
      }
    }
  });

  it('should verify infrastructure dashboard queries reference standard exporters', () => {
    const filePath = path.join(DASHBOARD_DIR, 'infrastructure.json');
    if (!fs.existsSync(filePath)) return;
    const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const panelMetrics = extractDashboardMetrics(dashboard);

    expect(panelMetrics.length).toBeGreaterThan(0);

    for (const panel of panelMetrics) {
      for (const metric of panel.metrics) {
        expect(ALL_KNOWN_METRICS).toContain(metric);
      }
    }
  });

  it('should verify all dashboards have unique IDs across panels', () => {
    for (const file of dashboardFiles) {
      const filePath = path.join(DASHBOARD_DIR, file);
      if (!fs.existsSync(filePath)) continue;
      const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      const panelIds = new Set<number>();
      function collectIds(panels: any[]) {
        for (const panel of panels) {
          if (panel.id !== undefined) {
            expect(panelIds.has(panel.id)).toBe(false);
            panelIds.add(panel.id);
          }
          if (panel.panels && Array.isArray(panel.panels)) {
            collectIds(panel.panels);
          }
        }
      }

      if (dashboard.panels) {
        collectIds(dashboard.panels);
      }
    }
  });

  it('should verify dashboards use prometheus data source for metric panels', () => {
    for (const file of ['application-overview.json', 'business-metrics.json', 'ai-operations.json', 'infrastructure.json']) {
      const filePath = path.join(DASHBOARD_DIR, file);
      if (!fs.existsSync(filePath)) continue;
      const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      function checkDatasource(panels: any[]) {
        for (const panel of panels) {
          if (panel.targets && panel.targets.length > 0 && panel.targets[0].expr) {
            // Panels with PromQL expressions should use prometheus datasource
            expect(panel.datasource).toBeDefined();
            expect(panel.datasource.type).toBe('prometheus');
          }
          if (panel.panels && Array.isArray(panel.panels)) {
            checkDatasource(panel.panels);
          }
        }
      }

      if (dashboard.panels) {
        checkDatasource(dashboard.panels);
      }
    }
  });

  it('should verify metric dashboard descriptions are non-empty', () => {
    const metricDashboards = [
      'application-overview.json',
      'business-metrics.json',
      'ai-operations.json',
      'infrastructure.json',
    ];
    for (const file of metricDashboards) {
      const filePath = path.join(DASHBOARD_DIR, file);
      if (!fs.existsSync(filePath)) continue;
      const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(dashboard.description).toBeDefined();
      expect(dashboard.description.length).toBeGreaterThan(0);
    }
  });
});
