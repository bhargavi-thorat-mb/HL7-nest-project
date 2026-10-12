import { Module } from '@nestjs/common';
import { EventModule } from '../event/event.module';
import { Hl7SharedModule } from '../hl7-shared/hl7-shared.module';
import { PatientModule } from '../patient/patient.module';
import { DocumentReferenceController } from './document-reference.controller';
import { DocumentReferenceService } from './document-reference.service';

@Module({
  imports: [Hl7SharedModule, PatientModule, EventModule],
  controllers: [DocumentReferenceController],
  providers: [DocumentReferenceService],
  // Exported so MessageRouterModule can dispatch MDM^T01/T02/T11 to it.
  exports: [DocumentReferenceService],
})
export class DocumentReferenceModule {}
