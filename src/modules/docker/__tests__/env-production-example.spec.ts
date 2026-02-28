import * as fs from 'fs';
import * as path from 'path';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const ENV_FILE = path.join(DEVOS_ROOT, '.env.production.example');
const shouldRun = fs.existsSync(ENV_FILE);

(shouldRun ? describe : describe.skip)('Production Environment Example Validation', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(ENV_FILE, 'utf-8');
  });

  it('should contain all required environment variables', () => {
    const requiredVars = [
      'POSTGRES_USER',
      'POSTGRES_PASSWORD',
      'POSTGRES_DB',
      'REDIS_PASSWORD',
      'NEO4J_PASSWORD',
      'JWT_SECRET',
      'ENCRYPTION_KEY',
      'ENCRYPTION_HKDF_SALT',
      'SESSION_SECRET',
      'CORS_ORIGIN',
      'NEXT_PUBLIC_API_URL',
      'NEXT_PUBLIC_WS_URL',
      'SMTP_HOST',
      'SMTP_PORT',
      'GRAFANA_PASSWORD',
    ];
    for (const varName of requiredVars) {
      expect(content).toContain(varName);
    }
  });

  it('should not contain actual secrets', () => {
    const lines = content.split('\n');
    for (const line of lines) {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || line.trim() === '') continue;

      const match = line.match(/^([^=]+)=(.*)/);
      if (!match) continue;

      const [, key, rawValue] = match;
      // Strip inline comments (text after # preceded by whitespace)
      const valueWithoutComment = rawValue.replace(/\s+#.*$/, '').trim();

      // Check for sensitive variable names
      if (
        key.includes('PASSWORD') ||
        key.includes('SECRET') ||
        key.includes('ENCRYPTION_KEY') ||
        key.includes('ENCRYPTION_HKDF_SALT')
      ) {
        // Value should be empty or contain placeholder text (not real secrets)
        expect(valueWithoutComment).toBe('');
      }
    }

    // Assert no 64-character hex strings are present as actual values
    const hexPattern = /=[a-f0-9]{64}\s*$/m;
    expect(content).not.toMatch(hexPattern);
  });

  it('should document all required fields', () => {
    const requiredComments = content.match(/# REQUIRED:/g) || [];
    expect(requiredComments.length).toBeGreaterThanOrEqual(10);
  });

  it('should use non-localhost URLs', () => {
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('#')) continue;

      if (line.startsWith('CORS_ORIGIN=')) {
        expect(line).not.toContain('localhost');
      }
      if (line.startsWith('NEXT_PUBLIC_API_URL=')) {
        expect(line).not.toContain('localhost');
      }
      if (line.startsWith('NEXT_PUBLIC_WS_URL=')) {
        expect(line).not.toContain('localhost');
      }
    }
  });
});
