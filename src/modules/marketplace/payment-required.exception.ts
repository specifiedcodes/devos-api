/**
 * PaymentRequiredException
 *
 * Story 18-9: Agent Revenue Sharing
 *
 * Custom exception for when a paid agent requires purchase before installation.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export class PaymentRequiredException extends HttpException {
  constructor(message: string = 'Payment required to access this resource') {
    super(message, HttpStatus.PAYMENT_REQUIRED);
  }
}
