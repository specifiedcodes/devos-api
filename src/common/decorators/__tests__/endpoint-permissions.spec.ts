/**
 * Endpoint Permission Mapping Tests
 *
 * Story 20-3: Permission Enforcement Middleware
 * Tests for the canonical endpoint-to-permission mapping document.
 */
import { ENDPOINT_PERMISSION_MAP } from '../endpoint-permissions';

describe('ENDPOINT_PERMISSION_MAP', () => {
  it('should be defined and non-empty', () => {
    expect(ENDPOINT_PERMISSION_MAP).toBeDefined();
    expect(Object.keys(ENDPOINT_PERMISSION_MAP).length).toBeGreaterThan(0);
  });

  it('should cover all 8 resource types', () => {
    const resources = new Set(
      Object.values(ENDPOINT_PERMISSION_MAP).map((v) => v.resource),
    );

    expect(resources).toContain('projects');
    expect(resources).toContain('agents');
    expect(resources).toContain('stories');
    expect(resources).toContain('deployments');
    expect(resources).toContain('secrets');
    expect(resources).toContain('integrations');
    expect(resources).toContain('workspace');
    expect(resources).toContain('cost_management');
  });

  it('should have valid structure for all entries', () => {
    for (const [endpoint, mapping] of Object.entries(ENDPOINT_PERMISSION_MAP)) {
      expect(endpoint).toMatch(/^(GET|POST|PUT|PATCH|DELETE) \//);
      expect(mapping).toHaveProperty('resource');
      expect(mapping).toHaveProperty('action');
      expect(typeof mapping.resource).toBe('string');
      expect(typeof mapping.action).toBe('string');
      expect(mapping.resource.length).toBeGreaterThan(0);
      expect(mapping.action.length).toBeGreaterThan(0);
    }
  });

  it('should have project CRUD endpoints mapped', () => {
    const projectEndpoints = Object.entries(ENDPOINT_PERMISSION_MAP).filter(
      ([_, v]) => v.resource === 'projects',
    );
    const actions = projectEndpoints.map(([_, v]) => v.action);

    expect(actions).toContain('create');
    expect(actions).toContain('read');
    expect(actions).toContain('update');
    expect(actions).toContain('delete');
    expect(actions).toContain('manage_settings');
  });

  it('should have agent endpoints mapped', () => {
    const agentEndpoints = Object.entries(ENDPOINT_PERMISSION_MAP).filter(
      ([_, v]) => v.resource === 'agents',
    );
    const actions = agentEndpoints.map(([_, v]) => v.action);

    expect(actions).toContain('view');
    expect(actions).toContain('create_custom');
    expect(actions).toContain('pause_cancel');
    expect(actions).toContain('configure');
  });

  it('should have stories endpoints mapped', () => {
    const storyEndpoints = Object.entries(ENDPOINT_PERMISSION_MAP).filter(
      ([_, v]) => v.resource === 'stories',
    );
    const actions = storyEndpoints.map(([_, v]) => v.action);

    expect(actions).toContain('create');
    expect(actions).toContain('read');
    expect(actions).toContain('update');
    expect(actions).toContain('delete');
    expect(actions).toContain('assign');
    expect(actions).toContain('change_status');
  });

  it('should have secrets endpoints mapped', () => {
    const secretEndpoints = Object.entries(ENDPOINT_PERMISSION_MAP).filter(
      ([_, v]) => v.resource === 'secrets',
    );
    const actions = secretEndpoints.map(([_, v]) => v.action);

    expect(actions).toContain('view_masked');
    expect(actions).toContain('create');
    expect(actions).toContain('delete');
    expect(actions).toContain('view_plaintext');
  });

  it('should have workspace management endpoints mapped', () => {
    const wsEndpoints = Object.entries(ENDPOINT_PERMISSION_MAP).filter(
      ([_, v]) => v.resource === 'workspace',
    );
    const actions = wsEndpoints.map(([_, v]) => v.action);

    expect(actions).toContain('view_members');
    expect(actions).toContain('invite_members');
    expect(actions).toContain('remove_members');
    expect(actions).toContain('manage_roles');
    expect(actions).toContain('view_audit_log');
    expect(actions).toContain('manage_settings');
  });

  it('should have cost management endpoints mapped', () => {
    const costEndpoints = Object.entries(ENDPOINT_PERMISSION_MAP).filter(
      ([_, v]) => v.resource === 'cost_management',
    );
    const actions = costEndpoints.map(([_, v]) => v.action);

    expect(actions).toContain('view_own_usage');
    expect(actions).toContain('view_workspace_usage');
    expect(actions).toContain('set_budgets');
    expect(actions).toContain('export_reports');
  });
});
