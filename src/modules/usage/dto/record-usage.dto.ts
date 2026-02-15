import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
  MaxLength,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { ApiProvider } from '../../../database/entities/api-usage.entity';

/**
 * Custom validator to ensure at least one token count is greater than 0
 */
function IsAtLeastOneTokenPresent(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isAtLeastOneTokenPresent',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const dto = args.object as RecordUsageDto;
          return dto.inputTokens > 0 || dto.outputTokens > 0;
        },
        defaultMessage(args: ValidationArguments) {
          return 'At least one of inputTokens or outputTokens must be greater than 0';
        },
      },
    });
  };
}

/**
 * DTO for recording API usage
 */
export class RecordUsageDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsUUID()
  byokKeyId?: string;

  @IsEnum(ApiProvider)
  provider!: ApiProvider;

  @IsString()
  model!: string;

  @IsInt({ message: 'inputTokens must be an integer' })
  @Min(0, { message: 'inputTokens must be non-negative' })
  @Max(10_000_000, { message: 'inputTokens cannot exceed 10 million' })
  @IsAtLeastOneTokenPresent()
  inputTokens!: number;

  @IsInt({ message: 'outputTokens must be an integer' })
  @Min(0, { message: 'outputTokens must be non-negative' })
  @Max(10_000_000, { message: 'outputTokens cannot exceed 10 million' })
  outputTokens!: number;

  @IsOptional()
  @IsInt({ message: 'cachedTokens must be an integer' })
  @Min(0, { message: 'cachedTokens must be non-negative' })
  @Max(10_000_000, { message: 'cachedTokens cannot exceed 10 million' })
  cachedTokens?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taskType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  routingReason?: string;
}
