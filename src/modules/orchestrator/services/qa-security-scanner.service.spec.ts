/**
 * QASecurityScannerService Tests
 * Story 11.5: QA Agent CLI Integration
 *
 * Tests for npm audit and secret scanning functionality.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { QASecurityScannerService } from './qa-security-scanner.service';
import * as childProcess from 'child_process';
import * as fs from 'fs';

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
}));

const mockedExec = childProcess.exec as unknown as jest.Mock;
const mockedReadFileSync = fs.readFileSync as jest.Mock;

describe('QASecurityScannerService', () => {
  let service: QASecurityScannerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QASecurityScannerService],
    }).compile();

    service = module.get<QASecurityScannerService>(QASecurityScannerService);
    jest.clearAllMocks();
  });

  describe('runNpmAudit', () => {
    it('should execute npm audit --json and parse output', async () => {
      const auditOutput = JSON.stringify({
        metadata: {
          vulnerabilities: {
            critical: 0,
            high: 1,
            moderate: 2,
            low: 3,
            total: 6,
          },
        },
      });
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        cb(null, auditOutput, '');
      });

      const result = await service.runNpmAudit('/workspace');

      expect(result.critical).toBe(0);
      expect(result.high).toBe(1);
      expect(result.medium).toBe(2);
      expect(result.low).toBe(3);
      expect(result.total).toBe(6);
    });

    it('should extract critical/high/medium/low counts', async () => {
      const auditOutput = JSON.stringify({
        metadata: {
          vulnerabilities: {
            critical: 2,
            high: 3,
            moderate: 5,
            low: 10,
            total: 20,
          },
        },
      });
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        // npm audit exits with non-zero when vulnerabilities found
        const error: any = new Error('audit');
        error.stdout = auditOutput;
        cb(error, auditOutput, '');
      });

      const result = await service.runNpmAudit('/workspace');

      expect(result.critical).toBe(2);
      expect(result.high).toBe(3);
      expect(result.medium).toBe(5);
      expect(result.low).toBe(10);
    });

    it('should return passed=true when no critical/high', async () => {
      const auditOutput = JSON.stringify({
        metadata: {
          vulnerabilities: {
            critical: 0,
            high: 0,
            moderate: 1,
            low: 2,
            total: 3,
          },
        },
      });
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        const error: any = new Error('audit');
        error.stdout = auditOutput;
        cb(error, auditOutput, '');
      });

      const result = await service.runNpmAudit('/workspace');

      expect(result.passed).toBe(true);
    });

    it('should handle npm audit not available (skipped)', async () => {
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        const error: any = new Error('npm audit is not available');
        error.stdout = '';
        cb(error, '', '');
      });

      const result = await service.runNpmAudit('/workspace');

      expect(result.passed).toBe(true);
      expect(result.total).toBe(0);
    });
  });

  describe('scanForSecrets', () => {
    it('should detect API keys in source files', () => {
      mockedReadFileSync.mockReturnValue(
        'const apiKey = "sk_live_1234567890abcdef";\n',
      );

      const result = service.scanForSecrets('/workspace', ['src/config.ts']);

      expect(result.secretsFound).toBe(true);
      expect(result.findings.length).toBeGreaterThanOrEqual(1);
      expect(result.findings[0].pattern).toContain('API_KEY');
    });

    it('should detect hardcoded passwords', () => {
      mockedReadFileSync.mockReturnValue(
        'const password = "supersecret123";\n',
      );

      const result = service.scanForSecrets('/workspace', ['src/auth.ts']);

      expect(result.secretsFound).toBe(true);
      expect(result.findings.some((f) => f.pattern.includes('PASSWORD'))).toBe(true);
    });

    it('should detect connection strings', () => {
      mockedReadFileSync.mockReturnValue(
        'const dbUrl = "postgres://user:pass@localhost:5432/db";\n',
      );

      const result = service.scanForSecrets('/workspace', ['src/db.ts']);

      expect(result.secretsFound).toBe(true);
      expect(result.findings.some((f) => f.pattern.includes('CONNECTION_STRING'))).toBe(true);
    });

    it('should return no findings for clean files', () => {
      mockedReadFileSync.mockReturnValue(
        'const x = 42;\nconst name = "hello";\n',
      );

      const result = service.scanForSecrets('/workspace', ['src/app.ts']);

      expect(result.secretsFound).toBe(false);
      expect(result.findings).toHaveLength(0);
    });

    it('should only scan changed files (not entire repo)', () => {
      mockedReadFileSync.mockReturnValue('clean code\n');

      const changedFiles = ['src/a.ts', 'src/b.ts'];
      service.scanForSecrets('/workspace', changedFiles);

      // Should only call readFileSync for the 2 changed files
      expect(mockedReadFileSync).toHaveBeenCalledTimes(2);
    });

    it('should skip spec/test files', () => {
      mockedReadFileSync.mockReturnValue(
        'const apiKey = "sk_test_1234567890abcdef";\n',
      );

      const result = service.scanForSecrets('/workspace', [
        'src/app.spec.ts',
        'src/service.test.ts',
      ]);

      expect(result.secretsFound).toBe(false);
      expect(mockedReadFileSync).not.toHaveBeenCalled();
    });

    it('should skip markdown and lock files', () => {
      const result = service.scanForSecrets('/workspace', [
        'README.md',
        'package-lock.json',
      ]);

      expect(result.secretsFound).toBe(false);
      expect(mockedReadFileSync).not.toHaveBeenCalled();
    });
  });
});
