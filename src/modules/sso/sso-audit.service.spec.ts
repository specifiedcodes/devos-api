import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SsoAuditService } from './sso-audit.service';
import { SsoAuditEvent, SsoAuditEventType } from '../../database/entities/sso-audit-event.entity';

describe('SsoAuditService', () => {
  let service: SsoAuditService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoAuditService,
        {
          provide: getRepositoryToken(SsoAuditEvent),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<SsoAuditService>(SsoAuditService);
  });

  describe('logEvent', () => {
    it('should create and save an audit event', async () => {
      const eventData = {
        workspaceId: 'ws-123',
        eventType: SsoAuditEventType.SAML_CONFIG_CREATED,
        actorId: 'user-123',
        samlConfigId: 'config-123',
        details: { providerName: 'Okta' },
      };

      const createdEvent = { id: 'event-123', ...eventData };
      mockRepository.create.mockReturnValue(createdEvent);
      mockRepository.save.mockResolvedValue(createdEvent);

      const result = await service.logEvent(eventData);

      expect(mockRepository.create).toHaveBeenCalledWith({
        workspaceId: 'ws-123',
        eventType: SsoAuditEventType.SAML_CONFIG_CREATED,
        actorId: 'user-123',
        targetUserId: null,
        samlConfigId: 'config-123',
        oidcConfigId: null,
        ipAddress: null,
        userAgent: null,
        details: { providerName: 'Okta' },
      });
      expect(mockRepository.save).toHaveBeenCalledWith(createdEvent);
      expect(result).toEqual(createdEvent);
    });

    it('should handle all event types', async () => {
      for (const eventType of Object.values(SsoAuditEventType)) {
        mockRepository.create.mockReturnValue({ eventType });
        mockRepository.save.mockResolvedValue({ eventType });

        const result = await service.logEvent({
          workspaceId: 'ws-123',
          eventType,
        });

        expect(result.eventType).toBe(eventType);
      }
    });

    it('should not throw on database error (fire-and-forget)', async () => {
      mockRepository.create.mockReturnValue({});
      mockRepository.save.mockRejectedValue(new Error('DB error'));

      const result = await service.logEvent({
        workspaceId: 'ws-123',
        eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS,
      });

      // Should not throw, returns empty object
      expect(result).toBeDefined();
    });

    it('should set null for optional fields when not provided', async () => {
      const eventData = {
        workspaceId: 'ws-123',
        eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS,
      };

      mockRepository.create.mockReturnValue(eventData);
      mockRepository.save.mockResolvedValue(eventData);

      await service.logEvent(eventData);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: null,
          targetUserId: null,
          samlConfigId: null,
          oidcConfigId: null,
          ipAddress: null,
          userAgent: null,
          details: {},
        }),
      );
    });
  });

  describe('listEvents', () => {
    it('should return paginated results', async () => {
      const events = [
        { id: 'event-1', eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS },
        { id: 'event-2', eventType: SsoAuditEventType.SAML_CONFIG_CREATED },
      ];
      mockRepository.findAndCount.mockResolvedValue([events, 2]);

      const result = await service.listEvents('ws-123');

      expect(result).toEqual({
        events,
        total: 2,
        page: 1,
        limit: 50,
      });
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-123' },
          order: { createdAt: 'DESC' },
          skip: 0,
          take: 50,
        }),
      );
    });

    it('should apply eventType filter', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.listEvents('ws-123', {
        eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS,
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS,
          }),
        }),
      );
    });

    it('should apply date range filter', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);
      const dateFrom = new Date('2026-01-01');
      const dateTo = new Date('2026-02-01');

      await service.listEvents('ws-123', { dateFrom, dateTo });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.anything(),
          }),
        }),
      );
    });

    it('should respect max limit of 200', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.listEvents('ws-123', { limit: 500 });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 200,
        }),
      );
    });

    it('should order by createdAt DESC', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.listEvents('ws-123');

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('should handle pagination correctly', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.listEvents('ws-123', { page: 3, limit: 10 });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });
  });
});
