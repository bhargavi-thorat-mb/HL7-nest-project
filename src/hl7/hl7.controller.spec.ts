import { Test, TestingModule } from '@nestjs/testing';
import { Hl7Controller } from './hl7.controller';
import { Hl7Service } from './hl7.service';

describe('Hl7Controller', () => {
  let controller: Hl7Controller;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [Hl7Controller],
      providers: [Hl7Service],
    }).compile();

    controller = module.get<Hl7Controller>(Hl7Controller);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
