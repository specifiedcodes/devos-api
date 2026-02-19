/**
 * StripeConnectService Unit Tests
 *
 * Story 18-9: Agent Revenue Sharing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StripeConnectService } from '../services/stripe-connect.service';
import { CreatorPayoutAccount } from '../../../database/entities/creator-payout-account.entity';

describe('StripeConnectService', () => {
  let service: StripeConnectService;
  let configService: jest.Mocked<ConfigService>;
  let payoutAccountRepo: jest.Mocked<Repository<CreatorPayoutAccount>>;
  let mockStripe: jest.Mock;

  const mockUserId = 'user-uuid-123';
  const mockEmail = 'creator@example.com';
  const mockStripeAccountId = 'acct_test_123';

  beforeEach(async () => {
    // Create mock Stripe constructor that returns mock instance
    mockStripe = jest.fn().mockImplementation(() => ({
      accounts: {
        create: jest.fn(),
        retrieve: jest.fn(),
        createLoginLink: jest.fn(),
      },
      accountLinks: {
        create: jest.fn(),
      },
    }));

    configService = {
      get: jest.fn().mockReturnValue('sk_test_mock_key'),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeConnectService,
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: getRepositoryToken(CreatorPayoutAccount),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StripeConnectService>(StripeConnectService);
    payoutAccountRepo = module.get(getRepositoryToken(CreatorPayoutAccount));

    // Override stripe instance with mock
    (service as any).stripe = mockStripe();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createConnectAccount', () => {
    it('should create a new Stripe Connect account for a user', async () => {
      const stripeInstance = (service as any).stripe;
      stripeInstance.accounts.create.mockResolvedValue({
        id: mockStripeAccountId,
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
        country: 'US',
        default_currency: 'USD',
      });

      payoutAccountRepo.findOne.mockResolvedValue(null);
      payoutAccountRepo.create.mockReturnValue({
        userId: mockUserId,
        stripeAccountId: mockStripeAccountId,
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        country: 'US',
        defaultCurrency: 'USD',
      } as CreatorPayoutAccount);
      payoutAccountRepo.save.mockResolvedValue({} as CreatorPayoutAccount);

      const result = await service.createConnectAccount(mockUserId, mockEmail);

      expect(stripeInstance.accounts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'express',
          email: mockEmail,
          country: 'US',
          metadata: { devos_user_id: mockUserId },
        }),
      );
      expect(result.stripeAccountId).toBe(mockStripeAccountId);
      expect(result.onboardingComplete).toBe(false);
    });

    it('should return existing account if user already has one', async () => {
      const stripeInstance = (service as any).stripe;
      const existingAccount = {
        userId: mockUserId,
        stripeAccountId: mockStripeAccountId,
        onboardingComplete: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        country: 'US',
        defaultCurrency: 'USD',
      } as CreatorPayoutAccount;

      payoutAccountRepo.findOne.mockResolvedValue(existingAccount);
      stripeInstance.accounts.retrieve.mockResolvedValue({
        id: mockStripeAccountId,
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: true,
        country: 'US',
        default_currency: 'USD',
      });

      const result = await service.createConnectAccount(mockUserId, mockEmail);

      expect(stripeInstance.accounts.create).not.toHaveBeenCalled();
      expect(result.stripeAccountId).toBe(mockStripeAccountId);
    });
  });

  describe('createOnboardingLink', () => {
    it('should create an onboarding link', async () => {
      const stripeInstance = (service as any).stripe;
      payoutAccountRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        stripeAccountId: mockStripeAccountId,
      } as CreatorPayoutAccount);

      stripeInstance.accountLinks.create.mockResolvedValue({
        url: 'https://connect.stripe.com/setup/test',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });

      const result = await service.createOnboardingLink(
        mockUserId,
        'https://example.com/refresh',
        'https://example.com/return',
      );

      expect(stripeInstance.accountLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          account: mockStripeAccountId,
          type: 'account_onboarding',
        }),
      );
      expect(result.url).toBe('https://connect.stripe.com/setup/test');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException if no payout account exists', async () => {
      payoutAccountRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createOnboardingLink(mockUserId, 'https://example.com/refresh', 'https://example.com/return'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAccountStatus', () => {
    it('should retrieve account status from Stripe', async () => {
      const stripeInstance = (service as any).stripe;
      stripeInstance.accounts.retrieve.mockResolvedValue({
        id: mockStripeAccountId,
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: true,
        country: 'US',
        default_currency: 'USD',
      });

      const result = await service.getAccountStatus(mockStripeAccountId);

      expect(stripeInstance.accounts.retrieve).toHaveBeenCalledWith(mockStripeAccountId);
      expect(result.onboardingComplete).toBe(true);
      expect(result.chargesEnabled).toBe(true);
      expect(result.payoutsEnabled).toBe(true);
    });
  });

  describe('createLoginLink', () => {
    it('should create a login link for the user', async () => {
      const stripeInstance = (service as any).stripe;
      payoutAccountRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        stripeAccountId: mockStripeAccountId,
      } as CreatorPayoutAccount);

      stripeInstance.accounts.createLoginLink.mockResolvedValue({
        url: 'https://dashboard.stripe.com/test',
      });

      const result = await service.createLoginLink(mockUserId);

      expect(stripeInstance.accounts.createLoginLink).toHaveBeenCalledWith(mockStripeAccountId);
      expect(result.url).toBe('https://dashboard.stripe.com/test');
    });

    it('should throw NotFoundException if no payout account exists', async () => {
      payoutAccountRepo.findOne.mockResolvedValue(null);

      await expect(service.createLoginLink(mockUserId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPayoutAccount', () => {
    it('should return the payout account for a user', async () => {
      const mockAccount = {
        id: 'payout-account-id',
        userId: mockUserId,
        stripeAccountId: mockStripeAccountId,
      } as CreatorPayoutAccount;

      payoutAccountRepo.findOne.mockResolvedValue(mockAccount);

      const result = await service.getPayoutAccount(mockUserId);

      expect(result).toEqual(mockAccount);
    });

    it('should return null if no payout account exists', async () => {
      payoutAccountRepo.findOne.mockResolvedValue(null);

      const result = await service.getPayoutAccount(mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('isConfigured', () => {
    it('should return true when Stripe is configured', () => {
      configService.get.mockReturnValue('sk_test_real_key');
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when Stripe is not configured', () => {
      configService.get.mockReturnValue(null);
      expect(service.isConfigured()).toBe(false);
    });
  });
});
