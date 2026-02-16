import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  UpdateSessionTimeoutDto,
  ForceReauthDto,
  SessionListQueryDto,
  ValidateSessionDto,
} from './session-federation.dto';

describe('Session Federation DTOs', () => {
  describe('UpdateSessionTimeoutDto', () => {
    it('should accept valid timeout values within range', async () => {
      const dto = plainToInstance(UpdateSessionTimeoutDto, {
        sessionTimeoutMinutes: 480,
        idleTimeoutMinutes: 30,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept only sessionTimeoutMinutes', async () => {
      const dto = plainToInstance(UpdateSessionTimeoutDto, {
        sessionTimeoutMinutes: 720,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept only idleTimeoutMinutes', async () => {
      const dto = plainToInstance(UpdateSessionTimeoutDto, {
        idleTimeoutMinutes: 60,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject sessionTimeoutMinutes below minimum (< 5)', async () => {
      const dto = plainToInstance(UpdateSessionTimeoutDto, {
        sessionTimeoutMinutes: 4,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject sessionTimeoutMinutes above maximum (> 43200)', async () => {
      const dto = plainToInstance(UpdateSessionTimeoutDto, {
        sessionTimeoutMinutes: 43201,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject idleTimeoutMinutes below minimum (< 5)', async () => {
      const dto = plainToInstance(UpdateSessionTimeoutDto, {
        idleTimeoutMinutes: 4,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject idleTimeoutMinutes above maximum (> 1440)', async () => {
      const dto = plainToInstance(UpdateSessionTimeoutDto, {
        idleTimeoutMinutes: 1441,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept minimum valid values (5)', async () => {
      const dto = plainToInstance(UpdateSessionTimeoutDto, {
        sessionTimeoutMinutes: 5,
        idleTimeoutMinutes: 5,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept maximum valid values', async () => {
      const dto = plainToInstance(UpdateSessionTimeoutDto, {
        sessionTimeoutMinutes: 43200,
        idleTimeoutMinutes: 1440,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject non-integer values', async () => {
      const dto = plainToInstance(UpdateSessionTimeoutDto, {
        sessionTimeoutMinutes: 10.5,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ForceReauthDto', () => {
    it('should accept valid dto with reason only', async () => {
      const dto = plainToInstance(ForceReauthDto, {
        reason: 'security_incident',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid dto with targetUserId and reason', async () => {
      const dto = plainToInstance(ForceReauthDto, {
        targetUserId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        reason: 'policy_change',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should require reason field', async () => {
      const dto = plainToInstance(ForceReauthDto, {});
      const errors = await validate(dto);
      const reasonError = errors.find((e) => e.property === 'reason');
      expect(reasonError).toBeDefined();
    });

    it('should reject empty reason', async () => {
      const dto = plainToInstance(ForceReauthDto, {
        reason: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid targetUserId format', async () => {
      const dto = plainToInstance(ForceReauthDto, {
        targetUserId: 'not-a-uuid',
        reason: 'test',
      });
      const errors = await validate(dto);
      const targetError = errors.find((e) => e.property === 'targetUserId');
      expect(targetError).toBeDefined();
    });
  });

  describe('SessionListQueryDto', () => {
    it('should accept valid status enum values', async () => {
      const activeDto = plainToInstance(SessionListQueryDto, { status: 'active' });
      const terminatedDto = plainToInstance(SessionListQueryDto, { status: 'terminated' });
      const allDto = plainToInstance(SessionListQueryDto, { status: 'all' });

      const [activeErrors, terminatedErrors, allErrors] = await Promise.all([
        validate(activeDto),
        validate(terminatedDto),
        validate(allDto),
      ]);

      expect(activeErrors.length).toBe(0);
      expect(terminatedErrors.length).toBe(0);
      expect(allErrors.length).toBe(0);
    });

    it('should reject invalid status values', async () => {
      const dto = plainToInstance(SessionListQueryDto, { status: 'invalid' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept valid pagination', async () => {
      const dto = plainToInstance(SessionListQueryDto, {
        page: 1,
        limit: 50,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject page less than 1', async () => {
      const dto = plainToInstance(SessionListQueryDto, {
        page: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject limit greater than 200', async () => {
      const dto = plainToInstance(SessionListQueryDto, {
        limit: 201,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept valid userId filter', async () => {
      const dto = plainToInstance(SessionListQueryDto, {
        userId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid userId format', async () => {
      const dto = plainToInstance(SessionListQueryDto, {
        userId: 'not-a-uuid',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept empty query (all optional)', async () => {
      const dto = plainToInstance(SessionListQueryDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('ValidateSessionDto', () => {
    it('should accept valid sessionId', async () => {
      const dto = plainToInstance(ValidateSessionDto, {
        sessionId: 'valid-session-id-123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject empty sessionId', async () => {
      const dto = plainToInstance(ValidateSessionDto, {
        sessionId: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing sessionId', async () => {
      const dto = plainToInstance(ValidateSessionDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
