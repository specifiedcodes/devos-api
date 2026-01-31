import {
  NotFoundException,
  GoneException,
  ForbiddenException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

export class SharedLinkNotFoundException extends NotFoundException {
  constructor(token?: string) {
    super(
      token
        ? `Shared link with token '${token}' not found`
        : 'Shared link not found',
    );
  }
}

export class SharedLinkExpiredException extends GoneException {
  constructor(token?: string) {
    super(
      token
        ? `Shared link '${token}' has expired`
        : 'This link has expired',
    );
  }
}

export class SharedLinkRevokedException extends ForbiddenException {
  constructor(token?: string) {
    super(
      token
        ? `Shared link '${token}' has been revoked`
        : 'This link has been revoked',
    );
  }
}

export class InvalidPasswordException extends UnauthorizedException {
  constructor() {
    super('Incorrect password');
  }
}

export class TooManyPasswordAttemptsException extends HttpException {
  constructor() {
    super(
      'Too many password attempts. Please try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class SharedLinkUnauthorizedException extends UnauthorizedException {
  constructor(message: string = 'Unauthorized to manage this shared link') {
    super(message);
  }
}
