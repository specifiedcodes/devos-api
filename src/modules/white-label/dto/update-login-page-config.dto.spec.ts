import { validate } from 'class-validator';
import { UpdateLoginPageConfigDto } from './update-login-page-config.dto';
import { BackgroundType } from '../../../database/entities/white-label-config.entity';
import { CustomLinkDto } from './custom-link.dto';

describe('UpdateLoginPageConfigDto', () => {
  describe('backgroundType validation', () => {
    it('should validate backgroundType enum', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.backgroundType = BackgroundType.COLOR;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept gradient type', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.backgroundType = BackgroundType.GRADIENT;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept image type', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.backgroundType = BackgroundType.IMAGE;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail for invalid backgroundType', async () => {
      const dto = new UpdateLoginPageConfigDto();
      (dto as any).backgroundType = 'invalid';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('backgroundType');
      expect(errors[0].constraints).toHaveProperty('isEnum');
    });
  });

  describe('heroText validation', () => {
    it('should validate heroText max length', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.heroText = 'a'.repeat(255);

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail for heroText longer than 255 characters', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.heroText = 'a'.repeat(256);

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('heroText');
      expect(errors[0].constraints).toHaveProperty('maxLength');
    });

    it('should validate heroText special chars', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.heroText = '<script>alert("xss")</script>';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('heroText');
      expect(errors[0].constraints).toHaveProperty('matches');
    });

    it('should accept null for heroText', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.heroText = null;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('heroSubtext validation', () => {
    it('should validate heroSubtext max length', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.heroSubtext = 'a'.repeat(500);

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail for heroSubtext longer than 500 characters', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.heroSubtext = 'a'.repeat(501);

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('heroSubtext');
      expect(errors[0].constraints).toHaveProperty('maxLength');
    });

    it('should validate heroSubtext special chars', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.heroSubtext = '<div>test</div>';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('heroSubtext');
      expect(errors[0].constraints).toHaveProperty('matches');
    });

    it('should accept null for heroSubtext', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.heroSubtext = null;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('customLinks validation', () => {
    it('should validate customLinks array', async () => {
      const dto = new UpdateLoginPageConfigDto();
      const link = new CustomLinkDto();
      link.text = 'Privacy Policy';
      link.url = 'https://example.com/privacy';
      dto.customLinks = [link];

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate max 10 custom links', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.customLinks = Array(11).fill(null).map((_, i) => {
        const link = new CustomLinkDto();
        link.text = `Link ${i}`;
        link.url = `https://example.com/${i}`;
        return link;
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('customLinks');
      expect(errors[0].constraints).toHaveProperty('arrayMaxSize');
    });

    it('should accept exactly 10 custom links', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.customLinks = Array(10).fill(null).map((_, i) => {
        const link = new CustomLinkDto();
        link.text = `Link ${i}`;
        link.url = `https://example.com/${i}`;
        return link;
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate each link in array', async () => {
      const dto = new UpdateLoginPageConfigDto();
      const invalidLink = new CustomLinkDto();
      invalidLink.text = '<script>XSS</script>';
      invalidLink.url = 'invalid-url';
      dto.customLinks = [invalidLink];

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('optional fields', () => {
    it('should allow all fields optional', async () => {
      const dto = new UpdateLoginPageConfigDto();

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept showDevosBranding boolean', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.showDevosBranding = true;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept showSignup boolean', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.showSignup = true;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('loginPageCss validation', () => {
    it('should validate loginPageCss max length', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.loginPageCss = 'a'.repeat(10000);

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail for loginPageCss longer than 10000 characters', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.loginPageCss = 'a'.repeat(10001);

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('loginPageCss');
      expect(errors[0].constraints).toHaveProperty('maxLength');
    });

    it('should accept null for loginPageCss', async () => {
      const dto = new UpdateLoginPageConfigDto();
      dto.loginPageCss = null;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
