/**
 * Tracing Instrumentation Bootstrap
 * Story 14.4: Jaeger Distributed Tracing (AC2)
 *
 * CRITICAL: This file MUST be imported BEFORE any other modules in main.ts.
 * OpenTelemetry needs to monkey-patch HTTP, pg, and ioredis modules before
 * they are loaded by NestJS or any other library.
 *
 * Environment variables:
 * - OTEL_ENABLED: Enable/disable tracing (default: "false")
 * - OTEL_SERVICE_NAME: Service name (default: "devos-api")
 * - OTEL_EXPORTER_OTLP_ENDPOINT: Jaeger OTLP endpoint (default: "http://jaeger:4318")
 * - OTEL_TRACES_SAMPLER: Sampling strategy (default: "always_on")
 * - OTEL_TRACES_SAMPLER_ARG: Sampling rate (default: "1.0")
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Guard against multiple initializations (prevents signal handler leaks
// which cause MaxListenersExceeded warnings in test environments)
let sdkInstance: NodeSDK | undefined;

export function setupTracing(): NodeSDK | undefined {
  // Return existing instance if already initialized
  if (sdkInstance) {
    return sdkInstance;
  }

  const enabled = process.env.OTEL_ENABLED === 'true';

  if (!enabled) {
    return undefined;
  }

  // Enable diagnostic logging in debug mode
  if (process.env.OTEL_DEBUG === 'true') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const serviceName = process.env.OTEL_SERVICE_NAME || 'devos-api';
  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318';
  const environment = process.env.NODE_ENV || 'development';
  const serviceVersion = process.env.npm_package_version || '0.1.0';

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });

  const spanProcessor = new BatchSpanProcessor(traceExporter, {
    maxQueueSize: 2048,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 30000,
  });

  const sdk = new NodeSDK({
    resource,
    spanProcessors: [spanProcessor],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-ioredis': {
          enabled: true,
        },
        // Disable instrumentations we don't need to reduce noise
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-dns': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-net': {
          enabled: false,
        },
      }),
    ],
  });

  try {
    sdk.start();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to start OpenTelemetry SDK (tracing disabled):', err);
    return undefined;
  }

  // Graceful shutdown
  const shutdown = async () => {
    try {
      await sdk.shutdown();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error shutting down OpenTelemetry SDK:', err);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  sdkInstance = sdk;
  return sdk;
}

// Auto-initialize tracing when this module is imported
setupTracing();
