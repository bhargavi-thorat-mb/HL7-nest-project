import { BadRequestException, Injectable } from '@nestjs/common';
import { EventService } from '../event/event.service';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { PatientService } from '../patient/patient.service';
import { PV1_FIELD_MAP, TRIGGER_STATUS_MAP } from './encounter.field-map';
import {
  EncounterMappingError,
  mapToFhirEncounter,
  type EncounterResult,
} from './encounter.mapper';

@Injectable()
export class EncounterService {
  constructor(
    private readonly parser: Hl7ParserService,
    private readonly patientService: PatientService,
    private readonly eventService: EventService,
  ) {}

  /**
   * ADT^A01-A04 -> FHIR Patient + Encounter.
   * Error order: empty -> unparseable -> not ADT^A01-A04 -> no PID -> no PV1 -> PV1.2 empty/unknown.
   */
  convertHl7ToFhirEncounter(raw: string): EncounterResult {
    // Covers the empty and unparseable 400s (via parse) and an empty MSH.9.
    const { messageCode, triggerEvent } = this.parser.getMessageType(raw);
    const trigger = triggerEvent.trim().toUpperCase();
    if (
      messageCode.trim().toUpperCase() !== 'ADT' ||
      !(trigger in TRIGGER_STATUS_MAP)
    ) {
      throw new BadRequestException(
        `Unsupported HL7 message type "${messageCode}^${triggerEvent}" for Encounter: expected ADT^A01, ADT^A02, ADT^A03 or ADT^A04`,
      );
    }

    const patient = this.patientService.convertHl7ToFhirPatient(raw);

    const message = this.parser.parse(raw);
    this.parser.requireSegment(message, 'PV1');
    const pv1 = this.parser.readFields(message, PV1_FIELD_MAP); // PV1.2 empty -> 400

    // EVN is optional; a missing segment gives empty fields, so the dates fall back further.
    const evn = this.eventService.extractEvn(raw);

    try {
      return { patient, encounter: mapToFhirEncounter(pv1, evn, trigger) };
    } catch (err) {
      if (err instanceof EncounterMappingError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
