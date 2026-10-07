import { Injectable } from '@nestjs/common';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';

/**
 * EVN (Event Type) fields, as raw HL7 strings. Positions are confirmed against
 * node-hl7-client's SEGMENT_SPECS and a parsed sample. Dates stay in HL7 format
 * (YYYYMMDD[HHMM...]); convert them with hl7DateToFhir in the Encounter mapper.
 */
export interface EvnFields {
  eventTypeCode: string; // EVN.1   - trigger event; backward-compat only in v2.5 (MSH.9.2 is authoritative)
  recordedDateTime: string; // EVN.2   - when the event was recorded (the only required EVN field)
  plannedEventDateTime: string; // EVN.3   - when a planned event is expected to happen
  eventReasonCode: string; // EVN.4.1 - reason code (HL7 table 0062)
  operatorId: string; // EVN.5.1 - ID of the person who triggered the event
  eventOccurred: string; // EVN.6   - when the event actually happened
  eventFacility: string; // EVN.7.1 - facility namespace ID
}

@Injectable()
export class EventService {
  constructor(private readonly parser: Hl7ParserService) {}

  /** Empty or unparseable input is still a 400; a missing or empty EVN is not an error. */
  extractEvn(raw: string): EvnFields {
    const message = this.parser.parse(raw);

    // No requireSegment('EVN'): when EVN is missing, get() returns an empty node, so every
    // field below reads as "". An empty segment ("EVN" or "EVN|||") reads the same way.
    const read = (path: string) => message.get(path).toString();
    return {
      eventTypeCode: read('EVN.1'),
      recordedDateTime: read('EVN.2'),
      plannedEventDateTime: read('EVN.3'),
      eventReasonCode: read('EVN.4.1'),
      operatorId: read('EVN.5.1'),
      eventOccurred: read('EVN.6'),
      eventFacility: read('EVN.7.1'),
    };
  }
}
