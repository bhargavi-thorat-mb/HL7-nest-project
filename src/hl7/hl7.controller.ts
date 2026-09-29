import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import type { Patient } from 'fhir/r4';
import { Hl7Service } from './hl7.service';

@Controller('hl7')
export class Hl7Controller {
  constructor(private readonly hl7Service: Hl7Service) {}

  // POST /hl7/to-fhir-patient  body: { "raw": "<HL7 v2 message>" }
  @Post('to-fhir-patient')
  @HttpCode(200) // Nest defaults POST to 201, but nothing is created here
  toFhirPatient(@Body() body: { raw?: unknown } | undefined): Patient {
    // Express 5 leaves the body undefined when the request has none, hence body?.raw.
    const raw = body?.raw;
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new BadRequestException('"raw" must be a non-empty HL7 string');
    }
    return this.hl7Service.convertHl7ToFhirPatient(raw);
  }
}
