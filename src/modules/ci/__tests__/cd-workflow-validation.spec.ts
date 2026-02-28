import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const DEPLOYABLE_REPOS = [
  'devos-api',
  'devos-frontend',
  'devos-orchestrator',
  'devos-websocket',
];

const AVAILABLE_REPOS = DEPLOYABLE_REPOS.filter((repo) =>
  fs.existsSync(path.join(DEVOS_ROOT, repo, '.github', 'workflows', 'cd.yml')),
);

const shouldRun = AVAILABLE_REPOS.length > 0;

function loadCDWorkflow(repo: string): any {
  const workflowPath = path.join(
    DEVOS_ROOT,
    repo,
    '.github',
    'workflows',
    'cd.yml',
  );
  const content = fs.readFileSync(workflowPath, 'utf-8');
  return yaml.load(content);
}

(shouldRun ? describe : describe.skip)('CD Workflow Validation', () => {
  const apiAvailable = AVAILABLE_REPOS.includes('devos-api');
  (apiAvailable ? describe : describe.skip)('devos-api CD workflow', () => {
    let workflow: any;

    beforeAll(() => {
      workflow = loadCDWorkflow('devos-api');
    });

    it('should exist and be valid YAML', () => {
      const workflowPath = path.join(
        DEVOS_ROOT,
        'devos-api',
        '.github',
        'workflows',
        'cd.yml',
      );
      expect(fs.existsSync(workflowPath)).toBe(true);
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('CD');
    });

    it('should have correct triggers', () => {
      expect(workflow.on.push.branches).toContain('main');
      expect(workflow.on.workflow_dispatch).toBeDefined();
      expect(
        workflow.on.workflow_dispatch.inputs.environment,
      ).toBeDefined();
      const envInput = workflow.on.workflow_dispatch.inputs.environment;
      expect(envInput.options || envInput.type).toBeDefined();
      // Verify staging and production are choices
      if (envInput.options) {
        expect(envInput.options).toContain('staging');
        expect(envInput.options).toContain('production');
      }
    });

    it('should have build-and-push job', () => {
      const job = workflow.jobs['build-and-push'];
      expect(job).toBeDefined();
      expect(job['runs-on']).toBe('ubuntu-latest');

      // Check permissions
      expect(job.permissions.contents).toBe('read');
      expect(job.permissions.packages).toBe('write');

      const steps = job.steps;

      // Check docker login action with ghcr.io
      const loginStep = steps.find(
        (s: any) => s.uses && s.uses.startsWith('docker/login-action@v3'),
      );
      expect(loginStep).toBeDefined();
      expect(loginStep.with.registry).toBe('ghcr.io');

      // Check metadata action for tags
      const metaStep = steps.find(
        (s: any) =>
          s.uses && s.uses.startsWith('docker/metadata-action@v5'),
      );
      expect(metaStep).toBeDefined();

      // Check build-push action
      const buildStep = steps.find(
        (s: any) =>
          s.uses && s.uses.startsWith('docker/build-push-action@v5'),
      );
      expect(buildStep).toBeDefined();
      expect(buildStep.with.push).toBe(true);
      expect(buildStep.with['cache-from']).toBe('type=gha');
      expect(buildStep.with['cache-to']).toBe('type=gha,mode=max');
    });

    it('should have deploy-staging job', () => {
      const job = workflow.jobs['deploy-staging'];
      expect(job).toBeDefined();
      expect(job.needs).toContain('build-and-push');
      expect(job.environment).toBe('staging');
    });

    it('should have smoke-test job', () => {
      const job = workflow.jobs['smoke-test'];
      expect(job).toBeDefined();
      expect(job.needs).toContain('deploy-staging');
    });

    it('should have deploy-production job', () => {
      const job = workflow.jobs['deploy-production'];
      expect(job).toBeDefined();
      expect(job.needs).toContain('smoke-test');
      expect(job.environment).toBe('production');
      // Check condition includes workflow_dispatch and production
      expect(job.if).toBeDefined();
      expect(job.if).toContain('workflow_dispatch');
      expect(job.if).toContain('production');
    });

    it('should have concurrency control', () => {
      expect(workflow.concurrency).toBeDefined();
      expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    });
  });

  const frontendAvailable = AVAILABLE_REPOS.includes('devos-frontend');
  (frontendAvailable ? describe : describe.skip)('devos-frontend CD workflow', () => {
    let workflow: any;

    beforeAll(() => {
      workflow = loadCDWorkflow('devos-frontend');
    });

    it('should exist and be valid YAML', () => {
      const workflowPath = path.join(
        DEVOS_ROOT,
        'devos-frontend',
        '.github',
        'workflows',
        'cd.yml',
      );
      expect(fs.existsSync(workflowPath)).toBe(true);
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('CD');
    });

    it('should pass build args for NEXT_PUBLIC URLs', () => {
      const job = workflow.jobs['build-and-push'];
      expect(job).toBeDefined();

      const buildStep = job.steps.find(
        (s: any) =>
          s.uses && s.uses.startsWith('docker/build-push-action@v5'),
      );
      expect(buildStep).toBeDefined();
      expect(buildStep.with['build-args']).toBeDefined();
      const buildArgs = buildStep.with['build-args'];
      expect(buildArgs).toContain('NEXT_PUBLIC_API_URL');
      expect(buildArgs).toContain('NEXT_PUBLIC_WS_URL');
    });
  });

  const orchestratorAvailable = AVAILABLE_REPOS.includes('devos-orchestrator');
  (orchestratorAvailable ? describe : describe.skip)('devos-orchestrator CD workflow', () => {
    it('should exist and be valid YAML', () => {
      const workflowPath = path.join(
        DEVOS_ROOT,
        'devos-orchestrator',
        '.github',
        'workflows',
        'cd.yml',
      );
      expect(fs.existsSync(workflowPath)).toBe(true);

      const workflow = loadCDWorkflow('devos-orchestrator');
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('CD');
    });
  });

  const websocketAvailable = AVAILABLE_REPOS.includes('devos-websocket');
  (websocketAvailable ? describe : describe.skip)('devos-websocket CD workflow', () => {
    it('should exist and be valid YAML', () => {
      const workflowPath = path.join(
        DEVOS_ROOT,
        'devos-websocket',
        '.github',
        'workflows',
        'cd.yml',
      );
      expect(fs.existsSync(workflowPath)).toBe(true);

      const workflow = loadCDWorkflow('devos-websocket');
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('CD');
    });
  });

  describe('All CD workflows', () => {
    it('should use GHCR as container registry', () => {
      for (const repo of AVAILABLE_REPOS) {
        const workflow = loadCDWorkflow(repo);
        const job = workflow.jobs['build-and-push'];
        expect(job).toBeDefined();

        const loginStep = job.steps.find(
          (s: any) =>
            s.uses && s.uses.startsWith('docker/login-action@v3'),
        );
        expect(loginStep).toBeDefined();
        expect(loginStep.with.registry).toBe('ghcr.io');
      }
    });

    it('should have concurrency control with cancel-in-progress false', () => {
      for (const repo of AVAILABLE_REPOS) {
        const workflow = loadCDWorkflow(repo);
        expect(workflow.concurrency).toBeDefined();
        expect(workflow.concurrency['cancel-in-progress']).toBe(false);
      }
    });
  });
});
