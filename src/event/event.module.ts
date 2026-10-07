import { Module } from '@nestjs/common';
import { Hl7SharedModule } from '../hl7-shared/hl7-shared.module';
import { EventService } from './event.service';

// No controller: EVN data is only used inside other flows (e.g. a future ADT/Encounter module).
@Module({
  imports: [Hl7SharedModule],
  providers: [EventService],
  exports: [EventService],
})
export class EventModule {}
