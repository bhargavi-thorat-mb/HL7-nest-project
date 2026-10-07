import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { ObservationService } from '../observation/observation.service';
import { PatientService } from '../patient/patient.service';
import { MessageRouterController } from './message-router.controller';
import { MessageRouterService } from './message-router.service';

describe('MessageRouterController', () => {
  let controller: MessageRouterController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessageRouterController],
      providers: [
        MessageRouterService,
        ObservationService,
        PatientService,
        Hl7ParserService,
      ],
    }).compile();
    controller = module.get(MessageRouterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it.each([undefined, {}, { raw: '  ' }, { raw: 42 }])(
    'rejects body %p with 400',
    (body) => {
      expect(() =>
        controller.convert(body as { raw?: unknown } | undefined),
      ).toThrow(
        new BadRequestException('"raw" must be a non-empty HL7 string'),
      );
    },
  );
});
