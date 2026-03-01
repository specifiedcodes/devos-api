import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditService,
  AuditAction,
  AuditLogFilters,
  BYOK_AUDIT_ACTIONS,
  RAILWAY_AUDIT_ACTIONS,
  sanitizeRailwayAuditPayload,
} from './audit.service';
import { AuditLog } from '../../database/entities/audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  let repository: Repository<AuditLog>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    repository = module.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should create and save audit log', async () => {
      const mockLog = {
        id: '1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: AuditAction.PROJECT_CREATED,
        resourceType: 'project',
        resourceId: 'proj-1',
        metadata: { name: 'Test Project' },
      };

      mockRepository.create.mockReturnValue(mockLog);
      mockRepository.save.mockResolvedValue(mockLog);

      await service.log(
        'ws-1',
        'user-1',
        AuditAction.PROJECT_CREATED,
        'project',
        'proj-1',
        { name: 'Test Project' },
      );

      expect(mockRepository.create).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: AuditAction.PROJECT_CREATED,
        resourceType: 'project',
        resourceId: 'proj-1',
        metadata: { name: 'Test Project' },
        ipAddress: undefined,
        userAgent: undefined,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockLog);
    });

    it('should not fail main operation if audit logging fails', async () => {
      mockRepository.create.mockReturnValue({});
      mockRepository.save.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(
        service.log(
          'ws-1',
          'user-1',
          AuditAction.PROJECT_CREATED,
          'project',
          'proj-1',
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('getWorkspaceLogsWithFilters', () => {
    it('should query logs with filters', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const filters: AuditLogFilters = {
        userId: 'user-1',
        actions: [AuditAction.PROJECT_CREATED],
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      };

      await service.getWorkspaceLogsWithFilters('ws-1', filters, 50, 0);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'audit.workspaceId = :workspaceId',
        { workspaceId: 'ws-1' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.userId = :userId',
        { userId: 'user-1' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.action IN (:...actions)',
        { actions: [AuditAction.PROJECT_CREATED] },
      );
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(50);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
    });
  });

  describe('exportAuditLogsToCSV', () => {
    it('should export logs to CSV format', async () => {
      const mockLogs = [
        {
          id: '1',
          createdAt: new Date('2024-01-01T10:00:00Z'),
          userId: 'user-1',
          action: 'project_created',
          resourceType: 'project',
          resourceId: 'proj-1',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: { name: 'Test' },
        },
      ];

      jest.spyOn(service, 'getWorkspaceLogsWithFilters').mockResolvedValue({
        logs: mockLogs as any,
        total: 1,
      });

      const csv = await service.exportAuditLogsToCSV('ws-1', {});

      expect(csv).toContain('Timestamp,User ID,Action');
      expect(csv).toContain('2024-01-01T10:00:00.000Z');
      expect(csv).toContain('user-1');
      expect(csv).toContain('project_created');
    });

    it('should escape CSV injection attempts', async () => {
      const mockLogs = [
        {
          id: '1',
          createdAt: new Date('2024-01-01T10:00:00Z'),
          userId: 'user-1',
          action: '=MALICIOUS',
          resourceType: '+FORMULA',
          resourceId: '@EXPLOIT',
          ipAddress: '-ATTACK',
          userAgent: 'Normal',
          metadata: {},
        },
      ];

      jest.spyOn(service, 'getWorkspaceLogsWithFilters').mockResolvedValue({
        logs: mockLogs as any,
        total: 1,
      });

      const csv = await service.exportAuditLogsToCSV('ws-1', {});

      // Formula injection attempts should be escaped
      expect(csv).toContain("'=MALICIOUS");
      expect(csv).toContain("'+FORMULA");
      expect(csv).toContain("'@EXPLOIT");
      expect(csv).toContain("'-ATTACK");
    });
  });

  describe('BYOK audit action types', () => {
    it('should have BYOK_KEY_USED enum value', () => {
      expect(AuditAction.BYOK_KEY_USED).toBe('byok_key_used');
    });

    it('should have BYOK_KEY_VALIDATION_FAILED enum value', () => {
      expect(AuditAction.BYOK_KEY_VALIDATION_FAILED).toBe(
        'byok_key_validation_failed',
      );
    });

    it('should have BYOK_AUDIT_ACTIONS constant with all 6 BYOK actions', () => {
      expect(BYOK_AUDIT_ACTIONS).toHaveLength(6);
      expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_CREATED);
      expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_DELETED);
      expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_ACCESSED);
      expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_UPDATED);
      expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_USED);
      expect(BYOK_AUDIT_ACTIONS).toContain(
        AuditAction.BYOK_KEY_VALIDATION_FAILED,
      );
    });
  });

  describe('getByokAuditSummary', () => {
    it('should return correct BYOK audit summary', async () => {
      const mockActionCounts = [
        { action: 'byok_key_created', count: '5' },
        { action: 'byok_key_accessed', count: '10' },
        { action: 'byok_key_used', count: '100' },
        { action: 'byok_key_validation_failed', count: '2' },
      ];

      const mockUniqueUsers = { count: '3' };
      const mockCost = { totalCost: '47.32' };

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockActionCounts),
        getRawOne: jest.fn(),
      };

      // First call returns action counts, second call returns unique users, third returns cost
      let callCount = 0;
      mockRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            ...mockQueryBuilder,
            getRawMany: jest.fn().mockResolvedValue(mockActionCounts),
          };
        } else if (callCount === 2) {
          return {
            ...mockQueryBuilder,
            getRawOne: jest.fn().mockResolvedValue(mockUniqueUsers),
          };
        } else {
          return {
            ...mockQueryBuilder,
            getRawOne: jest.fn().mockResolvedValue(mockCost),
          };
        }
      });

      const result = await service.getByokAuditSummary('ws-1', 30);

      expect(result.totalKeyAccessEvents).toBe(15); // 5 created + 10 accessed
      expect(result.totalApiCallsViaByok).toBe(100);
      expect(result.totalCostViaByok).toBe(47.32);
      expect(result.uniqueUsersAccessingKeys).toBe(3);
      expect(result.failedValidationAttempts).toBe(2);
      expect(result.period.start).toBeDefined();
      expect(result.period.end).toBeDefined();
    });

    it('should return zeros when no BYOK audit events exist', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ count: '0', totalCost: null }),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getByokAuditSummary('ws-1', 30);

      expect(result.totalKeyAccessEvents).toBe(0);
      expect(result.totalApiCallsViaByok).toBe(0);
      expect(result.totalCostViaByok).toBe(0);
      expect(result.uniqueUsersAccessingKeys).toBe(0);
      expect(result.failedValidationAttempts).toBe(0);
    });
  });

  describe('log with IP and user agent', () => {
    it('should extract ipAddress and userAgent from metadata', async () => {
      const mockLog = {
        id: '1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: AuditAction.BYOK_KEY_CREATED,
        resourceType: 'byok_key',
        resourceId: 'key-1',
        metadata: {
          keyName: 'Test Key',
          provider: 'anthropic',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      };

      mockRepository.create.mockReturnValue(mockLog);
      mockRepository.save.mockResolvedValue(mockLog);

      await service.log(
        'ws-1',
        'user-1',
        AuditAction.BYOK_KEY_CREATED,
        'byok_key',
        'key-1',
        {
          keyName: 'Test Key',
          provider: 'anthropic',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      );

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: expect.objectContaining({
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          }),
        }),
      );
    });
  });

  describe('cleanupOldLogs', () => {
    it('should delete logs older than retention period', async () => {
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 50 }),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const deletedCount = await service.cleanupOldLogs(90);

      expect(deletedCount).toBe(50);
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'createdAt < :cutoffDate',
        expect.objectContaining({ cutoffDate: expect.any(Date) }),
      );
    });

    it('should use default retention of 90 days', async () => {
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.cleanupOldLogs();

      expect(mockQueryBuilder.where).toHaveBeenCalled();
    });
  });

  // ==================================================================
  // Story 23-6: Railway CLI Audit Action Types
  // ==================================================================

  describe('Railway CLI audit action types (Story 23-6)', () => {
    describe('AuditAction enum values', () => {
      it('should have RAILWAY_CLI_EXECUTED enum value', () => {
        expect(AuditAction.RAILWAY_CLI_EXECUTED).toBe('railway_cli_executed');
      });

      it('should have RAILWAY_SERVICE_PROVISIONED enum value', () => {
        expect(AuditAction.RAILWAY_SERVICE_PROVISIONED).toBe('railway_service_provisioned');
      });

      it('should have RAILWAY_SERVICE_DEPLOYED enum value', () => {
        expect(AuditAction.RAILWAY_SERVICE_DEPLOYED).toBe('railway_service_deployed');
      });

      it('should have RAILWAY_BULK_DEPLOY_STARTED enum value', () => {
        expect(AuditAction.RAILWAY_BULK_DEPLOY_STARTED).toBe('railway_bulk_deploy_started');
      });

      it('should have RAILWAY_BULK_DEPLOY_COMPLETED enum value', () => {
        expect(AuditAction.RAILWAY_BULK_DEPLOY_COMPLETED).toBe('railway_bulk_deploy_completed');
      });

      it('should have RAILWAY_ENV_VAR_SET enum value', () => {
        expect(AuditAction.RAILWAY_ENV_VAR_SET).toBe('railway_env_var_set');
      });

      it('should have RAILWAY_ENV_VAR_DELETED enum value', () => {
        expect(AuditAction.RAILWAY_ENV_VAR_DELETED).toBe('railway_env_var_deleted');
      });

      it('should have RAILWAY_DOMAIN_ADDED enum value', () => {
        expect(AuditAction.RAILWAY_DOMAIN_ADDED).toBe('railway_domain_added');
      });

      it('should have RAILWAY_DOMAIN_REMOVED enum value', () => {
        expect(AuditAction.RAILWAY_DOMAIN_REMOVED).toBe('railway_domain_removed');
      });

      it('should have RAILWAY_DEPLOYMENT_ROLLED_BACK enum value', () => {
        expect(AuditAction.RAILWAY_DEPLOYMENT_ROLLED_BACK).toBe('railway_deployment_rolled_back');
      });

      it('should have all 10 Railway audit actions as valid AuditAction enum members', () => {
        const railwayActions = [
          AuditAction.RAILWAY_CLI_EXECUTED,
          AuditAction.RAILWAY_SERVICE_PROVISIONED,
          AuditAction.RAILWAY_SERVICE_DEPLOYED,
          AuditAction.RAILWAY_BULK_DEPLOY_STARTED,
          AuditAction.RAILWAY_BULK_DEPLOY_COMPLETED,
          AuditAction.RAILWAY_ENV_VAR_SET,
          AuditAction.RAILWAY_ENV_VAR_DELETED,
          AuditAction.RAILWAY_DOMAIN_ADDED,
          AuditAction.RAILWAY_DOMAIN_REMOVED,
          AuditAction.RAILWAY_DEPLOYMENT_ROLLED_BACK,
        ];

        for (const action of railwayActions) {
          expect(action).toBeDefined();
          expect(typeof action).toBe('string');
          expect(action.length).toBeGreaterThan(0);
        }
      });
    });

    describe('RAILWAY_AUDIT_ACTIONS constant', () => {
      it('should contain exactly 10 Railway audit actions', () => {
        expect(RAILWAY_AUDIT_ACTIONS).toHaveLength(10);
      });

      it('should contain RAILWAY_CLI_EXECUTED', () => {
        expect(RAILWAY_AUDIT_ACTIONS).toContain(AuditAction.RAILWAY_CLI_EXECUTED);
      });

      it('should contain RAILWAY_SERVICE_PROVISIONED', () => {
        expect(RAILWAY_AUDIT_ACTIONS).toContain(AuditAction.RAILWAY_SERVICE_PROVISIONED);
      });

      it('should contain RAILWAY_SERVICE_DEPLOYED', () => {
        expect(RAILWAY_AUDIT_ACTIONS).toContain(AuditAction.RAILWAY_SERVICE_DEPLOYED);
      });

      it('should contain RAILWAY_BULK_DEPLOY_STARTED', () => {
        expect(RAILWAY_AUDIT_ACTIONS).toContain(AuditAction.RAILWAY_BULK_DEPLOY_STARTED);
      });

      it('should contain RAILWAY_BULK_DEPLOY_COMPLETED', () => {
        expect(RAILWAY_AUDIT_ACTIONS).toContain(AuditAction.RAILWAY_BULK_DEPLOY_COMPLETED);
      });

      it('should contain RAILWAY_ENV_VAR_SET', () => {
        expect(RAILWAY_AUDIT_ACTIONS).toContain(AuditAction.RAILWAY_ENV_VAR_SET);
      });

      it('should contain RAILWAY_ENV_VAR_DELETED', () => {
        expect(RAILWAY_AUDIT_ACTIONS).toContain(AuditAction.RAILWAY_ENV_VAR_DELETED);
      });

      it('should contain RAILWAY_DOMAIN_ADDED', () => {
        expect(RAILWAY_AUDIT_ACTIONS).toContain(AuditAction.RAILWAY_DOMAIN_ADDED);
      });

      it('should contain RAILWAY_DOMAIN_REMOVED', () => {
        expect(RAILWAY_AUDIT_ACTIONS).toContain(AuditAction.RAILWAY_DOMAIN_REMOVED);
      });

      it('should contain RAILWAY_DEPLOYMENT_ROLLED_BACK', () => {
        expect(RAILWAY_AUDIT_ACTIONS).toContain(AuditAction.RAILWAY_DEPLOYMENT_ROLLED_BACK);
      });

      it('should NOT contain any BYOK audit actions', () => {
        for (const byokAction of BYOK_AUDIT_ACTIONS) {
          expect(RAILWAY_AUDIT_ACTIONS).not.toContain(byokAction);
        }
      });
    });

    describe('sanitizeRailwayAuditPayload', () => {
      it('should strip token values from payload', () => {
        const payload = {
          command: 'up',
          serviceId: 'svc-123',
          token: 'sk_abc123_secret_token',
          exitCode: 0,
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        expect(sanitized).not.toHaveProperty('token');
        expect(sanitized.command).toBe('up');
        expect(sanitized.serviceId).toBe('svc-123');
        expect(sanitized.exitCode).toBe(0);
      });

      it('should strip tokenValue from payload', () => {
        const payload = {
          command: 'whoami',
          tokenValue: 'railway_token_value_secret',
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        expect(sanitized).not.toHaveProperty('tokenValue');
        expect(sanitized.command).toBe('whoami');
      });

      it('should strip railwayToken from payload', () => {
        const payload = {
          command: 'status',
          railwayToken: 'some-secret-token',
          serviceId: 'svc-1',
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        expect(sanitized).not.toHaveProperty('railwayToken');
        expect(sanitized.command).toBe('status');
      });

      it('should strip envVarValue from payload', () => {
        const payload = {
          variableNames: ['DATABASE_URL', 'SECRET_KEY'],
          envVarValue: 'postgresql://user:pass@host:5432/db',
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        expect(sanitized).not.toHaveProperty('envVarValue');
        expect(sanitized.variableNames).toEqual(['DATABASE_URL', 'SECRET_KEY']);
      });

      it('should strip connectionString from payload', () => {
        const payload = {
          serviceName: 'postgres-db',
          connectionString: 'postgresql://admin:secret@db.railway.internal:5432/app',
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        expect(sanitized).not.toHaveProperty('connectionString');
        expect(sanitized.serviceName).toBe('postgres-db');
      });

      it('should strip output (stdout) from payload', () => {
        const payload = {
          command: 'variable list',
          exitCode: 0,
          output: 'DATABASE_URL=postgresql://user:pass@host/db\nSECRET=myvalue',
          durationMs: 1200,
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        expect(sanitized).not.toHaveProperty('output');
        expect(sanitized.command).toBe('variable list');
        expect(sanitized.exitCode).toBe(0);
        expect(sanitized.durationMs).toBe(1200);
      });

      it('should strip stderr from payload', () => {
        const payload = {
          command: 'up',
          stderr: 'Error: invalid token RAILWAY_TOKEN=sk_abc123',
          exitCode: 1,
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        expect(sanitized).not.toHaveProperty('stderr');
        expect(sanitized.command).toBe('up');
        expect(sanitized.exitCode).toBe(1);
      });

      it('should strip stdout from payload', () => {
        const payload = {
          command: 'logs',
          stdout: 'Some log output with sensitive data',
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        expect(sanitized).not.toHaveProperty('stdout');
      });

      it('should strip variables object containing values from payload', () => {
        const payload = {
          variableNames: ['DB_HOST', 'API_KEY'],
          variables: { DB_HOST: 'secret-host.com', API_KEY: 'sk-123' },
          serviceId: 'svc-1',
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        expect(sanitized).not.toHaveProperty('variables');
        expect(sanitized.variableNames).toEqual(['DB_HOST', 'API_KEY']);
        expect(sanitized.serviceId).toBe('svc-1');
      });

      it('should preserve safe fields in RAILWAY_CLI_EXECUTED payload', () => {
        const payload = {
          command: 'up',
          serviceTarget: 'api',
          exitCode: 0,
          durationMs: 45230,
          workspaceId: 'ws-123',
          projectId: 'proj-456',
          environment: 'production',
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        expect(sanitized.command).toBe('up');
        expect(sanitized.serviceTarget).toBe('api');
        expect(sanitized.exitCode).toBe(0);
        expect(sanitized.durationMs).toBe(45230);
        expect(sanitized.workspaceId).toBe('ws-123');
        expect(sanitized.projectId).toBe('proj-456');
        expect(sanitized.environment).toBe('production');
      });

      it('should preserve safe fields in RAILWAY_ENV_VAR_SET payload', () => {
        const payload = {
          variableNames: ['DATABASE_URL', 'REDIS_URL'],
          serviceId: 'svc-123',
          environment: 'production',
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        expect(sanitized.variableNames).toEqual(['DATABASE_URL', 'REDIS_URL']);
        expect(sanitized.serviceId).toBe('svc-123');
        expect(sanitized.environment).toBe('production');
      });

      it('should handle empty payload gracefully', () => {
        const sanitized = sanitizeRailwayAuditPayload({});
        expect(sanitized).toEqual({});
      });

      it('should handle undefined payload gracefully', () => {
        const sanitized = sanitizeRailwayAuditPayload(undefined as any);
        expect(sanitized).toEqual({});
      });

      it('should handle null payload gracefully', () => {
        const sanitized = sanitizeRailwayAuditPayload(null as any);
        expect(sanitized).toEqual({});
      });

      it('should strip multiple sensitive fields simultaneously', () => {
        const payload = {
          command: 'variable set',
          token: 'secret-token',
          railwayToken: 'another-secret',
          output: 'secret output',
          stderr: 'secret error',
          connectionString: 'redis://pass@host:6379',
          envVarValue: 'my-secret-value',
          variables: { KEY: 'VALUE' },
          stdout: 'more secret output',
          tokenValue: 'yet-another-secret',
          serviceId: 'svc-1',
          exitCode: 0,
          variableNames: ['KEY'],
        };

        const sanitized = sanitizeRailwayAuditPayload(payload);

        // All sensitive fields stripped
        expect(sanitized).not.toHaveProperty('token');
        expect(sanitized).not.toHaveProperty('railwayToken');
        expect(sanitized).not.toHaveProperty('output');
        expect(sanitized).not.toHaveProperty('stderr');
        expect(sanitized).not.toHaveProperty('connectionString');
        expect(sanitized).not.toHaveProperty('envVarValue');
        expect(sanitized).not.toHaveProperty('variables');
        expect(sanitized).not.toHaveProperty('stdout');
        expect(sanitized).not.toHaveProperty('tokenValue');

        // Safe fields preserved
        expect(sanitized.command).toBe('variable set');
        expect(sanitized.serviceId).toBe('svc-1');
        expect(sanitized.exitCode).toBe(0);
        expect(sanitized.variableNames).toEqual(['KEY']);
      });

      it('should not mutate the original payload object', () => {
        const original = {
          command: 'up',
          token: 'secret',
          serviceId: 'svc-1',
        };

        const originalCopy = { ...original };
        sanitizeRailwayAuditPayload(original);

        expect(original).toEqual(originalCopy);
      });
    });

    describe('Railway audit actions with AuditService.log()', () => {
      it('should log RAILWAY_CLI_EXECUTED audit event', async () => {
        const mockLog = {
          id: '1',
          workspaceId: 'ws-1',
          userId: 'user-1',
          action: AuditAction.RAILWAY_CLI_EXECUTED,
          resourceType: 'railway_cli',
          resourceId: 'cmd-1',
          metadata: { command: 'up', exitCode: 0, durationMs: 5000 },
        };

        mockRepository.create.mockReturnValue(mockLog);
        mockRepository.save.mockResolvedValue(mockLog);

        await service.log(
          'ws-1',
          'user-1',
          AuditAction.RAILWAY_CLI_EXECUTED,
          'railway_cli',
          'cmd-1',
          { command: 'up', exitCode: 0, durationMs: 5000 },
        );

        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'railway_cli_executed',
            resourceType: 'railway_cli',
          }),
        );
        expect(mockRepository.save).toHaveBeenCalled();
      });

      it('should log RAILWAY_SERVICE_PROVISIONED audit event', async () => {
        const mockLog = {
          id: '2',
          workspaceId: 'ws-1',
          userId: 'devops-agent',
          action: AuditAction.RAILWAY_SERVICE_PROVISIONED,
          resourceType: 'railway_service',
          resourceId: 'svc-1',
          metadata: { serviceName: 'postgres-db', serviceType: 'database' },
        };

        mockRepository.create.mockReturnValue(mockLog);
        mockRepository.save.mockResolvedValue(mockLog);

        await service.log(
          'ws-1',
          'devops-agent',
          AuditAction.RAILWAY_SERVICE_PROVISIONED,
          'railway_service',
          'svc-1',
          { serviceName: 'postgres-db', serviceType: 'database' },
        );

        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'railway_service_provisioned',
            userId: 'devops-agent',
          }),
        );
        expect(mockRepository.save).toHaveBeenCalled();
      });

      it('should log RAILWAY_SERVICE_DEPLOYED audit event', async () => {
        mockRepository.create.mockReturnValue({});
        mockRepository.save.mockResolvedValue({});

        await service.log(
          'ws-1',
          'user-1',
          AuditAction.RAILWAY_SERVICE_DEPLOYED,
          'railway_service',
          'svc-1',
          { serviceId: 'svc-1', environment: 'production', triggerType: 'manual' },
        );

        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'railway_service_deployed',
          }),
        );
      });

      it('should log RAILWAY_BULK_DEPLOY_STARTED audit event', async () => {
        mockRepository.create.mockReturnValue({});
        mockRepository.save.mockResolvedValue({});

        await service.log(
          'ws-1',
          'user-1',
          AuditAction.RAILWAY_BULK_DEPLOY_STARTED,
          'railway_project',
          'proj-1',
          { serviceCount: 5, environment: 'production' },
        );

        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'railway_bulk_deploy_started',
          }),
        );
      });

      it('should log RAILWAY_BULK_DEPLOY_COMPLETED audit event', async () => {
        mockRepository.create.mockReturnValue({});
        mockRepository.save.mockResolvedValue({});

        await service.log(
          'ws-1',
          'user-1',
          AuditAction.RAILWAY_BULK_DEPLOY_COMPLETED,
          'railway_project',
          'proj-1',
          { status: 'success', serviceCount: 5, durationMs: 120000 },
        );

        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'railway_bulk_deploy_completed',
          }),
        );
      });

      it('should log RAILWAY_ENV_VAR_SET with variable names but NEVER values', async () => {
        const safeMetadata = sanitizeRailwayAuditPayload({
          variableNames: ['DATABASE_URL', 'SECRET_KEY'],
          variables: { DATABASE_URL: 'postgresql://secret', SECRET_KEY: 'abc123' },
          serviceId: 'svc-1',
        });

        mockRepository.create.mockReturnValue({});
        mockRepository.save.mockResolvedValue({});

        await service.log(
          'ws-1',
          'user-1',
          AuditAction.RAILWAY_ENV_VAR_SET,
          'railway_service',
          'svc-1',
          safeMetadata,
        );

        const createCall = mockRepository.create.mock.calls[0][0];

        // CRITICAL: Verify values are NOT in the metadata
        const metadataStr = JSON.stringify(createCall.metadata);
        expect(metadataStr).not.toContain('postgresql://secret');
        expect(metadataStr).not.toContain('abc123');

        // Verify names ARE in the metadata
        expect(createCall.metadata.variableNames).toEqual(['DATABASE_URL', 'SECRET_KEY']);
      });

      it('should log RAILWAY_ENV_VAR_DELETED audit event', async () => {
        mockRepository.create.mockReturnValue({});
        mockRepository.save.mockResolvedValue({});

        await service.log(
          'ws-1',
          'user-1',
          AuditAction.RAILWAY_ENV_VAR_DELETED,
          'railway_service',
          'svc-1',
          { variableName: 'OLD_KEY', serviceId: 'svc-1' },
        );

        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'railway_env_var_deleted',
          }),
        );
      });

      it('should log RAILWAY_DOMAIN_ADDED audit event', async () => {
        mockRepository.create.mockReturnValue({});
        mockRepository.save.mockResolvedValue({});

        await service.log(
          'ws-1',
          'user-1',
          AuditAction.RAILWAY_DOMAIN_ADDED,
          'railway_service',
          'svc-1',
          { domain: 'api.myapp.com', serviceId: 'svc-1' },
        );

        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'railway_domain_added',
          }),
        );
      });

      it('should log RAILWAY_DOMAIN_REMOVED audit event', async () => {
        mockRepository.create.mockReturnValue({});
        mockRepository.save.mockResolvedValue({});

        await service.log(
          'ws-1',
          'user-1',
          AuditAction.RAILWAY_DOMAIN_REMOVED,
          'railway_service',
          'svc-1',
          { domain: 'old-api.myapp.com', serviceId: 'svc-1' },
        );

        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'railway_domain_removed',
          }),
        );
      });

      it('should log RAILWAY_DEPLOYMENT_ROLLED_BACK audit event', async () => {
        mockRepository.create.mockReturnValue({});
        mockRepository.save.mockResolvedValue({});

        await service.log(
          'ws-1',
          'user-1',
          AuditAction.RAILWAY_DEPLOYMENT_ROLLED_BACK,
          'railway_deployment',
          'deploy-1',
          { serviceId: 'svc-1', targetDeploymentId: 'prev-deploy-1' },
        );

        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'railway_deployment_rolled_back',
          }),
        );
      });

      it('should log RAILWAY_CLI_EXECUTED without token or output in payload', async () => {
        const safeMetadata = sanitizeRailwayAuditPayload({
          command: 'up',
          serviceTarget: 'api',
          exitCode: 0,
          durationMs: 45230,
          token: 'sk_abc123_secret',
          output: 'Deployed to https://api.up.railway.app\nWith token RAILWAY_TOKEN=secret',
          stderr: '',
          railwayToken: 'another_secret',
        });

        mockRepository.create.mockReturnValue({});
        mockRepository.save.mockResolvedValue({});

        await service.log(
          'ws-1',
          'user-1',
          AuditAction.RAILWAY_CLI_EXECUTED,
          'railway_cli',
          'cmd-1',
          safeMetadata,
        );

        const createCall = mockRepository.create.mock.calls[0][0];
        const metadataStr = JSON.stringify(createCall.metadata);

        // CRITICAL: No token-like strings in the log
        expect(metadataStr).not.toContain('sk_abc123_secret');
        expect(metadataStr).not.toContain('another_secret');
        expect(metadataStr).not.toContain('RAILWAY_TOKEN=secret');
        expect(metadataStr).not.toContain('Deployed to');

        // Safe fields preserved
        expect(createCall.metadata.command).toBe('up');
        expect(createCall.metadata.serviceTarget).toBe('api');
        expect(createCall.metadata.exitCode).toBe(0);
        expect(createCall.metadata.durationMs).toBe(45230);
      });
    });

    describe('Backward compatibility', () => {
      it('should not break existing BYOK_AUDIT_ACTIONS after adding Railway actions', () => {
        expect(BYOK_AUDIT_ACTIONS).toHaveLength(6);
        expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_CREATED);
        expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_DELETED);
        expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_ACCESSED);
        expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_UPDATED);
        expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_USED);
        expect(BYOK_AUDIT_ACTIONS).toContain(AuditAction.BYOK_KEY_VALIDATION_FAILED);
      });

      it('should not break existing audit action enum values', () => {
        expect(AuditAction.PROJECT_CREATED).toBe('project_created');
        expect(AuditAction.DEPLOYMENT_TRIGGERED).toBe('deployment_triggered');
        expect(AuditAction.WORKSPACE_SETTINGS_UPDATED).toBe('workspace_settings_updated');
        expect(AuditAction.FILE_UPLOADED).toBe('file.uploaded');
        expect(AuditAction.SESSION_ARCHIVED).toBe('session.archived');
      });

      it('should still log existing action types correctly after adding Railway actions', async () => {
        const mockLog = {
          id: '99',
          workspaceId: 'ws-1',
          userId: 'user-1',
          action: AuditAction.PROJECT_CREATED,
          resourceType: 'project',
          resourceId: 'proj-1',
          metadata: {},
        };

        mockRepository.create.mockReturnValue(mockLog);
        mockRepository.save.mockResolvedValue(mockLog);

        await service.log(
          'ws-1',
          'user-1',
          AuditAction.PROJECT_CREATED,
          'project',
          'proj-1',
        );

        expect(mockRepository.save).toHaveBeenCalled();
      });

      it('should filter by Railway audit actions in getWorkspaceLogsWithFilters', async () => {
        const mockQueryBuilder = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        };

        mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        const filters: AuditLogFilters = {
          actions: RAILWAY_AUDIT_ACTIONS,
        };

        await service.getWorkspaceLogsWithFilters('ws-1', filters, 100, 0);

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'audit.action IN (:...actions)',
          { actions: RAILWAY_AUDIT_ACTIONS },
        );
      });
    });
  });
});
