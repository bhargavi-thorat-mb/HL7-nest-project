import { BadRequestException, Injectable } from '@nestjs/common';
import { EventService } from '../event/event.service';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { PatientService } from '../patient/patient.service';
import {
  TRIGGER_STATUS_MAP,
  TXA_FIELD_MAP,
} from './document-reference.field-map';
import {
  DocumentMappingError,
  mapToFhirDocumentReference,
  type DocumentReferenceResult,
  type ObxContent,
} from './document-reference.mapper';

@Injectable()
export class DocumentReferenceService {
  constructor(
    private readonly parser: Hl7ParserService,
    private readonly patientService: PatientService,
    private readonly eventService: EventService,
  ) {}

  /**
   * MDM^T01/T02/T11 -> FHIR Patient + DocumentReference.
   * Error order: empty -> unparseable -> not MDM^T01/T02/T11 -> no PID -> no TXA ->
   * TXA required field empty -> T02 without OBX -> unsupported OBX type -> mixed TX+ED.
   */
  convertHl7ToFhirDocumentReference(raw: string): DocumentReferenceResult {
    // Covers the empty and unparseable 400s (via parse) and an empty MSH.9.
    const { messageCode, triggerEvent } = this.parser.getMessageType(raw);
    const trigger = triggerEvent.trim().toUpperCase();
    if (
      messageCode.trim().toUpperCase() !== 'MDM' ||
      !(trigger in TRIGGER_STATUS_MAP)
    ) {
      throw new BadRequestException(
        `Unsupported HL7 message type "${messageCode}^${triggerEvent}" for DocumentReference: expected MDM^T01, MDM^T02 or MDM^T11`,
      );
    }

    const patient = this.patientService.convertHl7ToFhirPatient(raw);

    const message = this.parser.parse(raw);
    this.parser.requireSegment(message, 'TXA');
    // TXA.2, TXA.12, TXA.17 empty -> 400 naming the path.
    const txa = this.parser.readFields(message, TXA_FIELD_MAP);

    // MDM carries the document body in OBX.5; OBX.2 says how to read it.
    // No OBX -> empty list; the mapper decides whether that is allowed for the trigger.
    const contents: ObxContent[] = [];
    for (const segment of message.get('OBX')) {
      const read = (path: string) => segment.get(path).toString();
      const received = read('OBX.2');
      const valueType = received.trim().toUpperCase();
      const title = read('OBX.3.2');

      if (valueType === 'TX' || valueType === 'FT') {
        // OBX.5 can repeat (~) for multi-line text; get('OBX.5').toString() would return only
        // the first repetition, so read each one. toString() decodes the HL7 escapes.
        const repetitions = segment
          .get('OBX.5')
          .toArray()
          .map((rep) => rep.toString());
        contents.push({ valueType, title, repetitions });
      } else if (valueType === 'ED') {
        // ED = source app ^ type of data ^ data subtype ^ encoding ^ data.
        contents.push({
          valueType,
          title,
          typeOfData: read('OBX.5.2'),
          dataSubtype: read('OBX.5.3'),
          encoding: read('OBX.5.4'),
          data: read('OBX.5.5'),
        });
      } else {
        throw new BadRequestException(
          `Unsupported OBX value type "${received}" in OBX set ID ${read('OBX.1') || '?'}: expected TX, FT or ED`,
        );
      }
    }

    // EVN is optional; a missing segment gives empty fields (EVN.2 is only a date fallback).
    const evn = this.eventService.extractEvn(raw);

    try {
      return {
        patient,
        documentReference: mapToFhirDocumentReference(
          txa,
          evn,
          trigger,
          contents,
        ),
      };
    } catch (err) {
      if (err instanceof DocumentMappingError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
