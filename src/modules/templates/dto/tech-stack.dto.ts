import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional } from 'class-validator';

export class TechStackDto {
  @ApiProperty({
    description: 'Framework used in the template',
    example: 'Next.js 15',
  })
  @IsString()
  framework!: string;

  @ApiProperty({
    description: 'Programming language',
    example: 'TypeScript',
  })
  @IsString()
  language!: string;

  @ApiProperty({
    description: 'Styling framework or library',
    example: 'Tailwind CSS',
    required: false,
  })
  @IsOptional()
  @IsString()
  styling?: string;

  @ApiProperty({
    description: 'Database system',
    example: 'PostgreSQL',
    required: false,
  })
  @IsOptional()
  @IsString()
  database?: string;

  @ApiProperty({
    description: 'ORM or database toolkit',
    example: 'Prisma',
    required: false,
  })
  @IsOptional()
  @IsString()
  orm?: string;

  @ApiProperty({
    description: 'API layer technology',
    example: 'tRPC',
    required: false,
  })
  @IsOptional()
  @IsString()
  apiLayer?: string;

  @ApiProperty({
    description: 'Testing frameworks and tools',
    example: ['Jest', 'React Testing Library', 'Playwright'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  testing!: string[];

  @ApiProperty({
    description: 'Additional tools and libraries',
    example: ['NextAuth.js', 'Stripe', 'Resend (email)'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additional?: string[];
}
