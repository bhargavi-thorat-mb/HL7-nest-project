import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from '../event/event.service';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { PatientService } from '../patient/patient.service';
import { DocumentReferenceController } from './document-reference.controller';
import { DocumentReferenceService } from './document-reference.service';

describe('DocumentReferenceController', () => {
  let controller: DocumentReferenceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentReferenceController],
      providers: [
        DocumentReferenceService,
        PatientService,
        EventService,
        Hl7ParserService,
      ],
    }).compile();
    controller = module.get(DocumentReferenceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it.each([undefined, {}, { raw: '  ' }, { raw: 42 }])(
    'rejects body %p with 400',
    (body) => {
      expect(() =>
        controller.toFhirDocumentReference(
          body as { raw?: unknown } | undefined,
        ),
      ).toThrow(
        new BadRequestException('"raw" must be a non-empty HL7 string'),
      );
    },
  );
});
