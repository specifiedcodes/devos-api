import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const REPOS = [
  'devos-api',
  'devos-frontend',
  'devos-orchestrator',
  'devos-websocket',
  'devos-shared',
  'devos-integrations',
];

const AVAILABLE_REPOS = REPOS.filter((repo) =>
  fs.existsSync(path.join(DEVOS_ROOT, repo, '.github', 'workflows', 'ci.yml')),
);

const shouldRun = AVAILABLE_REPOS.length > 0;

function loadWorkflow(repo: string): any {
  const workflowPath = path.join(DEVOS_ROOT, repo, '.github', 'workflows', 'ci.yml');
  const content = fs.readFileSync(workflowPath, 'utf-8');
  return yaml.load(content);
}

(shouldRun ? describe : describe.skip)('CI Workflow Validation', () => {
  describe('devos-api CI workflow', () => {
    let workflow: any;

    beforeAll(() => {
      workflow = loadWorkflow('devos-api');
    });

    it('should exist and be valid YAML', () => {
      const workflowPath = path.join(DEVOS_ROOT, 'devos-api', '.github', 'workflows', 'ci.yml');
      expect(fs.existsSync(workflowPath)).toBe(true);
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('CI');
    });

    it('should have correct triggers', () => {
      expect(workflow.on.pull_request.branches).toContain('main');
      expect(workflow.on.pull_request.branches).toContain('develop');
      expect(workflow.on.push.branches).toContain('main');
    });

    it('should have lint-and-typecheck job', () => {
      const job = workflow.jobs['lint-and-typecheck'];
      expect(job).toBeDefined();
      expect(job['runs-on']).toBe('ubuntu-latest');

      const steps = job.steps;
      const setupNodeStep = steps.find(
        (s: any) => s.uses && s.uses.startsWith('actions/setup-node@v4'),
      );
      expect(setupNodeStep).toBeDefined();
      expect(setupNodeStep.with['node-version']).toBe('20');

      const stepNames = steps.map((s: any) => s.run || s.uses || '').join(' ');
      expect(stepNames).toContain('npm ci');
      expect(stepNames).toContain('npm run lint');
    });

    it('should have test job with service containers', () => {
      const job = workflow.jobs['test'];
      expect(job).toBeDefined();

      // Check postgres service
      expect(job.services.postgres).toBeDefined();
      expect(job.services.postgres.image).toBe('postgres:16');
      expect(job.services.postgres.options).toContain('pg_isready');

      // Check redis service
      expect(job.services.redis).toBeDefined();
      expect(job.services.redis.image).toBe('redis:7-alpine');

      // Check test step includes --coverage
      const testStep = job.steps.find(
        (s: any) => s.run && s.run.includes('npm run test'),
      );
      expect(testStep).toBeDefined();
      expect(testStep.run).toContain('--coverage');
    });

    it('should have build job', () => {
      const job = workflow.jobs['build'];
      expect(job).toBeDefined();

      const buildStep = job.steps.find(
        (s: any) => s.run && s.run.includes('npm run build'),
      );
      expect(buildStep).toBeDefined();
    });

    it('should have security job', () => {
      const job = workflow.jobs['security'];
      expect(job).toBeDefined();

      const auditStep = job.steps.find(
        (s: any) => s.run && s.run.includes('npm audit'),
      );
      expect(auditStep).toBeDefined();
      expect(auditStep.run).toContain('--audit-level=high');
    });
  });

  describe('devos-frontend CI workflow', () => {
    let workflow: any;

    beforeAll(() => {
      workflow = loadWorkflow('devos-frontend');
    });

    it('should exist and be valid YAML', () => {
      const workflowPath = path.join(
        DEVOS_ROOT,
        'devos-frontend',
        '.github',
        'workflows',
        'ci.yml',
      );
      expect(fs.existsSync(workflowPath)).toBe(true);
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('CI');
    });

    it('should have build job with NEXT_PUBLIC_API_URL environment variable', () => {
      const job = workflow.jobs['build'];
      expect(job).toBeDefined();
      expect(job.env.NEXT_PUBLIC_API_URL).toBeDefined();
    });

    it('should not require database services in test job', () => {
      const job = workflow.jobs['test'];
      expect(job).toBeDefined();
      expect(job.services).toBeUndefined();
    });
  });

  describe('devos-orchestrator CI workflow', () => {
    let workflow: any;

    beforeAll(() => {
      workflow = loadWorkflow('devos-orchestrator');
    });

    it('should have redis service for tests', () => {
      const job = workflow.jobs['test'];
      expect(job).toBeDefined();
      expect(job.services.redis).toBeDefined();
      expect(job.services.redis.image).toBe('redis:7-alpine');
    });

    it('should not have postgres service', () => {
      const job = workflow.jobs['test'];
      expect(job.services.postgres).toBeUndefined();
    });
  });

  describe('devos-websocket CI workflow', () => {
    let workflow: any;

    beforeAll(() => {
      workflow = loadWorkflow('devos-websocket');
    });

    it('should have redis service for tests', () => {
      const job = workflow.jobs['test'];
      expect(job).toBeDefined();
      expect(job.services.redis).toBeDefined();
      expect(job.services.redis.image).toBe('redis:7-alpine');
    });
  });

  describe('devos-shared CI workflow', () => {
    let workflow: any;

    beforeAll(() => {
      workflow = loadWorkflow('devos-shared');
    });

    it('should have minimal jobs with no services', () => {
      // No services in any job
      for (const jobName of Object.keys(workflow.jobs)) {
        const job = workflow.jobs[jobName];
        if (job.services) {
          expect(Object.keys(job.services)).toHaveLength(0);
        }
      }
    });

    it('should use --passWithNoTests flag in test job', () => {
      const job = workflow.jobs['test'];
      expect(job).toBeDefined();
      const testStep = job.steps.find(
        (s: any) => s.run && s.run.includes('npm run test'),
      );
      expect(testStep).toBeDefined();
      expect(testStep.run).toContain('--passWithNoTests');
    });
  });

  describe('All CI workflows', () => {
    it('should use Node.js 20', () => {
      for (const repo of AVAILABLE_REPOS) {
        const workflow = loadWorkflow(repo);
        for (const jobName of Object.keys(workflow.jobs)) {
          const job = workflow.jobs[jobName];
          const setupNodeStep = job.steps.find(
            (s: any) => s.uses && s.uses.startsWith('actions/setup-node@v4'),
          );
          if (setupNodeStep) {
            expect(setupNodeStep.with['node-version']).toBe('20');
          }
        }
      }
    });

    it('should use npm cache', () => {
      for (const repo of AVAILABLE_REPOS) {
        const workflow = loadWorkflow(repo);
        for (const jobName of Object.keys(workflow.jobs)) {
          const job = workflow.jobs[jobName];
          const setupNodeStep = job.steps.find(
            (s: any) => s.uses && s.uses.startsWith('actions/setup-node@v4'),
          );
          if (setupNodeStep) {
            expect(setupNodeStep.with.cache).toBe('npm');
          }
        }
      }
    });
  });
});
