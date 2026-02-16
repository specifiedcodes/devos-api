import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AdminAuditLogQueryDto,
  AdminAuditLogStatsDto,
  CreateSavedSearchDto,
} from '../dto/audit-log.dto';

describe('AdminAuditLogQueryDto', () => {
  it('should default page=1, limit=50', () => {
    const dto = plainToInstance(AdminAuditLogQueryDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(50);
  });

  it('should reject limit > 100', async () => {
    const dto = plainToInstance(AdminAuditLogQueryDto, { limit: 200 });
    const errors = await validate(dto);
    const limitError = errors.find((e) => e.property === 'limit');
    expect(limitError).toBeDefined();
  });

  it('should validate ISO8601 dates', async () => {
    const dto = plainToInstance(AdminAuditLogQueryDto, {
      startDate: 'not-a-date',
    });
    const errors = await validate(dto);
    const dateError = errors.find((e) => e.property === 'startDate');
    expect(dateError).toBeDefined();
  });

  it('should accept all optional filter fields', async () => {
    const dto = plainToInstance(AdminAuditLogQueryDto, {
      userId: 'user-1',
      userEmail: 'test@example.com',
      workspaceId: 'ws-1',
      action: 'create',
      actionPrefix: 'admin.',
      resourceType: 'project',
      resourceId: 'proj-1',
      ipAddress: '192.168.1.1',
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-12-31T23:59:59Z',
      search: 'test query',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject search > 200 chars', async () => {
    const dto = plainToInstance(AdminAuditLogQueryDto, {
      search: 'a'.repeat(201),
    });
    const errors = await validate(dto);
    const searchError = errors.find((e) => e.property === 'search');
    expect(searchError).toBeDefined();
  });
});

describe('AdminAuditLogStatsDto', () => {
  it('should require startDate and endDate', async () => {
    const dto = plainToInstance(AdminAuditLogStatsDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const props = errors.map((e) => e.property);
    expect(props).toContain('startDate');
    expect(props).toContain('endDate');
  });

  it('should validate ISO8601 format', async () => {
    const dto = plainToInstance(AdminAuditLogStatsDto, {
      startDate: 'invalid',
      endDate: 'invalid',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(2);
  });

  it('should accept valid ISO8601 dates', async () => {
    const dto = plainToInstance(AdminAuditLogStatsDto, {
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-12-31T23:59:59Z',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe('CreateSavedSearchDto', () => {
  it('should validate name (1-100 chars)', async () => {
    // Empty name
    const dto1 = plainToInstance(CreateSavedSearchDto, {
      name: '',
      filters: {},
    });
    const errors1 = await validate(dto1);
    expect(errors1.find((e) => e.property === 'name')).toBeDefined();

    // Too long name
    const dto2 = plainToInstance(CreateSavedSearchDto, {
      name: 'a'.repeat(101),
      filters: {},
    });
    const errors2 = await validate(dto2);
    expect(errors2.find((e) => e.property === 'name')).toBeDefined();

    // Valid name
    const dto3 = plainToInstance(CreateSavedSearchDto, {
      name: 'Valid Search Name',
      filters: {},
    });
    const errors3 = await validate(dto3);
    expect(errors3.length).toBe(0);
  });

  it('should require filters object', async () => {
    const dto = plainToInstance(CreateSavedSearchDto, {
      name: 'Test',
      filters: 'not-an-object',
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'filters')).toBeDefined();
  });

  it('should default isShared to false', () => {
    const dto = plainToInstance(CreateSavedSearchDto, {
      name: 'Test',
      filters: {},
    });
    expect(dto.isShared).toBe(false);
  });

  it('should accept valid input', async () => {
    const dto = plainToInstance(CreateSavedSearchDto, {
      name: 'My Search',
      filters: { action: 'create', userId: 'user-1' },
      isShared: true,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
