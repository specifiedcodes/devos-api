import { BackgroundType } from '../../../database/entities/white-label-config.entity';
import { WhiteLabelConfig } from '../../../database/entities/white-label-config.entity';

export class LoginPageConfigResponseDto {
  appName!: string;
  logoUrl!: string | null;
  logoDarkUrl!: string | null;
  primaryColor!: string;
  secondaryColor!: string;
  fontFamily!: string;
  showDevosBranding!: boolean;
  backgroundType!: BackgroundType;
  backgroundValue!: string;
  heroText!: string | null;
  heroSubtext!: string | null;
  customLinks!: Array<{ text: string; url: string }>;
  showSignup!: boolean;
  loginPageCss!: string | null;
  ssoProviders!: string[];

  static fromEntity(entity: WhiteLabelConfig, ssoProviders: string[]): LoginPageConfigResponseDto {
    const dto = new LoginPageConfigResponseDto();
    dto.appName = entity.appName;
    dto.logoUrl = entity.logoUrl || null;
    dto.logoDarkUrl = entity.logoDarkUrl || null;
    dto.primaryColor = entity.primaryColor;
    dto.secondaryColor = entity.secondaryColor;
    dto.fontFamily = entity.fontFamily;
    dto.showDevosBranding = entity.showDevosBranding;
    dto.backgroundType = entity.backgroundType;
    dto.backgroundValue = entity.backgroundValue;
    dto.heroText = entity.heroText || null;
    dto.heroSubtext = entity.heroSubtext || null;
    dto.customLinks = entity.customLinks || [];
    dto.showSignup = entity.showSignup;
    dto.loginPageCss = entity.loginPageCss || null;
    dto.ssoProviders = ssoProviders;
    return dto;
  }
}
