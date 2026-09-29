import { Module } from '@nestjs/common';
import { Hl7Service } from './hl7.service';
import { Hl7Controller } from './hl7.controller';

@Module({
  providers: [Hl7Service],
  controllers: [Hl7Controller]
})
export class Hl7Module {}
