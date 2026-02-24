import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeoRestriction } from '../../database/entities/geo-restriction.entity';
import { GeoRestrictionService } from './services/geo-restriction.service';
import { GeoIpLookupService } from './services/geoip-lookup.service';
import { GeoRestrictionController } from './controllers/geo-restriction.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GeoRestriction])],
  controllers: [GeoRestrictionController],
  providers: [GeoRestrictionService, GeoIpLookupService],
  exports: [GeoRestrictionService, GeoIpLookupService],
})
export class GeoRestrictionModule {}
