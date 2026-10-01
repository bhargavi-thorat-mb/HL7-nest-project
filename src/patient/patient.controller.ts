import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import type { Patient } from 'fhir/r4';
import { PatientService } from './patient.service';

// Same 'hl7' prefix as before, so the URL stays /hl7/to-fhir-patient.
@Controller('hl7')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  // POST /hl7/to-fhir-patient  body: { "raw": "<HL7 v2 message>" }
  @Post('to-fhir-patient')
  @HttpCode(200) // Nest defaults POST to 201, but nothing is created here
  toFhirPatient(@Body() body: { raw?: unknown } | undefined): Patient {
    // Express 5 leaves the body undefined when the request has none, hence body?.raw.
    const raw = body?.raw;
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new BadRequestException('"raw" must be a non-empty HL7 string');
    }
    return this.patientService.convertHl7ToFhirPatient(raw);
  }
}
