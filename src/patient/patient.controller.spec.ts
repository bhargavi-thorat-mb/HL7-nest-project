import { Test, TestingModule } from '@nestjs/testing';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';

describe('PatientController', () => {
  let controller: PatientController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PatientController],
      providers: [PatientService, Hl7ParserService],
    }).compile();

    controller = module.get<PatientController>(PatientController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
