import { Test, TestingModule } from '@nestjs/testing';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { PatientService } from '../patient/patient.service';
import { ObservationController } from './observation.controller';
import { ObservationService } from './observation.service';

describe('ObservationController', () => {
  let controller: ObservationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ObservationController],
      providers: [ObservationService, PatientService, Hl7ParserService],
    }).compile();

    controller = module.get<ObservationController>(ObservationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
