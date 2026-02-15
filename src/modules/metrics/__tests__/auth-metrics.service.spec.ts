import { Registry } from 'prom-client';
import { AuthMetricsService } from '../services/auth-metrics.service';
import { MetricsService } from '../metrics.service';

describe('AuthMetricsService', () => {
  let service: AuthMetricsService;
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
    const metricsService = {
      getRegistry: () => registry,
    } as MetricsService;

    service = new AuthMetricsService(metricsService);
  });

  afterEach(async () => {
    await registry.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('auth attempts counter', () => {
    it('should increment auth_attempts_total with result=success on successful login event', async () => {
      service.handleLoginSuccess();

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('devos_auth_attempts_total');
      expect(metricsText).toContain('result="success"');
    });

    it('should increment auth_attempts_total with result=failure on failed login event', async () => {
      service.handleLoginFailure();

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('devos_auth_attempts_total');
      expect(metricsText).toContain('result="failure"');
    });

    it('should increment auth_attempts_total with result=2fa_required on 2FA event', async () => {
      service.handle2faRequired();

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('devos_auth_attempts_total');
      expect(metricsText).toContain('result="2fa_required"');
    });

    it('should increment counter via direct method', async () => {
      service.recordAuthAttempt('success');
      service.recordAuthAttempt('failure');
      service.recordAuthAttempt('2fa_required');

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('result="success"');
      expect(metricsText).toContain('result="failure"');
      expect(metricsText).toContain('result="2fa_required"');
    });
  });

  describe('active sessions gauge', () => {
    it('should increment active sessions on session created', async () => {
      service.handleSessionCreated();
      service.handleSessionCreated();

      const metrics = await registry.getMetricsAsJSON();
      const sessionsGauge = metrics.find(
        (m) => m.name === 'devos_auth_active_sessions',
      );
      expect(sessionsGauge).toBeDefined();
      expect((sessionsGauge as any)?.values?.[0]?.value).toBe(2);
    });

    it('should decrement active sessions on session destroyed', async () => {
      service.handleSessionCreated();
      service.handleSessionCreated();
      service.handleSessionDestroyed();

      const metrics = await registry.getMetricsAsJSON();
      const sessionsGauge = metrics.find(
        (m) => m.name === 'devos_auth_active_sessions',
      );
      expect((sessionsGauge as any)?.values?.[0]?.value).toBe(1);
    });

    it('should set active sessions count via direct method', async () => {
      service.setActiveSessions(42);

      const metrics = await registry.getMetricsAsJSON();
      const sessionsGauge = metrics.find(
        (m) => m.name === 'devos_auth_active_sessions',
      );
      expect((sessionsGauge as any)?.values?.[0]?.value).toBe(42);
    });
  });
});
