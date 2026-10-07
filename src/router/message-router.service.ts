import {
  BadRequestException,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import type { OruResult } from '../observation/observation.mapper';
import { ObservationService } from '../observation/observation.service';

// Message types /hl7/convert recognizes, as MSH.9.1^MSH.9.2.
export const SUPPORTED_MESSAGE_TYPES = [
  'ORU^R01', // unsolicited observation result
  'ADT^A01', // admit
  'ADT^A02', // transfer
  'ADT^A03', // discharge
  'ADT^A04', // register outpatient
];

@Injectable()
export class MessageRouterService {
  constructor(
    private readonly parser: Hl7ParserService,
    private readonly observationService: ObservationService,
  ) {}

  /** Pick the conversion flow from MSH.9 (message code ^ trigger event). */
  convert(raw: string): OruResult {
    const received = this.parser.getMessageType(raw);
    // Senders vary in case and padding, so normalize before matching.
    const type = `${received.messageCode.trim().toUpperCase()}^${received.triggerEvent.trim().toUpperCase()}`;

    switch (type) {
      case 'ORU^R01':
        return this.observationService.extractOru(raw);
      case 'ADT^A01':
      case 'ADT^A02':
      case 'ADT^A03':
      case 'ADT^A04':
        throw new NotImplementedException('ADT handling not implemented yet');
      default:
        // Show the value as received, so the sender can see exactly what they sent.
        throw new BadRequestException(
          `Unsupported HL7 message type "${received.messageCode}^${received.triggerEvent}". ` +
            `Supported types: ${SUPPORTED_MESSAGE_TYPES.join(', ')}`,
        );
    }
  }
}
