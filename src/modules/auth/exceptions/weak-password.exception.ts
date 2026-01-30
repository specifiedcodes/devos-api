import { BadRequestException } from '@nestjs/common';

export class WeakPasswordException extends BadRequestException {
  constructor(message?: string) {
    super(
      message ||
        'Password must be at least 8 characters long and contain at least 1 uppercase, 1 lowercase, and 1 number',
    );
  }
}
