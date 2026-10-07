import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from '../event/event.service';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { PatientService } from '../patient/patient.service';
import { EncounterController } from './encounter.controller';
import { EncounterService } from './encounter.service';

describe('EncounterController', () => {
  let controller: EncounterController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EncounterController],
      providers: [
        EncounterService,
        PatientService,
        EventService,
        Hl7ParserService,
      ],
    }).compile();
    controller = module.get(EncounterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it.each([undefined, {}, { raw: '  ' }, { raw: 42 }])(
    'rejects body %p with 400',
    (body) => {
      expect(() =>
        controller.toFhirEncounter(body as { raw?: unknown } | undefined),
      ).toThrow(
        new BadRequestException('"raw" must be a non-empty HL7 string'),
      );
    },
  );
});
