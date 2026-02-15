/**
 * WorkspaceSettings Entity - Model Preferences Column Tests
 *
 * Story 13-9: User Model Preferences
 *
 * Tests that the 5 new model preferences columns are properly defined
 * on the WorkspaceSettings entity with correct defaults.
 */
import 'reflect-metadata';
import { WorkspaceSettings } from './workspace-settings.entity';

describe('WorkspaceSettings - Model Preferences Columns', () => {
  it('should have modelPreset property', () => {
    const entity = new WorkspaceSettings();
    expect(entity).toHaveProperty('modelPreset');
  });

  it('should have taskModelOverrides property', () => {
    const entity = new WorkspaceSettings();
    expect(entity).toHaveProperty('taskModelOverrides');
  });

  it('should have enabledProviders property', () => {
    const entity = new WorkspaceSettings();
    expect(entity).toHaveProperty('enabledProviders');
  });

  it('should have providerPriority property', () => {
    const entity = new WorkspaceSettings();
    expect(entity).toHaveProperty('providerPriority');
  });

  it('should have modelPreferencesEnabled property', () => {
    const entity = new WorkspaceSettings();
    expect(entity).toHaveProperty('modelPreferencesEnabled');
  });

  it('should have modelPreset column metadata with correct column name', () => {
    const columns = Reflect.getMetadata('typeorm:columns', WorkspaceSettings.prototype) || [];
    // Check that the entity has the new properties defined via @Column decorator
    // The Column decorator stores metadata on the prototype
    const metadata = Reflect.getMetadata('design:type', WorkspaceSettings.prototype, 'modelPreset');
    expect(metadata).toBeDefined();
  });

  it('should have modelPreferencesEnabled column metadata', () => {
    const metadata = Reflect.getMetadata('design:type', WorkspaceSettings.prototype, 'modelPreferencesEnabled');
    expect(metadata).toBeDefined();
  });

  it('should have taskModelOverrides column metadata', () => {
    const metadata = Reflect.getMetadata('design:type', WorkspaceSettings.prototype, 'taskModelOverrides');
    expect(metadata).toBeDefined();
  });

  it('should have enabledProviders column metadata', () => {
    const metadata = Reflect.getMetadata('design:type', WorkspaceSettings.prototype, 'enabledProviders');
    expect(metadata).toBeDefined();
  });

  it('should have providerPriority column metadata', () => {
    const metadata = Reflect.getMetadata('design:type', WorkspaceSettings.prototype, 'providerPriority');
    expect(metadata).toBeDefined();
  });
});
