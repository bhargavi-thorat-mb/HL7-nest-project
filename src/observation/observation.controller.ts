import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ObservationService } from './observation.service';
import type { OruResult } from './observation.mapper';

// Same 'hl7' prefix as before, so the URL stays /hl7/to-fhir-observation.
@Controller('hl7')
export class ObservationController {
  constructor(private readonly observationService: ObservationService) {}

  // POST /hl7/to-fhir-observation  body: { "raw": "<HL7 ORU^R01 message>" }
  @Post('to-fhir-observation')
  @HttpCode(200)
  toFhirObservation(@Body() body: { raw?: unknown } | undefined): OruResult {
    const raw = body?.raw;
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new BadRequestException('"raw" must be a non-empty HL7 string');
    }
    return this.observationService.extractOru(raw);
  }
}
