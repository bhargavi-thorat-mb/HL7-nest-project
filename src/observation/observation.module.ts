import { Module } from '@nestjs/common';
import { Hl7SharedModule } from '../hl7-shared/hl7-shared.module';
import { PatientModule } from '../patient/patient.module';
import { ObservationController } from './observation.controller';
import { ObservationService } from './observation.service';

@Module({
  // Nest imports are not transitive: PatientModule importing Hl7SharedModule does not
  // make Hl7ParserService visible here, so it is imported directly as well.
  imports: [Hl7SharedModule, PatientModule],
  controllers: [ObservationController],
  providers: [ObservationService],
})
export class ObservationModule {}
