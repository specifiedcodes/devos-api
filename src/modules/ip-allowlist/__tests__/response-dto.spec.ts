/**
 * Response DTO Tests
 *
 * Story 20-4: IP Allowlisting
 * Target: 6 tests covering IpEntryResponseDto.fromEntity and DTO shape
 */
import { IpEntryResponseDto, IpConfigResponseDto, IpTestResponseDto, BlockedAttemptDto } from '../dto/ip-entry-response.dto';
import { IpAllowlistEntry } from '../../../database/entities/ip-allowlist-entry.entity';

describe('IpEntryResponseDto', () => {
  it('should create from entity via fromEntity', () => {
    const entity = new IpAllowlistEntry();
    entity.id = '11111111-1111-1111-1111-111111111111';
    entity.workspaceId = '22222222-2222-2222-2222-222222222222';
    entity.ipAddress = '203.0.113.50';
    entity.description = 'Office VPN';
    entity.isActive = true;
    entity.createdBy = '33333333-3333-3333-3333-333333333333';
    entity.createdAt = new Date('2024-01-01');
    entity.updatedAt = new Date('2024-01-02');

    const dto = IpEntryResponseDto.fromEntity(entity);

    expect(dto.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(dto.workspaceId).toBe('22222222-2222-2222-2222-222222222222');
    expect(dto.ipAddress).toBe('203.0.113.50');
    expect(dto.description).toBe('Office VPN');
    expect(dto.isActive).toBe(true);
    expect(dto.createdBy).toBe('33333333-3333-3333-3333-333333333333');
    expect(dto.createdAt).toEqual(new Date('2024-01-01'));
    expect(dto.updatedAt).toEqual(new Date('2024-01-02'));
  });

  it('should return an IpEntryResponseDto instance', () => {
    const entity = new IpAllowlistEntry();
    entity.id = '11111111-1111-1111-1111-111111111111';
    entity.workspaceId = '22222222-2222-2222-2222-222222222222';
    entity.ipAddress = '10.0.0.0/8';
    entity.description = 'CIDR range';
    entity.isActive = false;
    entity.createdBy = '33333333-3333-3333-3333-333333333333';
    entity.createdAt = new Date();
    entity.updatedAt = new Date();

    const dto = IpEntryResponseDto.fromEntity(entity);
    expect(dto).toBeInstanceOf(IpEntryResponseDto);
    expect(dto.isActive).toBe(false);
  });
});

describe('IpConfigResponseDto', () => {
  it('should have all required fields', () => {
    const dto = new IpConfigResponseDto();
    dto.workspaceId = '11111111-1111-1111-1111-111111111111';
    dto.isEnabled = true;
    dto.gracePeriodEndsAt = new Date();
    dto.emergencyDisableUntil = null;
    dto.isInGracePeriod = true;
    dto.isEmergencyDisabled = false;

    expect(dto.workspaceId).toBeDefined();
    expect(dto.isEnabled).toBe(true);
    expect(dto.isInGracePeriod).toBe(true);
    expect(dto.isEmergencyDisabled).toBe(false);
  });
});

describe('IpTestResponseDto', () => {
  it('should have all required fields', () => {
    const dto = new IpTestResponseDto();
    dto.ipAddress = '1.2.3.4';
    dto.isAllowed = true;
    dto.matchedEntry = null;
    dto.isGracePeriod = false;

    expect(dto.ipAddress).toBe('1.2.3.4');
    expect(dto.isAllowed).toBe(true);
    expect(dto.matchedEntry).toBeNull();
    expect(dto.isGracePeriod).toBe(false);
  });
});

describe('BlockedAttemptDto', () => {
  it('should have all required fields', () => {
    const dto = new BlockedAttemptDto();
    dto.ipAddress = '1.2.3.4';
    dto.userId = null;
    dto.timestamp = new Date().toISOString();
    dto.endpoint = 'GET /api/test';

    expect(dto.ipAddress).toBe('1.2.3.4');
    expect(dto.userId).toBeNull();
    expect(dto.endpoint).toBe('GET /api/test');
  });

  it('should accept userId when present', () => {
    const dto = new BlockedAttemptDto();
    dto.userId = '11111111-1111-1111-1111-111111111111';

    expect(dto.userId).toBe('11111111-1111-1111-1111-111111111111');
  });
});
