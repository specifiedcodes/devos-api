/**
 * Tests for PermissionAuditQueryDto
 * Story 20-6: Permission Audit Trail
 */

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PermissionAuditQueryDto } from '../dto/permission-audit-query.dto';
import { PermissionAuditEventType } from '../../../database/entities/permission-audit-event.entity';

describe('PermissionAuditQueryDto', () => {
  function createDto(data: Record<string, any>): PermissionAuditQueryDto {
    return plainToInstance(PermissionAuditQueryDto, data);
  }

  it('should validate with no fields (all optional)', async () => {
    const dto = createDto({});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate valid eventType', async () => {
    const dto = createDto({ eventType: PermissionAuditEventType.ROLE_CREATED });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid eventType', async () => {
    const dto = createDto({ eventType: 'invalid_type' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should transform comma-separated eventTypes string to array', async () => {
    const dto = createDto({
      eventTypes: `${PermissionAuditEventType.ROLE_CREATED},${PermissionAuditEventType.ROLE_UPDATED}`,
    });
    expect(Array.isArray(dto.eventTypes)).toBe(true);
    expect(dto.eventTypes).toHaveLength(2);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid eventTypes values', async () => {
    const dto = createDto({ eventTypes: 'invalid,type' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should validate valid actorId UUID', async () => {
    const dto = createDto({ actorId: '550e8400-e29b-41d4-a716-446655440000' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid actorId', async () => {
    const dto = createDto({ actorId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should validate valid dateFrom ISO string', async () => {
    const dto = createDto({ dateFrom: '2024-01-01T00:00:00.000Z' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid dateFrom', async () => {
    const dto = createDto({ dateFrom: 'not-a-date' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject search exceeding maxLength', async () => {
    const dto = createDto({ search: 'x'.repeat(201) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept search within maxLength', async () => {
    const dto = createDto({ search: 'x'.repeat(200) });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should transform limit to number and validate min/max', async () => {
    const dto = createDto({ limit: '50' });
    expect(dto.limit).toBe(50);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject limit below 1', async () => {
    const dto = createDto({ limit: '0' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject limit above 100', async () => {
    const dto = createDto({ limit: '101' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should transform offset to number and validate min', async () => {
    const dto = createDto({ offset: '10' });
    expect(dto.offset).toBe(10);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
