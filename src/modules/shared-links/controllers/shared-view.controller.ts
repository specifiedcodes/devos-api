import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  BadRequestException,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { SharedLinksService } from '../services/shared-links.service';
import { ValidatePasswordDto } from '../dto/validate-password.dto';
import { SharedProjectViewDto } from '../dto/shared-project-view.dto';
import { InvalidPasswordException } from '../exceptions/shared-link.exceptions';
import { plainToInstance } from 'class-transformer';

@Controller('share')
@ApiTags('shared-view')
export class SharedViewController {
  constructor(private readonly sharedLinksService: SharedLinksService) {}

  /**
   * View a shared project (public endpoint, no authentication required)
   *
   * @param token - URL-safe token from the shared link
   * @param req - Request object for session management
   * @returns Sanitized project view with only public information
   * @throws SharedLinkNotFoundException if token is invalid
   * @throws SharedLinkExpiredException if link has expired
   * @throws SharedLinkRevokedException if link has been revoked
   * @throws InvalidPasswordException if password is required but not provided
   */
  @Get(':token')
  @ApiOperation({
    summary: 'View a shared project (public endpoint)',
    description:
      'Access a project via shareable link. No authentication required. ' +
      'Password-protected links require prior password validation.',
  })
  @ApiParam({
    name: 'token',
    description: 'URL-safe token from the shared link',
  })
  @ApiResponse({
    status: 200,
    type: SharedProjectViewDto,
    description: 'Project view with public information',
  })
  @ApiResponse({ status: 401, description: 'Password required' })
  @ApiResponse({ status: 403, description: 'Link has been revoked' })
  @ApiResponse({ status: 404, description: 'Link not found' })
  @ApiResponse({ status: 410, description: 'Link has expired' })
  async viewSharedProject(
    @Param('token') token: string,
    @Req() req: any,
  ): Promise<SharedProjectViewDto> {
    // Find and validate the shared link
    const sharedLink = await this.sharedLinksService.findByToken(token);

    // Check if link is password protected
    if (sharedLink.passwordHash) {
      // Check if user has validated password in session
      const sessionKey = `shared_link_${token}`;
      if (!req.session || !req.session[sessionKey]) {
        throw new InvalidPasswordException();
      }
    }

    // Increment view count
    await this.sharedLinksService.incrementViewCount(sharedLink.id);

    // Return sanitized project view
    return this.toProjectViewDto(sharedLink.project);
  }

  /**
   * Validate password for a password-protected shared link
   *
   * @param token - URL-safe token from the shared link
   * @param validateDto - Password to validate
   * @param req - Request object for session management
   * @returns Success status
   * @throws SharedLinkNotFoundException if token is invalid
   * @throws InvalidPasswordException if password is incorrect
   * @throws BadRequestException if link is not password protected
   *
   * Rate limited to 5 attempts per 15 minutes per IP to prevent brute force
   */
  @Post(':token/validate-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: parseInt(process.env.SHARED_LINK_PASSWORD_RATE_LIMIT || '5', 10),
      ttl: parseInt(process.env.SHARED_LINK_PASSWORD_RATE_WINDOW || '900', 10) * 1000,
    },
  })
  @ApiOperation({
    summary: 'Validate password for password-protected link',
    description:
      'Validate password for a shared link. On success, sets a session cookie ' +
      'that allows viewing the project for 30 minutes. ' +
      'Rate limited to 5 attempts per 15 minutes per IP.',
  })
  @ApiParam({
    name: 'token',
    description: 'URL-safe token from the shared link',
  })
  @ApiResponse({
    status: 200,
    description: 'Password validated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Password validated successfully' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Incorrect password' })
  @ApiResponse({ status: 404, description: 'Link not found' })
  @ApiResponse({
    status: 429,
    description: 'Too many password attempts. Please try again later.',
  })
  async validatePassword(
    @Param('token') token: string,
    @Body() validateDto: ValidatePasswordDto,
    @Req() req: any,
  ): Promise<{ success: boolean; message: string }> {
    // Find the shared link
    const sharedLink = await this.sharedLinksService.findByToken(token);

    // Check if link is password protected
    if (!sharedLink.passwordHash) {
      throw new BadRequestException('This link is not password protected');
    }

    // Validate password
    const isValid = await this.sharedLinksService.validatePassword(
      validateDto.password,
      sharedLink.passwordHash,
    );

    if (!isValid) {
      throw new InvalidPasswordException();
    }

    // Set session to remember password validation
    // Session expires after 30 minutes (configured in app)
    if (!req.session) {
      req.session = {};
    }
    const sessionKey = `shared_link_${token}`;
    req.session[sessionKey] = true;

    return {
      success: true,
      message: 'Password validated successfully',
    };
  }

  /**
   * Transform project entity to sanitized public view DTO
   * Only includes whitelisted fields, never exposes sensitive data
   */
  private toProjectViewDto(project: any): SharedProjectViewDto {
    const dto = plainToInstance(
      SharedProjectViewDto,
      {
        id: project.id,
        name: project.name,
        description: project.description,
        deploymentUrl: project.deploymentUrl,
        status: project.status,
        updatedAt: project.updatedAt,
        poweredBy: 'Powered by DevOS',
      },
      { excludeExtraneousValues: true },
    );

    return dto;
  }
}
