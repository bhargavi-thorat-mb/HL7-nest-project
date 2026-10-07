import { Module } from '@nestjs/common';
import { Hl7SharedModule } from '../hl7-shared/hl7-shared.module';
import { ObservationModule } from '../observation/observation.module';
import { MessageRouterController } from './message-router.controller';
import { MessageRouterService } from './message-router.service';

// Named MessageRouter* to avoid confusion with Nest's own RouterModule (@nestjs/core).
@Module({
  imports: [Hl7SharedModule, ObservationModule],
  controllers: [MessageRouterController],
  providers: [MessageRouterService],
})
export class MessageRouterModule {}
