import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';
import { JwtAuthGuard } from '../guards';

@Controller('geocoding')
@UseGuards(JwtAuthGuard)
export class GeocodingController {
  constructor(private geocoding: GeocodingService) {}

  @Post('address')
  geocodeAddress(@Body() body: unknown) {
    // Endpoint genérico: no modo stores_only não usa Google (só cadastro de loja).
    return this.geocoding.geocodeAddress(body, { purpose: 'other' });
  }
}
