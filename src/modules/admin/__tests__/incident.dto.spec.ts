import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateIncidentDto,
  AddIncidentUpdateDto,
  ResolveIncidentDto,
  UpdateIncidentDto,
  IncidentQueryDto,
} from '../dto/incident.dto';

describe('Incident DTOs', () => {
  describe('CreateIncidentDto', () => {
    it('should validate required fields', async () => {
      const dto = plainToInstance(CreateIncidentDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);

      const fieldNames = errors.map((e) => e.property);
      expect(fieldNames).toContain('title');
      expect(fieldNames).toContain('description');
      expect(fieldNames).toContain('severity');
      expect(fieldNames).toContain('affectedServices');
    });

    it('should reject invalid severity', async () => {
      const dto = plainToInstance(CreateIncidentDto, {
        title: 'Test',
        description: 'Test desc',
        severity: 'high',
        affectedServices: ['api'],
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'severity')).toBe(true);
    });

    it('should accept optional alertHistoryId UUID', async () => {
      const dto = plainToInstance(CreateIncidentDto, {
        title: 'Test',
        description: 'Test desc',
        severity: 'critical',
        affectedServices: ['api'],
        alertHistoryId: '550e8400-e29b-41d4-a716-446655440000',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject non-UUID alertHistoryId', async () => {
      const dto = plainToInstance(CreateIncidentDto, {
        title: 'Test',
        description: 'Test desc',
        severity: 'critical',
        affectedServices: ['api'],
        alertHistoryId: 'not-a-uuid',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'alertHistoryId')).toBe(true);
    });

    it('should accept valid dto', async () => {
      const dto = plainToInstance(CreateIncidentDto, {
        title: 'Database Outage',
        description: 'The primary database is down',
        severity: 'critical',
        affectedServices: ['database', 'api'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('AddIncidentUpdateDto', () => {
    it('should validate required fields', async () => {
      const dto = plainToInstance(AddIncidentUpdateDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);

      const fieldNames = errors.map((e) => e.property);
      expect(fieldNames).toContain('message');
      expect(fieldNames).toContain('status');
    });

    it('should reject invalid status', async () => {
      const dto = plainToInstance(AddIncidentUpdateDto, {
        message: 'Test update',
        status: 'invalid_status',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'status')).toBe(true);
    });

    it('should reject resolved status (use resolve endpoint instead)', async () => {
      const dto = plainToInstance(AddIncidentUpdateDto, {
        message: 'Trying to resolve via update',
        status: 'resolved',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'status')).toBe(true);
    });

    it('should accept valid dto', async () => {
      const dto = plainToInstance(AddIncidentUpdateDto, {
        message: 'Root cause identified',
        status: 'identified',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('ResolveIncidentDto', () => {
    it('should accept optional message and postMortemUrl', async () => {
      const dto = plainToInstance(ResolveIncidentDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate postMortemUrl is a URL', async () => {
      const dto = plainToInstance(ResolveIncidentDto, {
        postMortemUrl: 'not-a-url',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'postMortemUrl')).toBe(true);
    });

    it('should accept valid URL', async () => {
      const dto = plainToInstance(ResolveIncidentDto, {
        message: 'Fixed',
        postMortemUrl: 'https://docs.example.com/postmortem',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('UpdateIncidentDto', () => {
    it('should accept all optional fields', async () => {
      const dto = plainToInstance(UpdateIncidentDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate severity when provided', async () => {
      const dto = plainToInstance(UpdateIncidentDto, {
        severity: 'invalid',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'severity')).toBe(true);
    });
  });

  describe('IncidentQueryDto', () => {
    it('should default page=1, limit=20', () => {
      const dto = plainToInstance(IncidentQueryDto, {});
      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(20);
    });

    it('should reject limit > 100', async () => {
      const dto = plainToInstance(IncidentQueryDto, { limit: 200 });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });

    it('should accept valid filters', async () => {
      const dto = plainToInstance(IncidentQueryDto, {
        status: 'investigating',
        severity: 'critical',
        page: 2,
        limit: 50,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });
});
