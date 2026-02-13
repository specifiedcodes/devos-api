import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SendMessageDto } from './send-message.dto';
import { GetMessagesQueryDto } from './get-messages-query.dto';
import { UpdateMessageStatusDto } from './update-message-status.dto';

describe('Chat DTOs', () => {
  describe('SendMessageDto', () => {
    it('should validate a valid message', async () => {
      const dto = plainToInstance(SendMessageDto, {
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        text: "How's Story 5.2 going?",
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with optional projectId', async () => {
      const dto = plainToInstance(SendMessageDto, {
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        projectId: '550e8400-e29b-41d4-a716-446655440002',
        text: 'Test message',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid agentId UUID', async () => {
      const dto = plainToInstance(SendMessageDto, {
        agentId: 'not-a-uuid',
        text: 'Test message',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'agentId')).toBe(true);
    });

    it('should reject empty agentId', async () => {
      const dto = plainToInstance(SendMessageDto, {
        agentId: '',
        text: 'Test message',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'agentId')).toBe(true);
    });

    it('should reject empty text', async () => {
      const dto = plainToInstance(SendMessageDto, {
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        text: '',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'text')).toBe(true);
    });

    it('should reject text longer than 2000 characters', async () => {
      const dto = plainToInstance(SendMessageDto, {
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        text: 'a'.repeat(2001),
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'text')).toBe(true);
    });

    it('should accept text with exactly 2000 characters', async () => {
      const dto = plainToInstance(SendMessageDto, {
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        text: 'a'.repeat(2000),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid projectId UUID', async () => {
      const dto = plainToInstance(SendMessageDto, {
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        projectId: 'invalid-uuid',
        text: 'Test message',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'projectId')).toBe(true);
    });
  });

  describe('GetMessagesQueryDto', () => {
    it('should validate with no parameters', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {});

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with valid agentId filter', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {
        agentId: '550e8400-e29b-41d4-a716-446655440001',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with valid projectId filter', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {
        projectId: '550e8400-e29b-41d4-a716-446655440002',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with valid limit', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {
        limit: 25,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject limit less than 1', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {
        limit: 0,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });

    it('should reject limit greater than 100', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {
        limit: 101,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });

    it('should validate with valid before cursor', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {
        before: '550e8400-e29b-41d4-a716-446655440003',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with all parameters combined', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {
        agentId: '550e8400-e29b-41d4-a716-446655440001',
        projectId: '550e8400-e29b-41d4-a716-446655440002',
        limit: 50,
        before: '550e8400-e29b-41d4-a716-446655440003',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid agentId UUID', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {
        agentId: 'not-a-uuid',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'agentId')).toBe(true);
    });

    it('should transform string limit to number', async () => {
      const dto = plainToInstance(GetMessagesQueryDto, {
        limit: '25',
      });

      expect(dto.limit).toBe(25);
    });

    it('should use default limit of 50', () => {
      const dto = new GetMessagesQueryDto();
      expect(dto.limit).toBe(50);
    });
  });

  describe('UpdateMessageStatusDto', () => {
    it('should validate delivered status', async () => {
      const dto = plainToInstance(UpdateMessageStatusDto, {
        status: 'delivered',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate read status', async () => {
      const dto = plainToInstance(UpdateMessageStatusDto, {
        status: 'read',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject sent status (not allowed for updates)', async () => {
      const dto = plainToInstance(UpdateMessageStatusDto, {
        status: 'sent',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'status')).toBe(true);
    });

    it('should reject invalid status', async () => {
      const dto = plainToInstance(UpdateMessageStatusDto, {
        status: 'invalid',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'status')).toBe(true);
    });

    it('should reject empty status', async () => {
      const dto = plainToInstance(UpdateMessageStatusDto, {
        status: '',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'status')).toBe(true);
    });
  });
});
