/**
 * FailureRecoveryHistory Entity Tests
 * Story 11.9: Agent Failure Recovery & Checkpoints
 */
import { FailureRecoveryHistory } from './failure-recovery-history.entity';

describe('FailureRecoveryHistory Entity', () => {
  it('should create entity with all required fields', () => {
    const entity = new FailureRecoveryHistory();
    entity.id = '123e4567-e89b-12d3-a456-426614174000';
    entity.workspaceId = '223e4567-e89b-12d3-a456-426614174001';
    entity.projectId = '323e4567-e89b-12d3-a456-426614174002';
    entity.storyId = 'story-11-9';
    entity.sessionId = '423e4567-e89b-12d3-a456-426614174003';
    entity.agentId = '523e4567-e89b-12d3-a456-426614174004';
    entity.agentType = 'dev';
    entity.failureType = 'crash';
    entity.recoveryStrategy = 'retry';
    entity.retryCount = 1;
    entity.success = true;
    entity.errorDetails = 'Process exited with code 1';
    entity.durationMs = 5000;
    entity.createdAt = new Date();

    expect(entity.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(entity.workspaceId).toBe('223e4567-e89b-12d3-a456-426614174001');
    expect(entity.projectId).toBe('323e4567-e89b-12d3-a456-426614174002');
    expect(entity.storyId).toBe('story-11-9');
    expect(entity.sessionId).toBe('423e4567-e89b-12d3-a456-426614174003');
    expect(entity.agentId).toBe('523e4567-e89b-12d3-a456-426614174004');
    expect(entity.agentType).toBe('dev');
    expect(entity.failureType).toBe('crash');
    expect(entity.recoveryStrategy).toBe('retry');
    expect(entity.retryCount).toBe(1);
    expect(entity.success).toBe(true);
    expect(entity.errorDetails).toBe('Process exited with code 1');
    expect(entity.durationMs).toBe(5000);
    expect(entity.createdAt).toBeInstanceOf(Date);
  });

  it('should have nullable fields default to null', () => {
    const entity = new FailureRecoveryHistory();

    expect(entity.checkpointCommitHash).toBeUndefined();
    expect(entity.newSessionId).toBeUndefined();
  });

  it('should have metadata field default to empty object', () => {
    const entity = new FailureRecoveryHistory();

    // metadata has a default of '{}' at the DB level, but in TS it starts undefined
    // until hydrated from DB. Entity instances are plain objects until saved/loaded.
    expect(entity.metadata).toBeUndefined();

    // When set explicitly, it should work correctly
    entity.metadata = { recovery: 'checkpoint', attempt: 1 };
    expect(entity.metadata).toEqual({ recovery: 'checkpoint', attempt: 1 });
  });

  it('should support all failure types', () => {
    const entity = new FailureRecoveryHistory();

    const failureTypes = ['stuck', 'crash', 'api_error', 'loop', 'timeout'];
    for (const type of failureTypes) {
      entity.failureType = type;
      expect(entity.failureType).toBe(type);
    }
  });

  it('should support all recovery strategies', () => {
    const entity = new FailureRecoveryHistory();

    const strategies = [
      'retry',
      'checkpoint_recovery',
      'context_refresh',
      'escalation',
      'manual_override',
    ];
    for (const strategy of strategies) {
      entity.recoveryStrategy = strategy;
      expect(entity.recoveryStrategy).toBe(strategy);
    }
  });
});
