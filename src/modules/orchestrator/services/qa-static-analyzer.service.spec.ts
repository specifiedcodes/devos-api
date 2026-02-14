/**
 * QAStaticAnalyzerService Tests
 * Story 11.5: QA Agent CLI Integration
 *
 * Tests for lint and type check execution.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { QAStaticAnalyzerService } from './qa-static-analyzer.service';
import * as childProcess from 'child_process';

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

const mockedExec = childProcess.exec as unknown as jest.Mock;

describe('QAStaticAnalyzerService', () => {
  let service: QAStaticAnalyzerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QAStaticAnalyzerService],
    }).compile();

    service = module.get<QAStaticAnalyzerService>(QAStaticAnalyzerService);
    jest.clearAllMocks();
  });

  describe('runLintCheck', () => {
    it('should execute npm run lint and parse output', async () => {
      const lintOutput = `
/src/app.ts
  5:10  error  Unexpected any    @typescript-eslint/no-explicit-any
  8:3   warning  Console log      no-console

✖ 2 problems (1 error, 1 warning)
  1 error and 0 warnings potentially fixable with the \`--fix\` option.
`;
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        const error: any = new Error('Lint errors found');
        error.stdout = lintOutput;
        cb(error, lintOutput, '');
      });

      const result = await service.runLintCheck('/workspace');

      expect(result.errors).toBe(1);
      expect(result.warnings).toBe(1);
      expect(result.passed).toBe(false);
    });

    it('should extract error and warning counts', async () => {
      const lintOutput = `✖ 5 problems (3 errors, 2 warnings)
  2 errors and 1 warning potentially fixable with the \`--fix\` option.`;
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        const error: any = new Error('Lint errors');
        error.stdout = lintOutput;
        cb(error, lintOutput, '');
      });

      const result = await service.runLintCheck('/workspace');

      expect(result.errors).toBe(3);
      expect(result.warnings).toBe(2);
      expect(result.fixableErrors).toBe(2);
      expect(result.fixableWarnings).toBe(1);
    });

    it('should return passed=true when no errors', async () => {
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        cb(null, 'No lint errors found\n', '');
      });

      const result = await service.runLintCheck('/workspace');

      expect(result.passed).toBe(true);
      expect(result.errors).toBe(0);
    });

    it('should handle missing lint script gracefully (skipped)', async () => {
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        const error: any = new Error('Missing script: "lint"');
        error.stdout = '';
        cb(error, '', '');
      });

      const result = await service.runLintCheck('/workspace');

      expect(result.passed).toBe(true);
      expect(result.details).toContain('not available');
    });

    it('should handle command timeout', async () => {
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        const error: any = new Error('Timed out');
        error.killed = true;
        error.stdout = '';
        cb(error, '', '');
      });

      const result = await service.runLintCheck('/workspace');

      expect(result.passed).toBe(true);
      expect(result.details).toContain('timed out');
    });
  });

  describe('runTypeCheck', () => {
    it('should execute npx tsc --noEmit and parse output', async () => {
      const tscOutput = `
src/app.ts(5,10): error TS2322: Type 'string' is not assignable to type 'number'.
src/service.ts(12,5): error TS2339: Property 'foo' does not exist on type 'Bar'.
`;
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        const error: any = new Error('tsc errors');
        error.stdout = tscOutput;
        cb(error, tscOutput, '');
      });

      const result = await service.runTypeCheck('/workspace');

      expect(result.errors).toBe(2);
      expect(result.passed).toBe(false);
    });

    it('should return passed=true when no errors', async () => {
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        cb(null, '', '');
      });

      const result = await service.runTypeCheck('/workspace');

      expect(result.passed).toBe(true);
      expect(result.errors).toBe(0);
    });

    it('should extract error count from tsc output', async () => {
      const tscOutput = `
src/a.ts(1,1): error TS1234: Something wrong.
src/b.ts(2,2): error TS5678: Another error.
src/c.ts(3,3): error TS9012: Third error.
`;
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        const error: any = new Error('tsc errors');
        error.stdout = tscOutput;
        cb(error, tscOutput, '');
      });

      const result = await service.runTypeCheck('/workspace');

      expect(result.errors).toBe(3);
      expect(result.passed).toBe(false);
    });

    it('should handle missing tsconfig gracefully (skipped)', async () => {
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        const error: any = new Error('tsconfig.json not found');
        error.stdout = "error TS18003: No inputs were found in config file";
        cb(error, error.stdout, '');
      });

      const result = await service.runTypeCheck('/workspace');

      expect(result.passed).toBe(true);
      expect(result.details).toContain('not found');
    });
  });
});
