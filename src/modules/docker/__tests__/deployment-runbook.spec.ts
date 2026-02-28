import * as fs from 'fs';
import * as path from 'path';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const RUNBOOK_PATH = path.join(DEVOS_ROOT, 'docs', 'deployment-runbook.md');
const shouldRun = fs.existsSync(RUNBOOK_PATH);

(shouldRun ? describe : describe.skip)('Deployment Runbook Documentation Validation', () => {
  let content: string;

  beforeAll(() => {
    expect(fs.existsSync(RUNBOOK_PATH)).toBe(true);
    content = fs.readFileSync(RUNBOOK_PATH, 'utf-8');
  });

  it('should have deployment runbook at docs/deployment-runbook.md', () => {
    expect(fs.existsSync(RUNBOOK_PATH)).toBe(true);
    expect(content.length).toBeGreaterThan(1000);
  });

  it('should contain Prerequisites section with hardware and software requirements', () => {
    expect(content).toMatch(/#+\s*Prerequisites/i);
    // Hardware requirements
    expect(content).toMatch(/CPU/i);
    expect(content).toMatch(/RAM/i);
    expect(content).toMatch(/SSD|disk/i);
    // Software requirements
    expect(content).toMatch(/Docker/);
    expect(content).toMatch(/Node\.js/);
    expect(content).toMatch(/Git/);
  });

  it('should contain Initial Setup section', () => {
    expect(content).toMatch(/#+\s*Initial Setup/i);
    // Should contain steps for cloning, env, building, starting
    expect(content).toMatch(/clone/i);
    expect(content).toMatch(/\.env/);
    expect(content).toMatch(/build/i);
  });

  it('should contain Routine Operations section', () => {
    expect(content).toMatch(/#+\s*Routine Operations/i);
    // Zero-downtime update procedure
    expect(content).toMatch(/zero.?downtime/i);
    // Backup and restore references
    expect(content).toMatch(/backup/i);
    expect(content).toMatch(/restore/i);
  });

  it('should contain Troubleshooting section with common errors', () => {
    expect(content).toMatch(/#+\s*Troubleshooting/i);
    // Common error scenarios
    expect(content).toMatch(/won't start|won't start|will not start|service.*start/i);
    expect(content).toMatch(/connection/i);
    expect(content).toMatch(/WebSocket/i);
  });

  it('should contain Disaster Recovery section with RTO and RPO', () => {
    expect(content).toMatch(/#+\s*Disaster Recovery/i);
    expect(content).toMatch(/RTO/);
    expect(content).toMatch(/RPO/);
  });

  it('should reference all automation scripts', () => {
    expect(content).toContain('setup.sh');
    expect(content).toContain('deploy.sh');
    expect(content).toContain('backup.sh');
    expect(content).toContain('restore.sh');
    expect(content).toContain('health-check.sh');
    expect(content).toContain('build-production.sh');
  });
});
