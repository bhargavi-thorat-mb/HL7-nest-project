import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocumentReferenceModule } from './document-reference/document-reference.module';
import { EncounterModule } from './encounter/encounter.module';
import { ObservationModule } from './observation/observation.module';
import { PatientModule } from './patient/patient.module';
import { MessageRouterModule } from './router/message-router.module';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'hl7-nest',
    }),
    PatientModule,
    ObservationModule,
    EncounterModule,
    DocumentReferenceModule,
    MessageRouterModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
