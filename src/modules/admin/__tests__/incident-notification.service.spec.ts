import { IncidentNotificationService } from '../services/incident-notification.service';
import { Incident } from '../../../database/entities/incident.entity';
import { IncidentUpdate } from '../../../database/entities/incident-update.entity';

describe('IncidentNotificationService', () => {
  let service: IncidentNotificationService;
  let mockUserRepository: any;
  let mockNotificationService: any;
  let mockEmailService: any;
  let mockConfigService: any;

  const mockIncident: Partial<Incident> = {
    id: 'incident-1',
    title: 'Database Outage',
    description: 'Primary database is not responding',
    severity: 'critical',
    status: 'investigating',
    affectedServices: ['database', 'api'],
    createdBy: 'admin-1',
    postMortemUrl: null,
    resolvedAt: null,
    createdAt: new Date('2026-02-16T10:00:00Z'),
    updatedAt: new Date('2026-02-16T10:00:00Z'),
  };

  const mockUpdate: Partial<IncidentUpdate> = {
    id: 'update-1',
    incidentId: 'incident-1',
    message: 'Investigating the database outage',
    status: 'investigating',
    author: 'admin-1',
    createdAt: new Date('2026-02-16T10:00:00Z'),
  };

  beforeEach(() => {
    mockUserRepository = {
      find: jest.fn().mockResolvedValue([
        { id: 'admin-1' },
        { id: 'admin-2' },
      ]),
    };

    mockNotificationService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    mockEmailService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'ADMIN_ALERT_EMAIL') return 'admin@test.com,ops@test.com';
        if (key === 'FRONTEND_URL') return 'http://localhost:3000';
        if (key === 'INCIDENT_WEBHOOK_URL') return 'https://hooks.slack.com/test';
        return defaultValue;
      }),
    };

    service = new IncidentNotificationService(
      mockUserRepository,
      mockNotificationService,
      mockEmailService,
      mockConfigService,
    );
  });

  describe('handleIncidentCreated', () => {
    it('should create in-app notification for all platform admins', async () => {
      await service.handleIncidentCreated({
        incident: mockIncident as Incident,
        update: mockUpdate as IncidentUpdate,
      });

      expect(mockNotificationService.create).toHaveBeenCalledTimes(2); // 2 admins
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'incident_created',
          title: expect.stringContaining('[INCIDENT]'),
          userId: 'admin-1',
        }),
      );
    });

    it('should send email to ADMIN_ALERT_EMAIL recipients', async () => {
      await service.handleIncidentCreated({
        incident: mockIncident as Incident,
        update: mockUpdate as IncidentUpdate,
      });

      // Two emails for two recipients
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(2);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@test.com',
          subject: expect.stringContaining('[DevOS INCIDENT]'),
        }),
      );
    });

    it('should send webhook for critical incidents', async () => {
      // Mock global fetch
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      }) as any;

      await service.handleIncidentCreated({
        incident: mockIncident as Incident,
        update: mockUpdate as IncidentUpdate,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        }),
      );

      global.fetch = originalFetch;
    });

    it('should handle notification failure gracefully', async () => {
      mockNotificationService.create.mockRejectedValue(new Error('Notification failed'));
      mockEmailService.sendEmail.mockRejectedValue(new Error('Email failed'));

      // Should not throw
      await expect(
        service.handleIncidentCreated({
          incident: mockIncident as Incident,
          update: mockUpdate as IncidentUpdate,
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('handleIncidentUpdated', () => {
    it('should create in-app notification for admins', async () => {
      const update = {
        ...mockUpdate,
        status: 'identified' as const,
        message: 'Root cause identified',
      };

      await service.handleIncidentUpdated({
        incident: mockIncident as Incident,
        update: update as IncidentUpdate,
      });

      expect(mockNotificationService.create).toHaveBeenCalledTimes(2);
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'incident_updated',
          title: expect.stringContaining('[UPDATE]'),
        }),
      );
    });

    it('should send email for critical/major incidents', async () => {
      await service.handleIncidentUpdated({
        incident: mockIncident as Incident, // severity: critical
        update: mockUpdate as IncidentUpdate,
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalled();
    });

    it('should skip email for minor incident updates', async () => {
      const minorIncident = { ...mockIncident, severity: 'minor' };

      await service.handleIncidentUpdated({
        incident: minorIncident as Incident,
        update: mockUpdate as IncidentUpdate,
      });

      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('handleIncidentResolved', () => {
    const resolvedIncident = {
      ...mockIncident,
      status: 'resolved' as const,
      resolvedAt: new Date('2026-02-16T12:00:00Z'),
    };

    const resolveUpdate = {
      ...mockUpdate,
      status: 'resolved' as const,
      message: 'Issue fixed by restarting database',
    };

    it('should create in-app notification for admins', async () => {
      await service.handleIncidentResolved({
        incident: resolvedIncident as Incident,
        update: resolveUpdate as IncidentUpdate,
      });

      expect(mockNotificationService.create).toHaveBeenCalledTimes(2);
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'incident_resolved',
          title: expect.stringContaining('[RESOLVED]'),
        }),
      );
    });

    it('should send resolution email', async () => {
      await service.handleIncidentResolved({
        incident: resolvedIncident as Incident,
        update: resolveUpdate as IncidentUpdate,
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('[DevOS RESOLVED]'),
        }),
      );
    });

    it('should include post-mortem link in email when available', async () => {
      const incidentWithPM = {
        ...resolvedIncident,
        postMortemUrl: 'https://docs.example.com/pm',
      };

      await service.handleIncidentResolved({
        incident: incidentWithPM as Incident,
        update: resolveUpdate as IncidentUpdate,
      });

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('https://docs.example.com/pm'),
        }),
      );
    });
  });
});
