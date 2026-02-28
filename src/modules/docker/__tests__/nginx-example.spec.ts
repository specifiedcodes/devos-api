import * as fs from 'fs';
import * as path from 'path';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const NGINX_CONF_PATH = path.join(DEVOS_ROOT, 'docs', 'nginx-example.conf');
const shouldRun = fs.existsSync(NGINX_CONF_PATH);

(shouldRun ? describe : describe.skip)('Nginx Example Configuration Validation', () => {
  let content: string;

  beforeAll(() => {
    expect(fs.existsSync(NGINX_CONF_PATH)).toBe(true);
    content = fs.readFileSync(NGINX_CONF_PATH, 'utf-8');
  });

  it('should have nginx example configuration', () => {
    expect(fs.existsSync(NGINX_CONF_PATH)).toBe(true);
    expect(content.length).toBeGreaterThan(100);
  });

  it('should configure proxy pass for all services', () => {
    // Check that all 4 user-facing service ports are configured
    // (via upstream blocks or direct proxy_pass directives)
    // Frontend (port 3000)
    expect(content).toMatch(/3000/);
    expect(content).toMatch(/proxy_pass\s+http:\/\//);
    // API (port 3001)
    expect(content).toMatch(/3001/);
    // WebSocket (port 3002)
    expect(content).toMatch(/3002/);
    // Grafana (port 3003)
    expect(content).toMatch(/3003/);
    // Verify proxy_pass directives exist for each upstream
    expect(content).toMatch(/proxy_pass\s+http:\/\/frontend/);
    expect(content).toMatch(/proxy_pass\s+http:\/\/api/);
    expect(content).toMatch(/proxy_pass\s+http:\/\/websocket/);
    expect(content).toMatch(/proxy_pass\s+http:\/\/grafana/);
  });

  it('should configure WebSocket upgrade', () => {
    expect(content).toContain('proxy_set_header Upgrade');
    expect(content).toContain('proxy_set_header Connection');
  });

  it('should configure SSL', () => {
    expect(content).toContain('ssl_certificate');
    expect(content).toContain('ssl_certificate_key');
    expect(content).toMatch(/443/);
  });

  it('should configure security headers', () => {
    expect(content).toMatch(/Strict-Transport-Security|HSTS/);
    expect(content).toContain('X-Frame-Options');
    expect(content).toContain('X-Content-Type-Options');
  });
});
