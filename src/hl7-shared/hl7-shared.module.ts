import { Module } from '@nestjs/common';
import { Hl7ParserService } from './hl7-parser.service';

@Module({
  providers: [Hl7ParserService],
  exports: [Hl7ParserService],
})
export class Hl7SharedModule {}
