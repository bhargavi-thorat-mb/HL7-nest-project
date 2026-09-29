import { BadRequestException, Injectable } from '@nestjs/common';
import type { Patient } from 'fhir/r4';
import { Message } from 'node-hl7-client';
import {
  mapToFhirPatient,
  normalizeLineEndings,
  type PidFields,
} from './hl7.mapper';

@Injectable()
export class Hl7Service {
  /**
   * Parse a raw HL7 v2 message and read the PID fields we need.
   *
   * HL7 v2 structure:
   *   - segments: one per line (\r-separated), named by their first 3 chars (MSH, EVN, PID...)
   *   - fields:   separated by |       -> PID.3 is the 3rd field after "PID"
   *   - components: separated by ^     -> PID.3.4 is the 4th ^-piece of PID.3
   *   e.g. "789456^^^CH^MR" -> PID.3.1=789456, PID.3.4=CH, PID.3.5=MR
   */
  extractPid(raw: string): PidFields {
    // Check before parsing: node-hl7-client treats empty text as "build a new message", not an error.
    const text = normalizeLineEndings(raw ?? '');
    if (!text) {
      throw new BadRequestException('HL7 message is empty');
    }

    // The parser is strict (e.g. the text must start with MSH) and throws a plain Error on bad input.
    let message: Message;
    try {
      message = new Message({ text });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Could not parse HL7 message: ${reason}`);
    }

    // get() on a missing segment returns an empty node rather than throwing, so check explicitly.
    if (!message.exists('PID')) {
      throw new BadRequestException('HL7 message has no PID segment');
    }

    // PID.3 can repeat (~) to hold several IDs; only the first repetition is read here.
    const read = (path: string) => message.get(path).toString();
    return {
      id: read('PID.3.1'),
      assigningAuthority: read('PID.3.4'),
      idType: read('PID.3.5'),
      familyName: read('PID.5.1'),
      givenName: read('PID.5.2'),
      birthDate: read('PID.7'),
      sex: read('PID.8'),
    };
  }

  mapToFhirPatient(pid: PidFields): Patient {
    return mapToFhirPatient(pid);
  }

  convertHl7ToFhirPatient(raw: string): Patient {
    return this.mapToFhirPatient(this.extractPid(raw));
  }
}
