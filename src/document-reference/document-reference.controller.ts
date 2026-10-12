import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import type { DocumentReferenceResult } from './document-reference.mapper';
import { DocumentReferenceService } from './document-reference.service';

@Controller('hl7')
export class DocumentReferenceController {
  constructor(
    private readonly documentReferenceService: DocumentReferenceService,
  ) {}

  // POST /hl7/to-fhir-document-reference  body: { "raw": "<HL7 MDM^T01/T02/T11 message>" }
  @Post('to-fhir-document-reference')
  @HttpCode(200)
  toFhirDocumentReference(
    @Body() body: { raw?: unknown } | undefined,
  ): DocumentReferenceResult {
    const raw = body?.raw;
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new BadRequestException('"raw" must be a non-empty HL7 string');
    }
    return this.documentReferenceService.convertHl7ToFhirDocumentReference(raw);
  }
}
