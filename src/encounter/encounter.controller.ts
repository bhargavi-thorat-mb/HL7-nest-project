import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import type { EncounterResult } from './encounter.mapper';
import { EncounterService } from './encounter.service';

@Controller('hl7')
export class EncounterController {
  constructor(private readonly encounterService: EncounterService) {}

  // POST /hl7/to-fhir-encounter  body: { "raw": "<HL7 ADT^A01-A04 message>" }
  @Post('to-fhir-encounter')
  @HttpCode(200)
  toFhirEncounter(
    @Body() body: { raw?: unknown } | undefined,
  ): EncounterResult {
    const raw = body?.raw;
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new BadRequestException('"raw" must be a non-empty HL7 string');
    }
    return this.encounterService.convertHl7ToFhirEncounter(raw);
  }
}
