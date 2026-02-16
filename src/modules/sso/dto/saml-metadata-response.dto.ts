import { ApiProperty } from '@nestjs/swagger';

export class SamlMetadataResponseDto {
  @ApiProperty({ description: 'SP Entity ID' })
  entityId!: string;

  @ApiProperty({ description: 'Assertion Consumer Service URL' })
  acsUrl!: string;

  @ApiProperty({ description: 'Single Logout URL' })
  sloUrl!: string;

  @ApiProperty({ description: 'NameID format' })
  nameIdFormat!: string;

  @ApiProperty({ description: 'SP metadata XML (for IdP configuration)' })
  metadataXml!: string;
}
