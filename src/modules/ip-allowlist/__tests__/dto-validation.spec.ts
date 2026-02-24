/**
 * IP Allowlist DTO Validation Tests
 *
 * Story 20-4: IP Allowlisting
 * Target: 15 tests covering CreateIpEntryDto, UpdateIpEntryDto, UpdateIpConfigDto
 */
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateIpEntryDto } from '../dto/create-ip-entry.dto';
import { UpdateIpEntryDto } from '../dto/update-ip-entry.dto';
import { UpdateIpConfigDto } from '../dto/update-ip-config.dto';

describe('IP Allowlist DTO Validation', () => {
  // ==================== CreateIpEntryDto ====================

  describe('CreateIpEntryDto', () => {
    it('should pass with valid IPv4 address and description', async () => {
      const dto = plainToInstance(CreateIpEntryDto, {
        ipAddress: '203.0.113.50',
        description: 'Office VPN',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass with valid CIDR notation', async () => {
      const dto = plainToInstance(CreateIpEntryDto, {
        ipAddress: '10.0.0.0/8',
        description: 'Internal network',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with empty ipAddress', async () => {
      const dto = plainToInstance(CreateIpEntryDto, {
        ipAddress: '',
        description: 'Office VPN',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with empty description', async () => {
      const dto = plainToInstance(CreateIpEntryDto, {
        ipAddress: '203.0.113.50',
        description: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid IP format', async () => {
      const dto = plainToInstance(CreateIpEntryDto, {
        ipAddress: 'not-an-ip',
        description: 'Bad IP',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with description exceeding 200 chars', async () => {
      const dto = plainToInstance(CreateIpEntryDto, {
        ipAddress: '10.0.0.1',
        description: 'a'.repeat(201),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with ipAddress exceeding 45 chars', async () => {
      const dto = plainToInstance(CreateIpEntryDto, {
        ipAddress: 'a'.repeat(46),
        description: 'Too long IP',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ==================== UpdateIpEntryDto ====================

  describe('UpdateIpEntryDto', () => {
    it('should pass with optional ipAddress', async () => {
      const dto = plainToInstance(UpdateIpEntryDto, {
        ipAddress: '10.0.0.1',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass with optional description', async () => {
      const dto = plainToInstance(UpdateIpEntryDto, {
        description: 'Updated description',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass with optional isActive', async () => {
      const dto = plainToInstance(UpdateIpEntryDto, {
        isActive: false,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass with empty body (all optional)', async () => {
      const dto = plainToInstance(UpdateIpEntryDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid IP format', async () => {
      const dto = plainToInstance(UpdateIpEntryDto, {
        ipAddress: 'not-valid',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ==================== UpdateIpConfigDto ====================

  describe('UpdateIpConfigDto', () => {
    it('should pass with isEnabled true', async () => {
      const dto = plainToInstance(UpdateIpConfigDto, { isEnabled: true });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass with isEnabled false', async () => {
      const dto = plainToInstance(UpdateIpConfigDto, { isEnabled: false });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with non-boolean isEnabled', async () => {
      const dto = plainToInstance(UpdateIpConfigDto, { isEnabled: 'yes' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
