import { Module } from '@nestjs/common';
import { Hl7SharedModule } from '../hl7-shared/hl7-shared.module';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';

@Module({
  imports: [Hl7SharedModule],
  controllers: [PatientController],
  providers: [PatientService],
  // Exported so ObservationModule can inject PatientService.
  exports: [PatientService],
})
export class PatientModule {}
