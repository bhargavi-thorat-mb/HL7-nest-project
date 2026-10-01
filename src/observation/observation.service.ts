import { BadRequestException, Injectable } from '@nestjs/common';
import type { Observation } from 'fhir/r4';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { PatientService } from '../patient/patient.service';
import {
  mapToFhirObservation,
  type ObrFields,
  type ObxFields,
  type OruResult,
} from './observation.mapper';

@Injectable()
export class ObservationService {
  constructor(
    private readonly parser: Hl7ParserService,
    private readonly patientService: PatientService,
  ) {}

  /**
   * ORU^R01 (lab result) -> FHIR Patient + one Observation per OBX segment.
   *
   * The Patient comes first so error order is unchanged: empty / unparseable / no PID
   * are reported before OBR/OBX problems. That call parses the text once; we parse it
   * again here to read OBR and OBX, as before. The cost is negligible.
   */
  extractOru(raw: string): OruResult {
    const patient = this.patientService.convertHl7ToFhirPatient(raw);

    const message = this.parser.parse(raw);
    this.parser.requireSegment(message, 'OBR');
    this.parser.requireSegment(message, 'OBX');

    // Assumption: the first OBR applies to every OBX. A message with several orders
    // (OBR, OBX.., OBR, OBX..) would need OBX grouped under the OBR that precedes it.
    const readMsg = (path: string) => message.get(path).toString();
    const obr: ObrFields = {
      code: readMsg('OBR.4.1'),
      display: readMsg('OBR.4.2'),
      codeSystem: readMsg('OBR.4.3'),
      observationDateTime: readMsg('OBR.7'),
    };

    // message.get('OBX.x') only ever reads the FIRST OBX. get('OBX') returns a list of all
    // OBX segments, and iterating it works even when there is only one.
    // On a single segment, get() still needs the full path ('OBX.3.1', not '3.1').
    const observations: Observation[] = [];
    for (const segment of message.get('OBX')) {
      const read = (path: string) => segment.get(path).toString();

      // OBX.2 says how to read OBX.5. Only CWE (coded value: code^text^system) is supported;
      // mapping anything else as a code would silently produce wrong data.
      const valueType = read('OBX.2');
      if (valueType !== 'CWE') {
        throw new BadRequestException(
          `Unsupported OBX value type "${valueType}" in OBX set ID ${read('OBX.1') || '?'}: only CWE is supported`,
        );
      }

      const obx: ObxFields = {
        valueType,
        code: read('OBX.3.1'),
        display: read('OBX.3.2'),
        codeSystem: read('OBX.3.3'),
        valueCode: read('OBX.5.1'),
        valueDisplay: read('OBX.5.2'),
        valueCodeSystem: read('OBX.5.3'),
        abnormalFlag: read('OBX.8'),
        observationDateTime: read('OBX.14'),
      };
      observations.push(mapToFhirObservation(obr, obx));
    }

    return { patient, observations };
  }
}
