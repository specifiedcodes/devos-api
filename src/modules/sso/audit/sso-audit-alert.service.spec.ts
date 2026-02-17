import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SsoAuditAlertService } from './sso-audit-alert.service';
import { SsoAuditAlertRule } from '../../../database/entities/sso-audit-alert-rule.entity';
import { RedisService } from '../../redis/redis.service';
import { SSO_AUDIT_CONSTANTS } from '../constants/audit.constants';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';

describe('SsoAuditAlertService', () => {
  let service: SsoAuditAlertService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
  };

  const mockRedisService = {
    increment: jest.fn(),
    expire: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    scanKeys: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoAuditAlertService,
        { provide: getRepositoryToken(SsoAuditAlertRule), useValue: mockRepository },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<SsoAuditAlertService>(SsoAuditAlertService);
  });

  describe('createAlertRule', () => {
    it('should create rule with correct fields', async () => {
      mockRepository.count.mockResolvedValue(0);
      const rule = {
        id: 'rule-1',
        name: 'Test Alert',
        eventTypes: ['saml_login_failure'],
        threshold: 5,
        windowMinutes: 5,
      };
      mockRepository.create.mockReturnValue(rule);
      mockRepository.save.mockResolvedValue(rule);

      const result = await service.createAlertRule({
        workspaceId: 'ws-1',
        name: 'Test Alert',
        eventTypes: ['saml_login_failure'],
        threshold: 5,
        windowMinutes: 5,
        notificationChannels: [{ type: 'email', target: 'admin@test.com' }],
        actorId: 'user-1',
      });

      expect(result.name).toBe('Test Alert');
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should reject when at max rule limit', async () => {
      mockRepository.count.mockResolvedValue(SSO_AUDIT_CONSTANTS.MAX_ALERT_RULES_PER_WORKSPACE);

      await expect(service.createAlertRule({
        workspaceId: 'ws-1',
        name: 'Test',
        eventTypes: ['saml_login_failure'],
        threshold: 1,
        windowMinutes: 5,
        notificationChannels: [],
        actorId: 'user-1',
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateAlertRule', () => {
    it('should apply partial updates', async () => {
      const existing = {
        id: 'rule-1',
        workspaceId: 'ws-1',
        name: 'Old Name',
        threshold: 1,
        isActive: true,
      };
      mockRepository.findOne.mockResolvedValue({ ...existing });
      mockRepository.save.mockImplementation(r => Promise.resolve(r));

      const result = await service.updateAlertRule({
        ruleId: 'rule-1',
        workspaceId: 'ws-1',
        name: 'New Name',
        actorId: 'user-1',
      });

      expect(result.name).toBe('New Name');
    });

    it('should reject when rule not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.updateAlertRule({
        ruleId: 'nonexistent',
        workspaceId: 'ws-1',
        actorId: 'user-1',
      })).rejects.toThrow(NotFoundException);
    });

    it('should reject when workspace mismatch', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 'rule-1', workspaceId: 'ws-other' });

      await expect(service.updateAlertRule({
        ruleId: 'rule-1',
        workspaceId: 'ws-1',
        actorId: 'user-1',
      })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAlertRule', () => {
    it('should remove rule and clean up Redis', async () => {
      const rule = { id: 'rule-1', workspaceId: 'ws-1' };
      mockRepository.findOne.mockResolvedValue(rule);
      mockRepository.remove.mockResolvedValue(undefined);
      mockRedisService.scanKeys.mockResolvedValue(['key1', 'key2']);
      mockRedisService.del.mockResolvedValue(undefined);

      await service.deleteAlertRule('rule-1', 'ws-1', 'user-1');

      expect(mockRepository.remove).toHaveBeenCalledWith(rule);
      expect(mockRedisService.scanKeys).toHaveBeenCalled();
      expect(mockRedisService.del).toHaveBeenCalledWith('key1', 'key2');
    });
  });

  describe('listAlertRules', () => {
    it('should return all rules for workspace', async () => {
      const rules = [
        { id: 'rule-1', workspaceId: 'ws-1', name: 'Rule 1' },
        { id: 'rule-2', workspaceId: 'ws-1', name: 'Rule 2' },
      ];
      mockRepository.find.mockResolvedValue(rules);

      const result = await service.listAlertRules('ws-1');
      expect(result).toHaveLength(2);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('getAlertRule', () => {
    it('should return rule by ID', async () => {
      const rule = { id: 'rule-1', workspaceId: 'ws-1' };
      mockRepository.findOne.mockResolvedValue(rule);

      const result = await service.getAlertRule('rule-1', 'ws-1');
      expect(result.id).toBe('rule-1');
    });

    it('should throw NotFoundException when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getAlertRule('rule-1', 'ws-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('evaluateAlertRules', () => {
    const mockEvent = {
      id: 'event-1',
      workspaceId: 'ws-1',
      eventType: SsoAuditEventType.SAML_LOGIN_FAILURE,
      createdAt: new Date(),
    } as any;

    it('should increment counter in Redis', async () => {
      const rule = {
        id: 'rule-1',
        workspaceId: 'ws-1',
        isActive: true,
        eventTypes: ['saml_login_failure'],
        threshold: 5,
        windowMinutes: 5,
        cooldownMinutes: 30,
        triggerCount: 0,
      };
      mockRepository.find.mockResolvedValue([rule]);
      mockRedisService.increment.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(true);

      const results = await service.evaluateAlertRules(mockEvent);
      expect(results).toHaveLength(1);
      expect(mockRedisService.increment).toHaveBeenCalled();
    });

    it('should trigger when counter meets threshold', async () => {
      const rule = {
        id: 'rule-1',
        workspaceId: 'ws-1',
        isActive: true,
        eventTypes: ['saml_login_failure'],
        threshold: 5,
        windowMinutes: 5,
        cooldownMinutes: 30,
        triggerCount: 0,
        lastTriggeredAt: null,
      };
      mockRepository.find.mockResolvedValue([rule]);
      mockRedisService.increment.mockResolvedValue(5);
      mockRedisService.expire.mockResolvedValue(true);
      mockRedisService.get.mockResolvedValue(null); // Not in cooldown
      mockRedisService.set.mockResolvedValue(undefined);
      mockRepository.save.mockImplementation(r => Promise.resolve(r));

      const results = await service.evaluateAlertRules(mockEvent);
      expect(results[0].triggered).toBe(true);
      expect(results[0].eventCount).toBe(5);
    });

    it('should respect cooldown period', async () => {
      const rule = {
        id: 'rule-1',
        workspaceId: 'ws-1',
        isActive: true,
        eventTypes: ['saml_login_failure'],
        threshold: 1,
        windowMinutes: 5,
        cooldownMinutes: 30,
        triggerCount: 0,
      };
      mockRepository.find.mockResolvedValue([rule]);
      mockRedisService.increment.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(true);
      mockRedisService.get.mockResolvedValue('1'); // In cooldown

      const results = await service.evaluateAlertRules(mockEvent);
      expect(results[0].triggered).toBe(false);
    });

    it('should skip rules that do not match event type', async () => {
      const rule = {
        id: 'rule-1',
        workspaceId: 'ws-1',
        isActive: true,
        eventTypes: ['oidc_login_failure'],
        threshold: 1,
        windowMinutes: 5,
        cooldownMinutes: 30,
      };
      mockRepository.find.mockResolvedValue([rule]);

      const results = await service.evaluateAlertRules(mockEvent);
      expect(results).toHaveLength(0);
      expect(mockRedisService.increment).not.toHaveBeenCalled();
    });

    it('should skip inactive rules (filtered by query)', async () => {
      mockRepository.find.mockResolvedValue([]);

      const results = await service.evaluateAlertRules(mockEvent);
      expect(results).toHaveLength(0);
    });
  });

  describe('initializeDefaultAlertRules', () => {
    it('should create default rules for new workspace', async () => {
      mockRepository.count.mockResolvedValue(0);
      mockRepository.create.mockImplementation(r => r);
      mockRepository.save.mockImplementation(r => Promise.resolve({ id: 'new-rule', ...r }));

      await service.initializeDefaultAlertRules('ws-1', 'user-1');

      expect(mockRepository.save).toHaveBeenCalledTimes(
        SSO_AUDIT_CONSTANTS.DEFAULT_ALERT_RULES.length,
      );
    });

    it('should skip if rules already exist', async () => {
      mockRepository.count.mockResolvedValue(3);

      await service.initializeDefaultAlertRules('ws-1', 'user-1');

      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });
});
