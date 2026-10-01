import { Injectable } from '@nestjs/common';
import type { Patient } from 'fhir/r4';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { mapToFhirPatient, type PidFields } from './patient.mapper';

@Injectable()
export class PatientService {
  constructor(private readonly parser: Hl7ParserService) {}

  /** Parse a raw HL7 v2 message and read the PID (Patient Identification) fields we need. */
  extractPid(raw: string): PidFields {
    const message = this.parser.parse(raw);
    this.parser.requireSegment(message, 'PID');

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
