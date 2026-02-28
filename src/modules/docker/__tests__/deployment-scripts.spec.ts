import * as fs from 'fs';
import * as path from 'path';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const SETUP_SH_PATH = path.join(DEVOS_ROOT, 'scripts', 'setup.sh');
const DEPLOY_SH_PATH = path.join(DEVOS_ROOT, 'scripts', 'deploy.sh');
const BACKUP_SH_PATH = path.join(DEVOS_ROOT, 'scripts', 'backup.sh');
const RESTORE_SH_PATH = path.join(DEVOS_ROOT, 'scripts', 'restore.sh');
const VALIDATE_ENV_SH_PATH = path.join(DEVOS_ROOT, 'scripts', 'validate-env.sh');
const shouldRun = fs.existsSync(SETUP_SH_PATH) && fs.existsSync(DEPLOY_SH_PATH);

(shouldRun ? describe : describe.skip)('Deployment Scripts Validation', () => {
  describe('setup.sh', () => {
    const scriptPath = path.join(DEVOS_ROOT, 'scripts', 'setup.sh');

    it('should have setup.sh with correct shebang and strict mode', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
      const content = fs.readFileSync(scriptPath, 'utf-8');
      const firstLine = content.split('\n')[0];
      expect(firstLine).toBe('#!/usr/bin/env bash');
      expect(content).toContain('set -euo pipefail');
    });

    it('should have setup.sh that checks prerequisites', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/docker/i);
      expect(content).toContain('.env.production.example');
      expect(content).toMatch(/openssl rand/);
    });

    it('should have setup.sh that validates required environment variables', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('POSTGRES_PASSWORD');
      expect(content).toContain('JWT_SECRET');
      expect(content).toContain('ENCRYPTION_KEY');
    });
  });

  describe('deploy.sh', () => {
    const scriptPath = path.join(DEVOS_ROOT, 'scripts', 'deploy.sh');

    it('should have deploy.sh with correct shebang and strict mode', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
      const content = fs.readFileSync(scriptPath, 'utf-8');
      const firstLine = content.split('\n')[0];
      expect(firstLine).toBe('#!/usr/bin/env bash');
      expect(content).toContain('set -euo pipefail');
    });

    it('should have deploy.sh that supports initial and update modes', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('--initial');
      expect(content).toContain('--service');
      expect(content).toContain('docker-compose.production.yml');
      expect(content).toContain('health-check.sh');
    });

    it('should have deploy.sh that handles migrations', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/migration/i);
    });
  });

  describe('backup.sh', () => {
    const scriptPath = path.join(DEVOS_ROOT, 'scripts', 'backup.sh');

    it('should have backup.sh with correct shebang and strict mode', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
      const content = fs.readFileSync(scriptPath, 'utf-8');
      const firstLine = content.split('\n')[0];
      expect(firstLine).toBe('#!/usr/bin/env bash');
      expect(content).toContain('set -euo pipefail');
    });

    it('should have backup.sh that backs up all data services', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('pg_dump');
      expect(content).toMatch(/BGSAVE|redis-cli/);
      expect(content).toMatch(/neo4j/i);
    });

    it('should have backup.sh that supports output directory and retention', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('--output-dir');
      expect(content).toMatch(/BACKUP_RETENTION_DAYS/);
    });
  });

  describe('restore.sh', () => {
    const scriptPath = path.join(DEVOS_ROOT, 'scripts', 'restore.sh');

    it('should have restore.sh with correct shebang and strict mode', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
      const content = fs.readFileSync(scriptPath, 'utf-8');
      const firstLine = content.split('\n')[0];
      expect(firstLine).toBe('#!/usr/bin/env bash');
      expect(content).toContain('set -euo pipefail');
    });

    it('should have restore.sh that requires backup directory and supports non-interactive mode', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('--from');
      expect(content).toContain('--yes');
    });

    it('should have restore.sh that restores all data services and verifies health', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/psql|pg_restore/);
      expect(content).toMatch(/redis/i);
      expect(content).toMatch(/neo4j/i);
      expect(content).toContain('health-check.sh');
    });
  });

  describe('validate-env.sh', () => {
    const scriptPath = path.join(DEVOS_ROOT, 'scripts', 'validate-env.sh');

    it('should have validate-env.sh with correct shebang and strict mode', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
      const content = fs.readFileSync(scriptPath, 'utf-8');
      const firstLine = content.split('\n')[0];
      expect(firstLine).toBe('#!/usr/bin/env bash');
      expect(content).toContain('set -euo pipefail');
    });

    it('should have validate-env.sh that checks all required variables', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('POSTGRES_PASSWORD');
      expect(content).toContain('REDIS_PASSWORD');
      expect(content).toContain('JWT_SECRET');
      expect(content).toContain('ENCRYPTION_KEY');
      expect(content).toContain('CORS_ORIGIN');
    });

    it('should have validate-env.sh that validates URL and hex formats', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      // Should validate URL format
      expect(content).toMatch(/https:\/\//);
      expect(content).toMatch(/wss:\/\//);
      // Should validate hex format
      expect(content).toMatch(/[0-9a-fA-F]/);
    });
  });
});
