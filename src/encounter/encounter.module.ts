import { Module } from '@nestjs/common';
import { EventModule } from '../event/event.module';
import { Hl7SharedModule } from '../hl7-shared/hl7-shared.module';
import { PatientModule } from '../patient/patient.module';
import { EncounterController } from './encounter.controller';
import { EncounterService } from './encounter.service';

@Module({
  imports: [Hl7SharedModule, PatientModule, EventModule],
  controllers: [EncounterController],
  providers: [EncounterService],
  // Exported so MessageRouterModule can dispatch ADT^A01-A04 to it.
  exports: [EncounterService],
})
export class EncounterModule {}
